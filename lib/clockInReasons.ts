// Loads the manager-editable off-site clock-in reason list from supabase
// and caches it in AsyncStorage so the picker still works on a no-signal
// jobsite. Mirrors what the web app exposes in Settings → Lists.

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const CACHE_KEY = 'clock_in_reasons_v1'

export type ClockInReason = {
  value: string
  label: string
  sort_order: number
}

// Local fallback used when AsyncStorage is empty AND the network query
// fails — e.g. brand-new install offline. Matches the seed in
// migration 0027 so a worker can still pick a reason on day one.
const FALLBACK: ClockInReason[] = [
  { value: 'jobsite_change',    label: 'Jobsite Change',      sort_order: 10 },
  { value: 'supply_pickup',     label: 'Supply Pickup',       sort_order: 20 },
  { value: 'office_yard',       label: 'Office / Yard',       sort_order: 30 },
  { value: 'inspection_permit', label: 'Inspection / Permit', sort_order: 40 },
  { value: 'traveling',         label: 'Traveling',           sort_order: 50 },
  { value: 'other',             label: 'Other',               sort_order: 60 },
]

async function readCache(): Promise<ClockInReason[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function writeCache(reasons: ClockInReason[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(reasons))
  } catch {
    /* best-effort cache; ignore failures */
  }
}

async function fetchFromServer(): Promise<ClockInReason[] | null> {
  const { data, error } = await supabase
    .from('clock_in_reasons')
    .select('value, label, sort_order, deleted_at')
    .is('deleted_at', null)
    .order('sort_order')
  if (error || !data) return null
  return data.map((r) => ({
    value: r.value,
    label: r.label,
    sort_order: r.sort_order ?? 0,
  }))
}

// Hook: returns the active reason list. Hydrates from cache instantly,
// then refreshes from the server in the background. The picker is
// always populated, even on a fresh-install / first-tap scenario.
export function useClockInReasons(): ClockInReason[] {
  const [reasons, setReasons] = useState<ClockInReason[]>(FALLBACK)

  useEffect(() => {
    let active = true
    ;(async () => {
      const cached = await readCache()
      if (active && cached && cached.length > 0) setReasons(cached)
      const fresh = await fetchFromServer()
      if (active && fresh && fresh.length > 0) {
        setReasons(fresh)
        writeCache(fresh) // best-effort
      }
    })()
    return () => {
      active = false
    }
  }, [])

  return reasons
}

// Resolve a slug → label using the cached list. Used to render historical
// time entries whose reason might be a legacy soft-deleted slug.
export function labelForReason(value: string | null, reasons: ClockInReason[]): string {
  if (!value) return ''
  const hit = reasons.find((r) => r.value === value)
  return hit ? hit.label : value
}
