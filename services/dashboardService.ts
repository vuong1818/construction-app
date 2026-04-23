import * as Location from 'expo-location'
import { supabase } from '../lib/supabase'
import { calculateHours, getTodayRange, getWorkWeekRange } from '../lib/time'
import {
  getUserFullName,
  getUserProfile,
  requireSessionUser,
  signOutLocal,
} from './authService'

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

async function requireLocation() {
  const permission = await Location.requestForegroundPermissionsAsync()

  if (permission.status !== 'granted') {
    throw new Error('Please allow location access.')
  }

  return Location.getCurrentPositionAsync({})
}

export async function clockIn(projectId: number) {
  const user = await requireSessionUser()
  const position = await requireLocation()
  const userName = await getUserFullName(user.id)

  const { error } = await supabase.from('time_entries').insert({
    project_id: projectId,
    user_id: user.id,
    user_name: userName,
    clock_in_time: new Date().toISOString(),
    clock_in_lat: position.coords.latitude,
    clock_in_lng: position.coords.longitude,
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function clockOut(timeEntryId: number) {
  const position = await requireLocation()

  const { error } = await supabase
    .from('time_entries')
    .update({
      clock_out_time: new Date().toISOString(),
      clock_out_lat: position.coords.latitude,
      clock_out_lng: position.coords.longitude,
    })
    .eq('id', timeEntryId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function logoutAndClockOutIfNeeded(activeEntryId?: number | null) {
  if (activeEntryId) {
    await clockOut(activeEntryId)
  }

  await signOutLocal()
}

export function getWeeklyTotalHours(entries: TimeEntry[]) {
  return entries.reduce((total, entry) => {
    return total + calculateHours(entry.clock_in_time, entry.clock_out_time)
  }, 0)
}