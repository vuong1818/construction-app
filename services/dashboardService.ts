import { supabase } from '../lib/supabase'
import { OffsiteReason } from '../lib/clockLocation'
import { getTodayRange, getWorkWeekRange } from '../lib/time'
import { isOnline, queueClockIn } from '../lib/syncQueue'
import {
  getUserFullName,
  getUserProfile,
  requireSessionUser,
  signOutLocal,
} from './authService'

export type ClockLocationPayload = {
  lat: number | null
  lng: number | null
  snapshotUrl: string | null
  offsite: boolean
  offsiteReason: OffsiteReason | null
  offsiteNote: string | null
}

// keep your existing types

export async function loadDashboardData(
  previousSelectedProjectId?: number | null
) {
  const user = await requireSessionUser()
  const profile = (await getUserProfile(user.id)) ?? {
    full_name: null,
    role: null,
  }

  const projectsResult = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  if (projectsResult.error) {
    throw new Error(projectsResult.error.message)
  }

  const projects = projectsResult.data || []
  const selectedProjectId =
    previousSelectedProjectId &&
    projects.some((project) => project.id === previousSelectedProjectId)
      ? previousSelectedProjectId
      : projects[0]?.id ?? null

  const { weekStart, weekEnd } = getWorkWeekRange()

  const weeklyResult = await supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', user.id)
    .gte('clock_in_time', weekStart.toISOString())
    .lte('clock_in_time', weekEnd.toISOString())
    .order('clock_in_time', { ascending: false })

  if (weeklyResult.error) {
    throw new Error(weeklyResult.error.message)
  }

  const activeResult = await supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', user.id)
    .is('clock_out_time', null)
    .order('created_at', { ascending: false })
    .limit(1)

  if (activeResult.error) {
    throw new Error(activeResult.error.message)
  }

  const { start, end } = getTodayRange()
  const todayResult = await supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', user.id)
    .gte('clock_in_time', start.toISOString())
    .lte('clock_in_time', end.toISOString())
    .order('clock_in_time', { ascending: false })
    .limit(1)

  if (todayResult.error) {
    throw new Error(todayResult.error.message)
  }

  return {
    profile,
    projects,
    weeklyTimeEntries: weeklyResult.data || [],
    activeEntry: activeResult.data?.[0] || null,
    todayEntry: todayResult.data?.[0] || null,
    selectedProjectId,
  }
}

// Returns { queued: true } when the device is offline and the clock-in
// was stashed in the local sync queue (will replay automatically when
// connectivity returns). Returns { queued: false } when the row hit
// the server immediately. Throws only on non-network errors (RLS
// rejection, validation, etc.) — those can't be fixed by waiting.
export async function clockIn(
  projectId: number,
  location: ClockLocationPayload,
): Promise<{ queued: boolean }> {
  const user = await requireSessionUser()
  const userName = await getUserFullName(user.id)

  // The clock_in_time honors the device clock at the moment the worker
  // tapped Clock In, NOT the moment the row reaches the server. That's
  // the whole point of the queue — a worker on a no-signal jobsite
  // clocked in at 7:00am, even if the row syncs at 9:30am when they
  // get to lunch.
  const payload = {
    project_id: projectId,
    user_id: user.id,
    user_name: userName,
    clock_in_time: new Date().toISOString(),
    clock_in_lat: location.lat,
    clock_in_lng: location.lng,
    clock_in_snapshot_url: location.snapshotUrl,
    clock_in_offsite: location.offsite,
    clock_in_offsite_reason: location.offsiteReason,
    clock_in_offsite_note: location.offsiteNote,
  }

  const online = await isOnline()
  if (!online) {
    await queueClockIn(payload)
    return { queued: true }
  }

  const { error } = await supabase.from('time_entries').insert(payload)
  if (error) {
    // Fetch failures from supabase-js surface as { error: { message: '...' } }.
    // If the message looks network-shaped, fall back to the queue rather
    // than failing the user — they'll see the same "queued, will sync"
    // confirmation as the offline path.
    const msg = (error.message || '').toLowerCase()
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
      await queueClockIn(payload)
      return { queued: true }
    }
    throw new Error(error.message)
  }
  return { queued: false }
}

export async function clockOut(timeEntryId: number, location: ClockLocationPayload) {
  const { error } = await supabase
    .from('time_entries')
    .update({
      clock_out_time: new Date().toISOString(),
      clock_out_lat: location.lat,
      clock_out_lng: location.lng,
      clock_out_snapshot_url: location.snapshotUrl,
      clock_out_offsite: location.offsite,
      clock_out_offsite_reason: location.offsiteReason,
      clock_out_offsite_note: location.offsiteNote,
    })
    .eq('id', timeEntryId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function logoutAndClockOutIfNeeded(activeEntryId?: number | null) {
  if (activeEntryId) {
    // Best-effort clock-out on logout — no location capture (background, no UI).
    await clockOut(activeEntryId, {
      lat: null, lng: null, snapshotUrl: null,
      offsite: false, offsiteReason: null, offsiteNote: null,
    })
  }

  await signOutLocal()
}

