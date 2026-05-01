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
 * Compare worker location to the project's geofence.
 * If the project has no lat/lng configured, returns inside=true and distance=null.
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

export type OffsiteReason = 'supply_store' | 'gas' | 'other'

export const OFFSITE_REASON_LABELS: Record<OffsiteReason, string> = {
  supply_store: 'Supply Store',
  gas: 'Gas',
  other: 'Other',
}
