import { supabase } from '../lib/supabase'
import { calculateHours, getWorkWeekRange } from '../lib/time'

export type TimeEntry = {
  id: number
  project_id: number
  user_id: string | null
  user_name: string | null
  clock_in_time: string | null
  clock_out_time: string | null
  created_at: string
}

export type Project = {
  id: number
  name: string
}

export type WorkerSummary = {
  userId: string
  userName: string
  totalHours: number
  isClockedIn: boolean
  currentProjectName: string | null
}

export type ManagerSummaryData = {
  userRole: string
  projects: Project[]
  timeEntries: TimeEntry[]
  weekStart: Date
  weekEnd: Date
}

async function requireSessionUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    throw new Error('You must be signed in.')
  }

  return session.user
}

export async function loadManagerSummaryData(): Promise<ManagerSummaryData> {
  const user = await requireSessionUser()

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError) {
    throw new Error(profileError.message)
  }

  const userRole = profileData?.role || 'worker'
  const { weekStart, weekEnd } = getWorkWeekRange()

  if (userRole !== 'manager') {
    return {
      userRole,
      projects: [],
      timeEntries: [],
      weekStart,
      weekEnd,
    }
  }

  const [projectsResult, timeEntriesResult] = await Promise.all([
    supabase.from('projects').select('id, name'),
    supabase
      .from('time_entries')
      .select('*')
      .gte('clock_in_time', weekStart.toISOString())
      .lte('clock_in_time', weekEnd.toISOString())
      .order('clock_in_time', { ascending: false }),
  ])

  if (projectsResult.error) {
    throw new Error(projectsResult.error.message)
  }

  if (timeEntriesResult.error) {
    throw new Error(timeEntriesResult.error.message)
  }

  return {
    userRole,
    projects: projectsResult.data || [],
    timeEntries: timeEntriesResult.data || [],
    weekStart,
    weekEnd,
  }
}

function getProjectName(projects: Project[], projectId: number) {
  const project = projects.find((project) => project.id === projectId)
  return project?.name || `Project ${projectId}`
}

export function buildWorkerSummaries(
  timeEntries: TimeEntry[],
  projects: Project[]
): WorkerSummary[] {
  const grouped: Record<string, WorkerSummary> = {}

  for (const entry of timeEntries) {
    if (!entry.user_id) continue

    if (!grouped[entry.user_id]) {
      grouped[entry.user_id] = {
        userId: entry.user_id,
        userName: entry.user_name || 'Unknown',
        totalHours: 0,
        isClockedIn: false,
        currentProjectName: null,
      }
    }

    grouped[entry.user_id].totalHours += calculateHours(
      entry.clock_in_time,
      entry.clock_out_time
    )

    if (!entry.clock_out_time) {
      grouped[entry.user_id].isClockedIn = true
      grouped[entry.user_id].currentProjectName = getProjectName(
        projects,
        entry.project_id
      )
    }
  }

  return Object.values(grouped).sort((a, b) => b.totalHours - a.totalHours)
}

export function formatHours(hours: number) {
  return hours.toFixed(2)
}