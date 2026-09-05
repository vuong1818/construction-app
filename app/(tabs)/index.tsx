import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { Picker } from '@react-native-picker/picker'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BuildInfoLine } from '../../components/BuildInfo'
import { logError } from '../../lib/logger'
import { SkeletonBlock, SkeletonList } from '../../components/SkeletonCard'
import { useCompanyLogo } from '../../hooks/useCompanyLogo'
import { useRealtimeRefetch } from '../../hooks/useRealtimeRefetch'
import {
  captureMapSnapshot,
  checkGeofence,
  LocationDeniedError,
  normalizeState,
  OffsiteReason,
  readCurrentLocation,
  stateForLocation,
} from '../../lib/clockLocation'
import { useClockInReasons } from '../../lib/clockInReasons'
import { LANGUAGES, t, useLanguage } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { canStock } from '../../lib/roles'
import { clockIn as svcClockIn, clockOut as svcClockOut, switchProject as svcSwitchProject } from '../../services/dashboardService'
import { drainQueue, startAutoDrain, subscribePending } from '../../lib/syncQueue'
import { COLORS } from '../../lib/theme'
import TravelCard from '../../components/TravelCard'


type Project = {
  id: number
  name: string
  address: string | null
  status: string | null
  description: string | null
  latitude?: number | null
  longitude?: number | null
  geofence_radius_meters?: number | null
  state?: string | null
}

type OffsitePromptState = {
  kind: 'in' | 'out' | 'switch'
  switchToProjectId?: number   // 'switch' only — the project being moved to
  distance: number | null   // null = project has no set job-site location
  outOfState?: boolean      // true when triggered by a state mismatch
  projectState?: string | null
  workerState?: string | null
  projectName: string
  payload: { lat: number; lng: number; snapshotUrl: string | null }
  noteText: string
}

type TimeEntry = {
  id: number
  project_id: number
  user_id: string | null
  user_name: string | null
  clock_in_time: string | null
  clock_out_time: string | null
  created_at: string
}

type Profile = {
  full_name: string | null
  role: string | null
  wage: number | null
}


export default function HomeScreen() {
  const router = useRouter()
  const { logoUrl } = useCompanyLogo()

  // Language is now driven by the LanguageProvider so toggling it on this
  // screen re-renders every other screen consuming useLanguage() too.
  const { language, setLanguage } = useLanguage()
  const [languageModalOpen, setLanguageModalOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [weeklyTimeEntries, setWeeklyTimeEntries] = useState<TimeEntry[]>([])
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null)
  const [todayEntry, setTodayEntry] = useState<TimeEntry | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [inventoryOn, setInventoryOn] = useState(false)

  const [loading, setLoading] = useState(true)
  const [clocking, setClocking] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [clockModalVisible, setClockModalVisible] = useState(false)
  const [switchModalVisible, setSwitchModalVisible] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)

  const [manualAcknowledged, setManualAcknowledged] = useState(false)
  const [meetingAcknowledged, setMeetingAcknowledged] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [offsitePrompt, setOffsitePrompt] = useState<OffsitePromptState | null>(null)
  const [pendingSync, setPendingSync] = useState(0)
  const [clockOutReviewVisible, setClockOutReviewVisible] = useState(false)
  const offsiteReasons = useClockInReasons()

  useEffect(() => {
    loadDashboard()
  }, [])

  // Start the offline-queue auto-drain (replays queued clock-ins on
  // reconnect) and subscribe to the pending count so the chip updates
  // live as ops are queued or synced.
  useEffect(() => {
    const stopDrain = startAutoDrain()
    const unsubscribe = subscribePending((count) => {
      setPendingSync(count)
      // When the count drops to 0 after a queued op syncs, refresh so
      // the worker sees their now-active time entry on the dashboard.
      if (count === 0) {
        loadDashboard().catch(() => {})
      }
    })
    return () => {
      unsubscribe()
      stopDrain()
    }
  }, [])

  // Refetch every time this screen regains focus — picks up safety
  // acknowledgements signed on /safety-manual or /weekly-safety-meeting so
  // the user can clock in immediately without logging out and back in.
  useFocusEffect(
    useCallback(() => {
      loadDashboard()
    }, []),
  )

  // Live updates when this worker's own clock entries change (e.g. manager adjusts on web)
  useRealtimeRefetch(
    'time_entries',
    loadDashboard,
    currentUserId ? `user_id=eq.${currentUserId}` : undefined,
    !!currentUserId,
  )

  // Picker UI is data-driven from LANGUAGES so adding a new locale
  // (e.g. Vietnamese) here doesn't need any code change in this screen.

  function getWorkWeekRange() {
    const now = new Date()
    const currentDay = now.getDay()
    const daysSinceFriday = (currentDay - 5 + 7) % 7

    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - daysSinceFriday)
    weekStart.setHours(0, 0, 0, 0)

    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    return { weekStart, weekEnd }
  }

  function getTodayRange() {
    const now = new Date()

    const start = new Date(now)
    start.setHours(0, 0, 0, 0)

    const end = new Date(now)
    end.setHours(23, 59, 59, 999)

    return { start, end }
  }

  function weekStartDateString(date: Date) {
    return date.toISOString().split('T')[0]
  }

  function calculateHours(clockInTime: string | null, clockOutTime: string | null) {
    if (!clockInTime) return 0

    const start = new Date(clockInTime).getTime()
    const end = clockOutTime ? new Date(clockOutTime).getTime() : Date.now()
    const diffMs = end - start
    const diffHours = diffMs / (1000 * 60 * 60)

    return diffHours > 0 ? diffHours : 0
  }

  function formatHours(hours: number) {
    return hours.toFixed(2)
  }

  function formatTimeOnly(value: string | null) {
    if (!value) return '—'
    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getWeeklyTotalHours() {
    return weeklyTimeEntries.reduce((total, entry) => {
      return total + calculateHours(entry.clock_in_time, entry.clock_out_time)
    }, 0)
  }

  function getProjectName(projectId: number | null) {
    if (!projectId) return '—'
    const project = projects.find((p) => p.id === projectId)
    return project?.name || `Project ${projectId}`
  }

  function safetyCompleted() {
    return manualAcknowledged && meetingAcknowledged
  }

  async function loadDashboard() {
    setLoading(true)
    setErrorMessage('')

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const currentUserId = session?.user?.id

      if (!currentUserId) {
        setErrorMessage(t(language, 'mustBeSignedIn'))
        return
      }

      setCurrentUserId(currentUserId)

      // Inventory is a switchable feature AND role-gated. Both have to be true
      // before the card appears: a company that doesn't count stock shouldn't
      // carry the tile, and a field worker shouldn't reach the screen.
      const csResult = await supabase
        .from('company_settings')
        .select('feature_inventory')
        .limit(1)
        .maybeSingle()
      setInventoryOn((csResult.data as any)?.feature_inventory !== false)

      const profileResult = await supabase
        .from('profiles')
        .select('full_name, role, wage, org_id')
        .eq('id', currentUserId)
        .maybeSingle()

      if (profileResult.data) {
        setProfile(profileResult.data)
      } else {
        setProfile({ full_name: null, role: null, wage: null })
      }

      // Our own company's jobs only.
      //
      // A jobsite shared with us by another company is visible here — that is
      // the point of sharing — but you cannot clock into it: hours belong to
      // the company that pays them, and the database refuses a time entry whose
      // project belongs to somebody else ("That project belongs to another
      // company"). We hold our own linked copy of every shared job, which is
      // the row that must be picked, so offering the other company's row was
      // offering a duplicate that fails every time it is chosen. 43 of those in
      // the error log before anybody said anything.
      const myOrg = (profileResult.data as any)?.org_id ?? null
      let projectsQuery = supabase
        .from('projects')
        .select('*')
        .eq('status', 'active') // field app shows only active projects
      if (myOrg) projectsQuery = projectsQuery.eq('org_id', myOrg)
      const projectsResult = await projectsQuery
        .order('created_at', { ascending: false })

      if (projectsResult.error) throw projectsResult.error

      const loadedProjects = projectsResult.data || []
      setProjects(loadedProjects)

      if (loadedProjects.length > 0) {
        setSelectedProjectId((prev) => {
          if (prev && loadedProjects.some((p) => p.id === prev)) return prev
          return loadedProjects[0].id
        })
      } else {
        setSelectedProjectId(null)
      }

      const { weekStart, weekEnd } = getWorkWeekRange()
      // Safety acks are keyed to the configured work week (work_week_start_day,
      // default Friday) — same helper the signing screens + DB use. Using any
      // other week boundary here means a signed ack never matches this lookup.

      const weeklyResult = await supabase
        .from('time_entries')
        .select('*')
        .eq('user_id', currentUserId)
        .gte('clock_in_time', weekStart.toISOString())
        .lte('clock_in_time', weekEnd.toISOString())
        .order('clock_in_time', { ascending: false })

      setWeeklyTimeEntries(weeklyResult.data || [])

      const activeResult = await supabase
        .from('time_entries')
        .select('*')
        .eq('user_id', currentUserId)
        .is('clock_out_time', null)
        .order('created_at', { ascending: false })
        .limit(1)

      setActiveEntry(activeResult.data?.[0] || null)

      const { start, end } = getTodayRange()

      const todayResult = await supabase
        .from('time_entries')
        .select('*')
        .eq('user_id', currentUserId)
        .gte('clock_in_time', start.toISOString())
        .lte('clock_in_time', end.toISOString())
        .order('clock_in_time', { ascending: false })
        .limit(1)

      setTodayEntry(todayResult.data?.[0] || null)

      // One question, answered by the database: is this worker covered today?
      //
      // This used to match week_start exactly against a key computed here in
      // JavaScript. That key is derived from company_settings.work_week_start_day,
      // so editing that setting made every existing signature unfindable — and a
      // second implementation of the same rule is how signatures ended up filed
      // under Mondays no org was configured for. safety_ack_state matches on the
      // period a signature covers, and is the only implementation left.
      const { data: safety, error: safetyErr } = await supabase
        .rpc('safety_ack_state', { p_worker: currentUserId })
      if (safetyErr) logError('safety_ack_state', safetyErr, { screen: 'dashboard' })
      setManualAcknowledged(!!safety?.manual)
      setMeetingAcknowledged(!!safety?.meeting)
    } catch (error: any) {
      setErrorMessage(error?.message || t(language, 'failedLoadHome'))
    } finally {
      setLoading(false)
    }
  }

  async function getCurrentUserName(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()

    return data?.full_name || null
  }

  async function handleClockIn() {
    if (!selectedProjectId) {
      Alert.alert(t(language, 'error'), t(language, 'selectAProject'))
      return
    }

    if (!manualAcknowledged || !meetingAcknowledged) {
      Alert.alert(
        t(language, 'safetyAcknowledgmentRequired'),
        t(language, 'safetyAcknowledgmentRequiredMessage')
      )
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      Alert.alert(t(language, 'error'), t(language, 'mustBeSignedIn'))
      return
    }

    if (activeEntry && !activeEntry.clock_out_time) {
      Alert.alert(t(language, 'error'), t(language, 'alreadyClockedIn'))
      return
    }

    // Validation passed — dismiss the modal NOW so the user isn't stuck
    // staring at it during slow GPS / network ops. The remaining work
    // happens in the background; success/error surfaces via Alert, and
    // the offsite prompt (if needed) opens as its own modal on top of
    // the home screen.
    const projectId = selectedProjectId
    const userId = session.user.id
    const project = projects.find((p) => p.id === projectId)
    setClockModalVisible(false)
    setClocking(true)

    try {
      // 1. Capture worker GPS (will throw LocationDeniedError if denied)
      const loc = await readCurrentLocation()

      // 2. Check geofence against the selected project
      const fence = checkGeofence(loc.lat, loc.lng, {
        latitude: project?.latitude ?? null,
        longitude: project?.longitude ?? null,
        geofence_radius_meters: project?.geofence_radius_meters ?? null,
      })

      // 2b. Out-of-state check — compare the worker's actual state to the
      // project's state so a wrong/blank pin can't hide out-of-state work.
      const projectState = normalizeState(project?.state)
      const workerState = await stateForLocation(loc.lat, loc.lng)
      const outOfState = !!(projectState && workerState && projectState !== workerState)

      // 3. Capture map snapshot (best effort — null on failure)
      const snapshotUrl = await captureMapSnapshot({
        userId,
        lat: loc.lat,
        lng: loc.lng,
        kind: 'in',
      })

      // 4a. On-site (inside fence AND in the project's state) → clock in directly
      if (fence.inside && !outOfState) {
        const result = await svcClockIn(projectId, {
          lat: loc.lat, lng: loc.lng, snapshotUrl,
          offsite: false, offsiteReason: null, offsiteNote: null,
        })
        if (result.queued) {
          Alert.alert(
            'Clocked in (offline)',
            'No network — your clock-in is saved locally and will sync automatically when signal returns.',
          )
        } else {
          Alert.alert(t(language, 'success'), t(language, 'clockedInSuccessfully'))
        }
        await loadDashboard()
        return
      }

      // 4b. Outside fence → ask why (separate modal)
      setOffsitePrompt({
        kind: 'in',
        distance: fence.distanceMeters,
        outOfState,
        projectState,
        workerState,
        projectName: project?.name || t(language, 'project'),
        payload: { lat: loc.lat, lng: loc.lng, snapshotUrl },
        noteText: '',
      })
    } catch (error: any) {
      if (error instanceof LocationDeniedError) {
        Alert.alert(t(language, 'locationRequired'), t(language, 'allowLocationToClockIn'))
      } else {
        Alert.alert(t(language, 'error'), error?.message || t(language, 'somethingWrong'))
      }
    } finally {
      setClocking(false)
    }
  }

  /**
   * Change Job Site — move the open shift to another project. The geofence is
   * checked against the NEW site only; being outside the old one is expected once
   * you've driven away. Off-site still goes through, it just needs a reason.
   */
  async function handleSwitchProject(newProjectId: number) {
    if (!activeEntry?.id || activeEntry.clock_out_time) return
    if (newProjectId === activeEntry.project_id) {
      Alert.alert(t(language, 'error'), t(language, 'alreadyOnThisSite'))
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      Alert.alert(t(language, 'error'), t(language, 'mustBeSignedIn'))
      return
    }

    const project = projects.find((p) => p.id === newProjectId)
    setSwitchModalVisible(false)
    setClocking(true)

    try {
      const loc = await readCurrentLocation()

      const fence = checkGeofence(loc.lat, loc.lng, {
        latitude: project?.latitude ?? null,
        longitude: project?.longitude ?? null,
        geofence_radius_meters: project?.geofence_radius_meters ?? null,
      })
      const projectState = normalizeState(project?.state)
      const workerState = await stateForLocation(loc.lat, loc.lng)
      const outOfState = !!(projectState && workerState && projectState !== workerState)

      const snapshotUrl = await captureMapSnapshot({ userId: session.user.id, lat: loc.lat, lng: loc.lng, kind: 'in' })

      if (fence.inside && !outOfState) {
        await svcSwitchProject(activeEntry.id, newProjectId, {
          lat: loc.lat, lng: loc.lng, snapshotUrl,
          offsite: false, offsiteReason: null, offsiteNote: null,
        })
        Alert.alert(t(language, 'success'), t(language, 'jobSiteChanged', { project: project?.name || '' }))
        await loadDashboard()
        return
      }

      setOffsitePrompt({
        kind: 'switch',
        switchToProjectId: newProjectId,
        distance: fence.distanceMeters,
        outOfState,
        projectState,
        workerState,
        projectName: project?.name || t(language, 'project'),
        payload: { lat: loc.lat, lng: loc.lng, snapshotUrl },
        noteText: '',
      })
    } catch (error: any) {
      if (error instanceof LocationDeniedError) {
        Alert.alert(t(language, 'locationRequired'), t(language, 'allowLocationToClockIn'))
      } else {
        Alert.alert(t(language, 'error'), error?.message || t(language, 'somethingWrong'))
      }
    } finally {
      setClocking(false)
    }
  }

  async function confirmOffsiteClock(reason: OffsiteReason) {
    if (!offsitePrompt) return

    try {
      setClocking(true)

      const note = offsitePrompt.noteText.trim() || null

      if (offsitePrompt.kind === 'switch') {
        if (!activeEntry?.id || !offsitePrompt.switchToProjectId) return
        await svcSwitchProject(activeEntry.id, offsitePrompt.switchToProjectId, {
          lat: offsitePrompt.payload.lat,
          lng: offsitePrompt.payload.lng,
          snapshotUrl: offsitePrompt.payload.snapshotUrl,
          offsite: true, offsiteReason: reason, offsiteNote: note,
        })
        Alert.alert(t(language, 'success'), t(language, 'jobSiteChanged', { project: offsitePrompt.projectName }))
      } else if (offsitePrompt.kind === 'in') {
        if (!selectedProjectId) return
        const result = await svcClockIn(selectedProjectId, {
          lat: offsitePrompt.payload.lat,
          lng: offsitePrompt.payload.lng,
          snapshotUrl: offsitePrompt.payload.snapshotUrl,
          offsite: true, offsiteReason: reason, offsiteNote: note,
        })
        if (result.queued) {
          Alert.alert(
            'Clocked in (offline)',
            'No network — your clock-in is saved locally and will sync automatically when signal returns.',
          )
        } else {
          Alert.alert(t(language, 'success'), t(language, 'clockedInSuccessfully'))
        }
      } else {
        if (!activeEntry?.id) return
        await svcClockOut(activeEntry.id, {
          lat: offsitePrompt.payload.lat,
          lng: offsitePrompt.payload.lng,
          snapshotUrl: offsitePrompt.payload.snapshotUrl,
          offsite: true, offsiteReason: reason, offsiteNote: note,
        })
        Alert.alert(t(language, 'success'), t(language, 'clockedOutSuccessfully'))
      }

      setOffsitePrompt(null)
      setClockModalVisible(false)
      await loadDashboard()
    } catch (error: any) {
      Alert.alert(t(language, 'error'), error?.message || t(language, 'somethingWrong'))
    } finally {
      setClocking(false)
    }
  }

  async function clockOutActiveEntrySilently() {
    if (!activeEntry?.id) return

    const clockOutTime = new Date().toISOString()

    const { error } = await supabase
      .from('time_entries')
      .update({
        clock_out_time: clockOutTime,
      })
      .eq('id', activeEntry.id)

    if (error) throw error
  }

  async function handleClockOut() {
    if (!activeEntry?.id) {
      Alert.alert(t(language, 'error'), t(language, 'noActiveClockIn'))
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      Alert.alert(t(language, 'error'), t(language, 'mustBeSignedIn'))
      return
    }

    // Dismiss the modal up front so the user isn't stuck while GPS /
    // network finish; offsite prompt opens as its own modal if needed.
    const entryId = activeEntry.id
    const projectIdAtClockIn = activeEntry.project_id
    const userId = session.user.id
    setClockModalVisible(false)
    setClocking(true)

    try {
      const loc = await readCurrentLocation()

      const project = projects.find((p) => p.id === projectIdAtClockIn)
      const fence = checkGeofence(loc.lat, loc.lng, {
        latitude: project?.latitude ?? null,
        longitude: project?.longitude ?? null,
        geofence_radius_meters: project?.geofence_radius_meters ?? null,
      })

      // Out-of-state check (same as clock-in) — pin-independent.
      const projectState = normalizeState(project?.state)
      const workerState = await stateForLocation(loc.lat, loc.lng)
      const outOfState = !!(projectState && workerState && projectState !== workerState)

      const snapshotUrl = await captureMapSnapshot({
        userId,
        lat: loc.lat,
        lng: loc.lng,
        kind: 'out',
      })

      if (fence.inside && !outOfState) {
        await svcClockOut(entryId, {
          lat: loc.lat, lng: loc.lng, snapshotUrl,
          offsite: false, offsiteReason: null, offsiteNote: null,
        })
        Alert.alert(t(language, 'success'), t(language, 'clockedOutSuccessfully'))
        await loadDashboard()
        return
      }

      setOffsitePrompt({
        kind: 'out',
        distance: fence.distanceMeters,
        outOfState,
        projectState,
        workerState,
        projectName: project?.name || t(language, 'project'),
        payload: { lat: loc.lat, lng: loc.lng, snapshotUrl },
        noteText: '',
      })
    } catch (error: any) {
      if (error instanceof LocationDeniedError) {
        Alert.alert(t(language, 'locationRequired'), t(language, 'allowLocationToClockOut'))
      } else {
        Alert.alert(t(language, 'error'), error?.message || t(language, 'somethingWrong'))
      }
    } finally {
      setClocking(false)
    }
  }

  function handleLogout() {
    const message =
      activeEntry && !activeEntry.clock_out_time
        ? t(language, 'logoutClockedIn')
        : t(language, 'logoutConfirm')

    Alert.alert(t(language, 'logout'), message, [
      { text: t(language, 'cancel'), style: 'cancel' },
      {
        text: t(language, 'logout'),
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true)

            if (activeEntry && !activeEntry.clock_out_time) {
              await clockOutActiveEntrySilently()
            }

            const { error } = await supabase.auth.signOut({ scope: 'local' })

            if (error) {
              Alert.alert(t(language, 'logoutError'), error.message)
              return
            }

            router.replace('/sign-in')
          } catch (error: any) {
            Alert.alert(t(language, 'logoutError'), error?.message || t(language, 'couldNotLogOut'))
          } finally {
            setLoading(false)
          }
        },
      },
    ])
  }

  const { weekStart, weekEnd } = getWorkWeekRange()
  const weeklyTotalHours = getWeeklyTotalHours()

  const currentStatusText = useMemo(() => {
    if (activeEntry) return t(language, 'clockedIn')
    if (todayEntry?.clock_out_time) return t(language, 'clockedOut')
    return t(language, 'notClockedIn')
  }, [activeEntry, todayEntry, language])

  const displayName = profile?.full_name || t(language, 'worker')

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 20, height: 140, justifyContent: 'center' }}>
            <SkeletonBlock width="55%" height={22} radius={6} style={{ backgroundColor: 'rgba(255,255,255,0.18)' }} />
            <SkeletonBlock width="40%" height={14} radius={6} style={{ marginTop: 10, backgroundColor: 'rgba(255,255,255,0.14)' }} />
          </View>
          <SkeletonList count={3} kind="project" />
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (errorMessage) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
          backgroundColor: COLORS.background,
        }}
      >
        <Text style={{ color: COLORS.red, marginBottom: 12, fontWeight: '700' }}>
          {t(language, 'error')}
        </Text>
        <Text style={{ color: COLORS.text, textAlign: 'center', marginBottom: 16 }}>
          {errorMessage}
        </Text>
        <Pressable
          onPress={loadDashboard}
          style={{
            backgroundColor: COLORS.navy,
            borderRadius: 14,
            paddingHorizontal: 18,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>{t(language, 'retry')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* What this phone is running, where support can read it without asking
            anyone to go hunting: first line of the first screen after sign-in.
            Small and grey on purpose — it is a label, not information the crew
            needs to do their job. The fuller version lives on Profile. */}
        <BuildInfoLine />

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <View
            style={{
              width: 74,
              height: 74,
              borderRadius: 22,
              backgroundColor: COLORS.card,
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'hidden',
            }}
          >
            <Image
              source={
                logoUrl
                  ? { uri: logoUrl }
                  : require('../../assets/images/siteofficeiq-logo.png')
              }
              style={{ width: 54, height: 54, resizeMode: 'contain' }}
            />
          </View>

          <Pressable
            onPress={() => setLanguageModalOpen(true)}
            style={{
              width: 74,
              height: 74,
              borderRadius: 22,
              backgroundColor: COLORS.card,
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <MaterialCommunityIcons name="translate" size={28} color={COLORS.navy} />
            <Text style={{ marginTop: 4, fontWeight: '800', color: COLORS.navy }}>
              {language.toUpperCase()}
            </Text>
          </Pressable>

          {/* Clock button — always available. Travel no longer gates or replaces it.
              The colour reports STATE, not availability: green while the clock is
              running, red when it is not. It used to be red whenever safety was
              signed, which read as a warning at exactly the moment nothing was
              wrong. Grey still means the safety acknowledgement is outstanding
              and clocking in is blocked — that is a third state, not a shade of
              "not clocked in".

              Colour is not carrying this alone: the status line directly below
              says "Clocked in" or "Not clocked in" in words. */}
          <Pressable
            onPress={() => setClockModalVisible(true)}
            accessibilityLabel={activeEntry ? 'Clocked in — tap to clock out' : 'Not clocked in — tap to clock in'}
            style={{
              width: 74,
              height: 74,
              borderRadius: 22,
              backgroundColor: !safetyCompleted()
                ? '#94A3B8'
                : activeEntry
                  ? COLORS.green
                  : COLORS.red,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Ionicons
              name={activeEntry ? 'time' : 'time-outline'}
              size={30}
              color={COLORS.white}
            />
          </Pressable>

          <Pressable
            onPress={handleLogout}
            style={{
              width: 74,
              height: 74,
              borderRadius: 22,
              backgroundColor: COLORS.card,
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Ionicons name="log-out-outline" size={28} color={COLORS.navy} />
          </Pressable>
        </View>

        <View
          style={{
            backgroundColor: COLORS.navy,
            borderRadius: 28,
            padding: 22,
            marginBottom: 20,
            marginTop: 10,
          }}
        >
          <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: '700' }}>
            {displayName}
          </Text>
          <Text style={{ color: '#D9F6FB', marginTop: 2 }}>
            {currentStatusText}
            {activeEntry ? ` · ${getProjectName(activeEntry.project_id)}` : ''}
          </Text>

          {/* Safety gate status — shown in BOTH states so a worker can tell at a
              glance whether they are clear to clock in, rather than inferring it
              from the absence of a warning. */}
          <View style={{
            backgroundColor: safetyCompleted() ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
            borderRadius: 14, padding: 12, marginTop: 12,
            borderWidth: 1, borderColor: safetyCompleted() ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)',
            flexDirection: 'row', alignItems: 'center', gap: 8,
          }}>
            <Ionicons
              name={safetyCompleted() ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={safetyCompleted() ? '#BBF7D0' : '#FECACA'}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: safetyCompleted() ? '#BBF7D0' : '#FECACA', fontWeight: '700', lineHeight: 19 }}>
                {/* "Clock-In Allowed" is a statement about permission, and it
                    read as an instruction to a worker who was already on the
                    clock — they took it to mean the clock-in had not gone
                    through. Once they are clocked in, permission is no longer
                    the news; say what is actually true. */}
                {t(language, !safetyCompleted() ? 'safetySignatureRequired'
                  : activeEntry ? 'youAreClockedIn' : 'clockInAllowed')}
              </Text>
              {/* Naming what is outstanding, because "Safety Signature Required"
                  on its own does not tell a worker where to go. */}
              {!safetyCompleted() && (
                <Text style={{ color: '#FECACA', opacity: 0.85, fontSize: 12, marginTop: 2 }}>
                  {[
                    !manualAcknowledged ? t(language, 'safetyManual') : null,
                    !meetingAcknowledged ? t(language, 'weeklySafetyMeeting') : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
          </View>

          {/* Pending sync chip — shows when one or more clock-ins were saved
              offline and haven't reached the server yet. Tap to force a
              drain attempt instead of waiting for the connectivity event. */}
          {pendingSync > 0 && (
            <Pressable
              onPress={() => drainQueue().catch(() => {})}
              style={{
                marginTop: 10,
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: '#FBBF24',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
              }}
            >
              <Ionicons name="cloud-offline-outline" size={14} color="#78350F" />
              <Text style={{ color: '#78350F', fontWeight: '700', fontSize: 12 }}>
                {pendingSync} pending sync — tap to retry
              </Text>
            </Pressable>
          )}

          <View
            style={{
              backgroundColor: '#1E4D8E',
              borderRadius: 20,
              padding: 14,
              marginTop: 14,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#E8FBFF', marginBottom: 6 }}>
              {t(language, 'todayClockIn')}: {formatTimeOnly(todayEntry?.clock_in_time || activeEntry?.clock_in_time || null)}
            </Text>
            <Text style={{ color: '#E8FBFF' }}>
              {t(language, 'todayClockOut')}: {formatTimeOnly(todayEntry?.clock_out_time || null)}
            </Text>
          </View>

          {/* Change Job Site — only while on the clock. Splits the shift in two
              rather than making the worker clock out and back in. */}
          {activeEntry && !activeEntry.clock_out_time && (
            <Pressable
              onPress={() => setSwitchModalVisible(true)}
              disabled={clocking}
              style={{
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderRadius: 16,
                paddingVertical: 14,
                marginBottom: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.25)',
              }}
            >
              <Ionicons name="swap-horizontal" size={20} color={COLORS.white} />
              <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '800' }}>
                {t(language, 'changeJobSite')}
              </Text>
            </Pressable>
          )}

          <Text style={{ color: '#D9F6FB', marginBottom: 6 }}>
            {t(language, 'workWeek')}: {weekStart.toLocaleDateString()} - {weekEnd.toLocaleDateString()}
          </Text>
          <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800' }}>
            {`${formatHours(weeklyTotalHours)} ${t(language, 'hrs')}`}
          </Text>
        </View>

        {/* Travel — a standalone mileage log. Start Trip / End Trip, each with a geo
            photo. It never clocks anyone in or out. */}
        <TravelCard userName={profile?.full_name ?? null} language={language} />

        <Pressable
          onPress={() => router.push('/my-schedule' as any)}
          style={{
            backgroundColor: COLORS.card,
            borderRadius: 24,
            paddingVertical: 18,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            marginBottom: 14,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              backgroundColor: COLORS.tealSoft,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <MaterialCommunityIcons name="format-list-checks" size={30} color={COLORS.teal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '800' }}>
              {t(language, 'mySchedule')}
            </Text>
            <Text style={{ color: COLORS.subtext, fontSize: 13, marginTop: 2 }}>
              {t(language, 'myScheduleSubtitle')}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={26} color={COLORS.subtext} />
        </Pressable>

        {/* Request Time Off lives on the Profile screen — it is a personal action,
            not a jobsite one, so it sits with the worker's own details. */}

        <View style={{ flexDirection: 'row', gap: 14, marginBottom: 14 }}>
          <Pressable
            onPress={() => router.push('/projects')}
            style={{
              flex: 1,
              backgroundColor: COLORS.card,
              borderRadius: 24,
              paddingVertical: 22,
              paddingHorizontal: 16,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 86,
                height: 86,
                borderRadius: 24,
                backgroundColor: COLORS.tealSoft,
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <MaterialCommunityIcons name="briefcase-outline" size={38} color={COLORS.teal} />
            </View>
            <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '700' }}>
              {t(language, 'projects')}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/safety')}
            style={{
              flex: 1,
              backgroundColor: safetyCompleted() ? COLORS.greenSoft : '#FDECEA',
              borderRadius: 24,
              paddingVertical: 22,
              paddingHorizontal: 16,
              alignItems: 'center',
              borderWidth: 2,
              borderColor: safetyCompleted() ? COLORS.green : COLORS.red,
            }}
          >
            <View
              style={{
                width: 86,
                height: 86,
                borderRadius: 24,
                backgroundColor: safetyCompleted() ? COLORS.green : COLORS.red,
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <MaterialCommunityIcons name={safetyCompleted() ? 'shield-check' : 'shield-alert'} size={38} color={COLORS.white} />
            </View>
            <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '700' }}>
              {t(language, 'safety')}
            </Text>
            <Text style={{ color: safetyCompleted() ? COLORS.green : COLORS.red, fontSize: 12, fontWeight: '800', marginTop: 2 }}>
              {safetyCompleted() ? t(language, 'safetySigned') : t(language, 'safetyNotSigned')}
            </Text>
          </Pressable>
        </View>

        {/* Smart Tools + Tools & Equipment sit side by side — both are "reach for a
            tool", so they read as a pair rather than two full-width rows. */}
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <Pressable
            onPress={() => router.push('/smart-tools')}
            style={{
              flex: 1,
              backgroundColor: COLORS.navy,
              borderRadius: 24,
              paddingVertical: 20,
              paddingHorizontal: 16,
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                backgroundColor: 'rgba(25,182,210,0.25)',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <MaterialCommunityIcons name="calculator-variant-outline" size={30} color={COLORS.teal} />
            </View>
            <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '800' }}>{t(language, 'smartTools')}</Text>
            <Text style={{ color: '#A8C8E8', fontSize: 12 }} numberOfLines={2}>{t(language, 'smartToolsTagline')}</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/equipment' as any)}
            style={{
              flex: 1,
              backgroundColor: COLORS.card,
              borderRadius: 24,
              paddingVertical: 20,
              paddingHorizontal: 16,
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                backgroundColor: COLORS.tealSoft,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <MaterialCommunityIcons name="hammer-wrench" size={30} color={COLORS.teal} />
            </View>
            <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '800' }}>{t(language, 'toolsEquipment')}</Text>
            <Text style={{ color: COLORS.subtext, fontSize: 12 }} numberOfLines={2}>{t(language, 'toolsEquipmentSub')}</Text>
          </Pressable>
        </View>

        {/* Inventory sits with Smart Tools and Tools & Equipment — same "reach
            for something" shelf. Hidden unless the feature is on AND the person
            can actually manage stock, so it never offers a screen that would
            turn them away. */}
        {inventoryOn && canStock(profile?.role) && (
          <Pressable
            onPress={() => router.push('/inventory' as any)}
            style={{
              backgroundColor: COLORS.card,
              borderRadius: 24,
              paddingVertical: 20,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                backgroundColor: COLORS.tealSoft,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <MaterialCommunityIcons name="package-variant-closed" size={30} color={COLORS.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '800' }}>{t(language, 'inventory')}</Text>
              <Text style={{ color: COLORS.subtext, fontSize: 12 }}>{t(language, 'inventorySub')}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={26} color={COLORS.subtext} />
          </Pressable>
        )}

        {/* User guide → SiteOfficeIQ */}
        <Pressable
          onPress={() => Linking.openURL('https://www.siteofficeiq.com/guide')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18, marginTop: 6 }}
        >
          <MaterialCommunityIcons name="book-open-variant" size={18} color={COLORS.subtext} />
          <Text style={{ color: COLORS.subtext, fontWeight: '700', fontSize: 14 }}>{t(language, 'userGuide')}</Text>
          <Ionicons name="open-outline" size={16} color={COLORS.subtext} />
        </Pressable>
      </ScrollView>

      <Modal
        visible={clockModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setClockModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.40)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: COLORS.card,
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              padding: 20,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: COLORS.text }}>
                {t(language, 'clockInClockOut')}
              </Text>
              <Pressable
                onPress={() => setClockModalVisible(false)}
                style={{ backgroundColor: '#F1F5F9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}
              >
                <Text style={{ color: COLORS.subtext, fontWeight: '700', fontSize: 15 }}>{`✕ ${t(language, 'close')}`}</Text>
              </Pressable>
            </View>

            {!safetyCompleted() ? (
              <View
                style={{
                  backgroundColor: COLORS.yellowSoft,
                  borderRadius: 18,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <Text
                  style={{
                    color: COLORS.yellowText,
                    fontWeight: '800',
                    marginBottom: 8,
                  }}
                >
                  {t(language, 'clockInBlocked')}
                </Text>

                <Text style={{ color: COLORS.text, lineHeight: 22, marginBottom: 12 }}>
                  {t(language, 'safetyMustComplete')}
                </Text>

                <Pressable
                  onPress={() => {
                    setClockModalVisible(false)
                    router.push('/safety')
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    backgroundColor: COLORS.navy,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ color: COLORS.white, fontWeight: '800' }}>
                    {t(language, 'goToSafety')}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {activeEntry ? (
              // Already clocked in — show the active project as a read-only,
              // highlighted card. Project can't be changed mid-shift; clock
              // out first, then clock in to a different project.
              <View style={{ marginBottom: 10 }}>
                <Text style={{ color: COLORS.subtext, marginBottom: 6 }}>
                  {t(language, 'activeProject')}
                </Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.green,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    backgroundColor: COLORS.greenSoft,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Ionicons name="checkmark-circle" size={22} color={COLORS.green} />
                  <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '700', flex: 1 }}>
                    {getProjectName(activeEntry.project_id)}
                  </Text>
                </View>
              </View>
            ) : (
              // Not clocked in — let the worker pick which project to clock into.
              <>
                <Text style={{ color: COLORS.subtext, marginBottom: 6 }}>
                  {t(language, 'selectProject')}
                </Text>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 14,
                    overflow: 'hidden',
                    marginBottom: 16,
                    backgroundColor: '#F8FAFC',
                    maxHeight: 300,
                  }}
                >
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {projects.length === 0 ? (
                      <Text style={{ color: COLORS.subtext, padding: 16 }}>
                        {t(language, 'noProjectsAvailable')}
                      </Text>
                    ) : (
                      projects.map((project) => {
                        const selected = selectedProjectId === project.id
                        return (
                          <Pressable
                            key={project.id}
                            onPress={() => setSelectedProjectId(project.id)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 10,
                              paddingHorizontal: 14,
                              paddingVertical: 15,
                              borderBottomWidth: 1,
                              borderBottomColor: COLORS.border,
                              backgroundColor: selected ? COLORS.greenSoft : 'transparent',
                            }}
                          >
                            <Ionicons
                              name={selected ? 'radio-button-on' : 'radio-button-off'}
                              size={22}
                              color={selected ? COLORS.green : COLORS.subtext}
                            />
                            <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: selected ? '700' : '500', flex: 1 }}>
                              {String(project?.name ?? '').trim() || `Project #${project.id}`}
                            </Text>
                          </Pressable>
                        )
                      })
                    )}
                  </ScrollView>
                </View>
              </>
            )}

            <View style={{ gap: 12 }}>
              {!activeEntry && (
                <Pressable
                  onPress={handleClockIn}
                  disabled={clocking || !selectedProjectId || !safetyCompleted()}
                  style={{
                    backgroundColor:
                      clocking || !selectedProjectId || !safetyCompleted()
                        ? '#94A3B8'
                        : COLORS.green,
                    borderRadius: 18,
                    paddingVertical: 16,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>
                    {t(language, 'clockIn')}
                  </Text>
                </Pressable>
              )}

              {activeEntry && (
                <Pressable
                  onPress={() => {
                    setClockModalVisible(false)
                    setClockOutReviewVisible(true)
                  }}
                  disabled={clocking}
                  style={{
                    backgroundColor: clocking ? '#CBD5E1' : COLORS.red,
                    borderRadius: 18,
                    paddingVertical: 16,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>
                    {t(language, 'clockOut')}
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => setClockModalVisible(false)}
                style={{ borderRadius: 18, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}
              >
                <Text style={{ color: COLORS.subtext, fontSize: 16, fontWeight: '700' }}>{t(language, 'cancel')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Job Site — pick the new project; the shift splits at this instant.
          Geofence is checked against the new site and an off-site reason is asked
          for (but never blocks) exactly like clocking in. */}
      <Modal
        visible={switchModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSwitchModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 22, maxHeight: '85%' }}>
            <Text style={{ color: COLORS.navy, fontSize: 20, fontWeight: '800', marginBottom: 6 }}>
              {t(language, 'changeJobSite')}
            </Text>
            <Text style={{ color: COLORS.subtext, marginBottom: 16, lineHeight: 20 }}>
              {t(language, 'changeJobSiteIntro', { project: getProjectName(activeEntry?.project_id ?? null) })}
            </Text>

            <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, overflow: 'hidden', marginBottom: 16, backgroundColor: '#F8FAFC', maxHeight: 320 }}>
              <ScrollView nestedScrollEnabled>
                {projects.filter((p) => p.id !== activeEntry?.project_id).length === 0 ? (
                  <Text style={{ color: COLORS.subtext, padding: 16 }}>{t(language, 'noProjectsAvailable')}</Text>
                ) : (
                  projects
                    .filter((p) => p.id !== activeEntry?.project_id)
                    .map((project) => (
                      <Pressable
                        key={project.id}
                        onPress={() => handleSwitchProject(project.id)}
                        disabled={clocking}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                          paddingHorizontal: 14, paddingVertical: 16,
                          borderBottomWidth: 1, borderBottomColor: COLORS.border,
                        }}
                      >
                        <Ionicons name="flag" size={20} color={COLORS.navy} />
                        <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                          {String(project?.name ?? '').trim() || `Project #${project.id}`}
                        </Text>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.subtext} />
                      </Pressable>
                    ))
                )}
              </ScrollView>
            </View>

            <Pressable
              onPress={() => setSwitchModalVisible(false)}
              style={{ borderRadius: 18, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}
            >
              <Text style={{ color: COLORS.subtext, fontSize: 16, fontWeight: '700' }}>{t(language, 'cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Offsite reason prompt — shown when worker clocks in/out beyond the project geofence */}
      <Modal
        visible={!!offsitePrompt}
        transparent
        animationType="slide"
        onRequestClose={() => setOffsitePrompt(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' }}
        >
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 22, maxHeight: '90%' }}>
            <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
              <Text style={{ color: COLORS.navy, fontSize: 20, fontWeight: '800', marginBottom: 6 }}>
                {t(language, 'offsiteHeader')}
              </Text>
              <Text style={{ color: COLORS.subtext, marginBottom: 16, lineHeight: 20 }}>
                {offsitePrompt
                  ? offsitePrompt.outOfState
                    ? t(language, 'offsiteOutOfStateIntro', {
                        project: offsitePrompt.projectName,
                        projectState: offsitePrompt.projectState || '',
                        workerState: offsitePrompt.workerState || '',
                      })
                    : offsitePrompt.distance == null
                      ? t(language, 'offsiteNoLocationIntro', { project: offsitePrompt.projectName })
                      : t(
                          language,
                          offsitePrompt.kind === 'out' ? 'offsiteIntroOut' : 'offsiteIntroIn',
                          { distance: String(Math.round(offsitePrompt.distance)), project: offsitePrompt.projectName },
                        )
                  : ''}
              </Text>

              <View style={{ gap: 10, marginBottom: 14 }}>
                {offsiteReasons.map((r) => (
                  <Pressable
                    key={r.value}
                    onPress={() => confirmOffsiteClock(r.value)}
                    disabled={clocking}
                    style={{
                      backgroundColor: clocking ? '#94A3B8' : COLORS.navy,
                      borderRadius: 16,
                      paddingVertical: 16,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 16 }}>
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 6 }}>
                {t(language, 'optionalNote')}
              </Text>
              <TextInput
                value={offsitePrompt?.noteText || ''}
                onChangeText={(text) =>
                  setOffsitePrompt((prev) => (prev ? { ...prev, noteText: text } : prev))
                }
                placeholder={t(language, 'offsiteNotePlaceholder')}
                placeholderTextColor={COLORS.subtext}
                multiline
                style={{
                  backgroundColor: COLORS.background,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: COLORS.text,
                  minHeight: 80,
                  textAlignVertical: 'top',
                  marginBottom: 14,
                }}
              />

              <Pressable
                onPress={() => setOffsitePrompt(null)}
                disabled={clocking}
                style={{ borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ color: COLORS.subtext, fontWeight: '700', fontSize: 15 }}>{t(language, 'cancel')}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Clock-out review — show a summary of the day so the worker has
          one last chance to back out before the time entry closes. */}
      <Modal visible={clockOutReviewVisible} transparent animationType="fade" onRequestClose={() => setClockOutReviewVisible(false)}>
        <Pressable onPress={() => setClockOutReviewVisible(false)} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 24 }}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: COLORS.card, borderRadius: 22, padding: 22 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 4 }}>
              {t(language, 'reviewClockOut')}
            </Text>
            <Text style={{ color: COLORS.subtext, fontSize: 14, marginBottom: 16 }}>
              {t(language, 'reviewClockOutSubtitle')}
            </Text>

            {(() => {
              const inIso = activeEntry?.clock_in_time
              const nowIso = new Date().toISOString()
              const hours = calculateHours(inIso ?? null, nowIso)
              const project = projects.find(p => p.id === activeEntry?.project_id)
              const fmt = (iso: string | null | undefined) =>
                iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'
              return (
                <View style={{ backgroundColor: COLORS.background, borderRadius: 16, padding: 16, marginBottom: 16 }}>
                  <Text style={{ color: COLORS.subtext, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
                    {t(language, 'activeProject').toUpperCase()}
                  </Text>
                  <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '700', marginTop: 2 }}>
                    {project?.name || t(language, 'project')}
                  </Text>

                  <View style={{ flexDirection: 'row', marginTop: 14, gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.subtext, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
                        {t(language, 'startedAt').toUpperCase()}
                      </Text>
                      <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '700', marginTop: 2 }}>
                        {fmt(inIso)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.subtext, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
                        {t(language, 'endingAt').toUpperCase()}
                      </Text>
                      <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '700', marginTop: 2 }}>
                        {fmt(nowIso)}
                      </Text>
                    </View>
                  </View>

                  <View style={{ marginTop: 14, backgroundColor: COLORS.navy, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#A8C4EE', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
                        {t(language, 'hoursWorked').toUpperCase()}
                      </Text>
                      <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '900', marginTop: 2 }}>
                        {hours.toFixed(2)}
                      </Text>
                    </View>
                    <Ionicons name="time-outline" size={36} color="rgba(255,255,255,0.25)" />
                  </View>
                </View>
              )
            })()}

            <Pressable
              onPress={() => {
                setClockOutReviewVisible(false)
                handleClockOut()
              }}
              disabled={clocking}
              style={{
                backgroundColor: clocking ? '#CBD5E1' : COLORS.red,
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '800' }}>
                {t(language, 'confirmClockOut')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setClockOutReviewVisible(false)}
              style={{ borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}
            >
              <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>{t(language, 'cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Language picker — data-driven from LANGUAGES so a new locale
          shows up automatically once it's registered in lib/i18n.tsx. */}
      <Modal visible={languageModalOpen} transparent animationType="fade" onRequestClose={() => setLanguageModalOpen(false)}>
        <Pressable onPress={() => setLanguageModalOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'center', padding: 24 }}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 18 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 12 }}>{t(language, 'language')}</Text>
            {LANGUAGES.map(l => {
              const selected = l.code === language
              return (
                <Pressable
                  key={l.code}
                  onPress={async () => { await setLanguage(l.code); setLanguageModalOpen(false) }}
                  style={{
                    paddingVertical: 14, paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: selected ? COLORS.tealSoft : 'transparent',
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <View>
                    <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '700' }}>{l.nativeLabel}</Text>
                    <Text style={{ color: COLORS.subtext, fontSize: 12 }}>{l.label}</Text>
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={24} color={COLORS.teal} />}
                </Pressable>
              )
            })}
            <Pressable onPress={() => setLanguageModalOpen(false)} style={{ marginTop: 8, padding: 12, alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 12 }}>
              <Text style={{ color: COLORS.text, fontWeight: '700' }}>{t(language, 'close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
