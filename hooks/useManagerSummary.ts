import { useEffect, useMemo, useState } from 'react'
import {
  buildWorkerSummaries,
  formatHours,
  loadManagerSummaryData,
  Project,
  TimeEntry,
  WorkerSummary,
} from '../services/managerSummaryService'

type UseManagerSummaryResult = {
  timeEntries: TimeEntry[]
  projects: Project[]
  userRole: string
  loading: boolean
  errorMessage: string
  weekStart: Date | null
  weekEnd: Date | null
  workerSummaries: WorkerSummary[]
  refresh: () => Promise<void>
  formatHours: (hours: number) => string
}

export function useManagerSummary(): UseManagerSummaryResult {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [userRole, setUserRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [weekStart, setWeekStart] = useState<Date | null>(null)
  const [weekEnd, setWeekEnd] = useState<Date | null>(null)

  async function refresh() {
    setLoading(true)
    setErrorMessage('')

    try {
      const data = await loadManagerSummaryData()
      setUserRole(data.userRole)
      setProjects(data.projects)
      setTimeEntries(data.timeEntries)
      setWeekStart(data.weekStart)
      setWeekEnd(data.weekEnd)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to load manager summary.')
      setProjects([])
      setTimeEntries([])
      setUserRole('')
      setWeekStart(null)
      setWeekEnd(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const workerSummaries = useMemo(() => {
    return buildWorkerSummaries(timeEntries, projects)
  }, [timeEntries, projects])

  return {
    timeEntries,
    projects,
    userRole,
    loading,
    errorMessage,
    weekStart,
    weekEnd,
    workerSummaries,
    refresh,
    formatHours,
  }
}