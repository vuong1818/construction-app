// Forward geocoding via Mapbox (mobile).
// Uses the same EXPO_PUBLIC_MAPBOX_TOKEN as clock-in snapshots.

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''

export type GeocodeResult = {
  lat: number
  lng: number
  placeName: string
}

/**
 * Forward-geocode an address to lat/lng using Mapbox Geocoding API.
 * Throws on empty input, missing token, network failure, or no match.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  if (!MAPBOX_TOKEN) {
    throw new Error('Mapbox token not configured. Set EXPO_PUBLIC_MAPBOX_TOKEN in .env.')
  }
  const trimmed = (address || '').trim()
  if (!trimmed) throw new Error('Please enter an address first.')

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json` +
    `?access_token=${MAPBOX_TOKEN}` +
    `&limit=1` +
    `&country=us`

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Mapbox geocoding failed (HTTP ${resp.status}).`)
  const data = await resp.json()
  if (!data.features?.length) throw new Error('No location found for that address.')

  const [lng, lat] = data.features[0].center
  const placeName: string = data.features[0].place_name || trimmed
  return { lat, lng, placeName }
}

// Conversion helpers — DB stores meters; UI displays miles.
export const METERS_PER_MILE = 1609.344
export function metersToMiles(m: number | null | undefined): number | null {
  if (m == null) return null
  return Number(m) / METERS_PER_MILE
}
export function milesToMeters(mi: number | string | null | undefined): number | null {
  if (mi == null || mi === '') return null
  const n = Number(mi)
  if (!Number.isFinite(n)) return null
  return Math.round(n * METERS_PER_MILE)
}
