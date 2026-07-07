import * as Location from 'expo-location'
import { supabase } from './supabase'

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''
const MAP_STYLE = 'mapbox/streets-v12'
const MAP_SIZE = '600x400@2x'   // ~1200x800 actual pixels (Retina)
const MAP_ZOOM = 16
const SNAPSHOT_BUCKET = 'time-entry-snapshots'

const DEFAULT_GEOFENCE_METERS = 805  // 0.5 mi

export type CapturedLocation = {
  lat: number
  lng: number
  capturedAt: string
  snapshotUrl: string | null
}

export type GeofenceCheck = {
  inside: boolean
  distanceMeters: number | null   // null when project has no lat/lng configured
}

export class LocationDeniedError extends Error {
  constructor() {
    super('Location permission denied. Please allow location access.')
    this.name = 'LocationDeniedError'
  }
}

// Bounded race so a hung underlying call (slow GPS lock, dead network)
// doesn't pin the UI forever. The clock-in modal previously sat on these
// awaits with no timeout and never dismissed.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  }) as Promise<T>
}

/**
 * Request foreground location permission and read the current GPS position.
 * Throws LocationDeniedError if the user refused permission.
 *
 * Falls back to the last-known position if a fresh fix doesn't arrive
 * within 8 seconds (common when indoors or with weak signal).
 */
export async function readCurrentLocation(): Promise<{ lat: number; lng: number }> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') throw new LocationDeniedError()

  try {
    const pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      8000,
      'GPS fix',
    )
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch {
    const last = await Location.getLastKnownPositionAsync()
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude }
    throw new Error('Could not determine your location. Try again with a clearer view of the sky.')
  }
}

/**
 * Build the URL of a Mapbox static map image showing a pin at the given coords.
 * Returns null if no Mapbox token is configured.
 */
export function buildMapboxStaticUrl(lat: number, lng: number): string | null {
  if (!MAPBOX_TOKEN) return null
  // pin-l = large pin, ed1c24 = red. Mapbox accepts lng,lat order in path.
  return `https://api.mapbox.com/styles/v1/${MAP_STYLE}/static/pin-l+ed1c24(${lng},${lat})/${lng},${lat},${MAP_ZOOM},0/${MAP_SIZE}?access_token=${MAPBOX_TOKEN}`
}

/**
 * Fetch a Mapbox static map snapshot, upload it to Supabase Storage, return the public URL.
 * Returns null on any failure — snapshots are optional, clock-in must not block.
 *
 * Storage path: <userId>/<timeEntryUuid-or-timestamp>.jpg
 * The bucket policy (migration 0004) only lets a user upload to their own folder.
 */
export async function captureMapSnapshot(params: {
  userId: string
  lat: number
  lng: number
  kind: 'in' | 'out'   // for filename only
}): Promise<string | null> {
  const { userId, lat, lng, kind } = params

  const mapUrl = buildMapboxStaticUrl(lat, lng)
  if (!mapUrl) return null

  try {
    const resp = await withTimeout(fetch(mapUrl), 5000, 'Map snapshot fetch')
    if (!resp.ok) return null
    const arrayBuffer = await resp.arrayBuffer()

    const filename = `${userId}/${Date.now()}-${kind}.jpg`
    const { error: uploadErr } = await withTimeout(
      supabase.storage
        .from(SNAPSHOT_BUCKET)
        .upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: false }),
      8000,
      'Snapshot upload',
    )
    if (uploadErr) return null

    const { data } = supabase.storage.from(SNAPSHOT_BUCKET).getPublicUrl(filename)
    return data?.publicUrl || null
  } catch {
    return null
  }
}

function toRadians(deg: number) { return deg * Math.PI / 180 }

/** Haversine distance between two coordinates in meters. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Actual road/driving distance in meters between two points, via the Mapbox
 * Directions API (free up to ~100k requests/month — reuses the existing token).
 * Returns null on any failure so callers can fall back to straight-line.
 */
export async function drivingDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): Promise<number | null> {
  if (!MAPBOX_TOKEN) return null
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${lng1},${lat1};${lng2},${lat2}?access_token=${MAPBOX_TOKEN}&overview=false`
    const res = await withTimeout(fetch(url), 6000, 'Directions')
    if (!res.ok) return null
    const json = await res.json()
    const d = json?.routes?.[0]?.distance
    return typeof d === 'number' ? d : null
  } catch {
    return null
  }
}

/**
 * Compare worker location to the project's geofence.
 * If the project has no lat/lng configured, returns inside=true and distance=null
 * (radius check skipped) — the out-of-state check (see stateForLocation) still
 * applies, so a job in another state is caught even without a pin.
 */
export function checkGeofence(
  workerLat: number,
  workerLng: number,
  project: { latitude: number | null; longitude: number | null; geofence_radius_meters?: number | null },
): GeofenceCheck {
  if (project.latitude == null || project.longitude == null) {
    return { inside: true, distanceMeters: null }
  }
  const radius = project.geofence_radius_meters ?? DEFAULT_GEOFENCE_METERS
  const distance = distanceMeters(workerLat, workerLng, project.latitude, project.longitude)
  return { inside: distance <= radius, distanceMeters: distance }
}

// ── Out-of-state detection ───────────────────────────────────────────────────
// A geofence is only as good as the pin on the project. If the pin is wrong
// (e.g. set to the office while the job is in another state), the radius check
// passes at home. Comparing the worker's *actual* state to the project's state
// catches that regardless of the pin.

const STATE_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
}

/** Normalize a state name or code to a 2-letter US code, or null if unknown. */
export function normalizeState(s: string | null | undefined): string | null {
  if (!s) return null
  const t = String(s).trim()
  if (!t) return null
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase()
  return STATE_ABBR[t.toLowerCase()] ?? null
}

/**
 * Best-effort 2-letter US state for a coordinate via the device geocoder.
 * Returns null on failure — callers treat "unknown" as NOT out-of-state so a
 * geocoder hiccup never produces a false off-site prompt.
 */
export async function stateForLocation(lat: number, lng: number): Promise<string | null> {
  try {
    const results = await withTimeout(
      Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }),
      6000,
      'Reverse geocode',
    )
    return normalizeState(results?.[0]?.region ?? null)
  } catch {
    return null
  }
}

// Off-site clock-in/out reason slugs are now manager-editable from the
// web app's Settings → Lists. The mobile picker fetches the active list
// at sign-in and caches it in AsyncStorage so it still works offline.
// See lib/clockInReasons.ts.
export type OffsiteReason = string
