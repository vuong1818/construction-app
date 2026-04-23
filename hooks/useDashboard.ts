import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { Language, t } from '../lib/i18n'
import { getSavedLanguage, saveLanguage } from '../lib/language'
import { getWorkWeekRange } from '../lib/time'
import {
    Profile,
    Project,
    TimeEntry,
    clockIn,
    clockOut,
    getWeeklyTotalHours,
    loadDashboardData,
    logoutAndClockOutIfNeeded,
} from '../services/dashboardService'

type UseDashboardResult = {
  language: Language
  profile: Profile | null
  projects: Project[]
  weeklyTimeEntries: TimeEntry[]
  activeEntry: TimeEntry | null
  todayEntry: TimeEntry | null
  selectedProjectId: number | null
  loading: boolean
  clocking: boolean
  errorMessage: string
  weekStart: Date
  weekEnd: Date
  weeklyTotalHours: number
  setSelectedProjectId: (value: number | null) => void
  toggleLanguage: () => Promise<void>
  refresh: () => Promise<void>
  handleClockIn: () => Promise<boolean>
  handleClockOut: () => Promise<boolean>
  handleLogout: (onLoggedOut: () => void) => void
}

export function useDashboard(): UseDashboardResult {
  const [language, setLanguage] = useState<Language>('en')
  const [projects, setProjects] = useState<Project[]>([])
  const [weeklyTimeEntries, setWeeklyTimeEntries] = useState<TimeEntry[]>([])
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null)
  const [todayEntry, setTodayEntry] = useState<TimeEntry | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [clocking, setClocking] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const { weekStart, weekEnd } = useMemo(() => getWorkWeekRange(), [])
  const weeklyTotalHours = useMemo(
    () => getWeeklyTotalHours(weeklyTimeEntries),
    [weeklyTimeEntries]
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      const data = await loadDashboardData(selectedProjectId)
      setProfile(data.profile)
      setProjects(data.projects)
      setWeeklyTimeEntries(data.weeklyTimeEntries)
      setActiveEntry(data.activeEntry)
      setTodayEntry(data.todayEntry)
      setSelectedProjectId(data.selectedProjectId)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to load home screen.')
    } finally {
      setLoading(false)
    }
  }, [selectedProjectId])

  useEffect(() => {
    getSavedLanguage().then(setLanguage)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function toggleLanguage() {
    const next = language === 'en' ? 'es' : 'en'
    setLanguage(next)
    await saveLanguage(next)
  }

  async function handleClockIn() {
    if (!selectedProjectId) {
      Alert.alert(t(language, 'error'), t(language, 'selectAProject'))
      return false
    }

    if (activeEntry && !activeEntry.clock_out_time) {
      Alert.alert(t(language, 'error'), t(language, 'alreadyClockedIn'))
      return false
    }

    try {
      setClocking(true)
      await clockIn(selectedProjectId)
      await refresh()
      Alert.alert(t(language, 'success'), t(language, 'clockedInSuccessfully'))
      return true
    } catch (error: any) {
      Alert.alert(t(language, 'error'), error?.message || 'Something went wrong')
      return false
    } finally {
      setClocking(false)
    }
  }

  async function handleClockOut() {
    if (!activeEntry?.id) {
      Alert.alert(t(language, 'error'), 'No active clock-in found.')
      return false
    }

    try {
      setClocking(true)
      await clockOut(activeEntry.id)
      await refresh()
      Alert.alert(t(language, 'success'), t(language, 'clockedOutSuccessfully'))
      return true
    } catch (error: any) {
      Alert.alert(t(language, 'error'), error?.message || 'Something went wrong')
      return false
    } finally {
      setClocking(false)
    }
  }

  function handleLogout(onLoggedOut: () => void) {
    const message =
      activeEntry && !activeEntry.clock_out_time
        ? t(language, 'logoutClockedIn')
        : t(language, 'logoutConfirm')

    Alert.alert(t(language, 'logout'), message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: t(language, 'logout'),
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true)
            await logoutAndClockOutIfNeeded(activeEntry?.id)
            onLoggedOut()
          } catch (error: any) {
            Alert.alert(
              t(language, 'logoutError'),
              error?.message || 'Could not log out.'
            )
          } finally {
            setLoading(false)
          }
        },
      },
    ])
  }

  return {
    language,
    profile,
    projects,
    weeklyTimeEntries,
    activeEntry,
    todayEntry,
    selectedProjectId,
    loading,
    clocking,
    errorMessage,
    weekStart,
    weekEnd,
    weeklyTotalHours,
    setSelectedProjectId,
    toggleLanguage,
    refresh,
    handleClockIn,
    handleClockOut,
    handleLogout,
  }
}