import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { Picker } from '@react-native-picker/picker'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useCompanyLogo } from '../../hooks/useCompanyLogo'
import { t } from '../../lib/i18n'
import { getSavedLanguage, saveLanguage } from '../../lib/language'
import { supabase } from '../../lib/supabase'

type Project = {
  id: number
  name: string
  address: string | null
  status: string | null
  description: string | null
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
}

type Language = 'en' | 'es'

const COLORS = {
  background: '#F6F8FB',
  card: '#FFFFFF',
  navy: '#16356B',
  teal: '#19B6D2',
  tealSoft: '#E7F9FC',
  navySoft: '#EAF0F8',
  red: '#EF4444',
  text: '#0F172A',
  subtext: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
  green: '#22C55E',
  yellowSoft: '#FEFCE8',
  yellowText: '#A16207',
  greenSoft: '#ECFDF5',
}

export default function HomeScreen() {
  const router = useRouter()
  const { logoUrl } = useCompanyLogo()

  const [language, setLanguage] = useState<Language>('en')
  const [projects, setProjects] = useState<Project[]>([])
  const [weeklyTimeEntries, setWeeklyTimeEntries] = useState<TimeEntry[]>([])
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null)
  const [todayEntry, setTodayEntry] = useState<TimeEntry | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const [loading, setLoading] = useState(true)
  const [clocking, setClocking] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [clockModalVisible, setClockModalVisible] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)

  const [manualAcknowledged, setManualAcknowledged] = useState(false)
  const [meetingAcknowledged, setMeetingAcknowledged] = useState(false)

  useEffect(() => {
    getSavedLanguage().then((saved) => {
      if (saved === 'es') {
        setLanguage('es')
      } else {
        setLanguage('en')
      }
    })
    loadDashboard()
  }, [])

  async function toggleLanguage() {
    const next = language === 'en' ? 'es' : 'en'
    setLanguage(next)
    await saveLanguage(next)
  }

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
        setErrorMessage('You must be signed in.')
        return
      }

      const profileResult = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', currentUserId)
        .maybeSingle()

      if (profileResult.data) {
        setProfile(profileResult.data)
      } else {
        setProfile({ full_name: null, role: null })
      }

      const projectsResult = await supabase
        .from('projects')
        .select('*')
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
      const currentWeekStart = weekStartDateString(weekStart)

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

      const [manualResult, meetingResult] = await Promise.all([
        supabase
          .from('safety_manual_acknowledgements')
          .select('id')
          .eq('worker_id', currentUserId)
          .eq('week_start', currentWeekStart)
          .maybeSingle(),

        supabase
          .from('weekly_meeting_acknowledgements')
          .select('id')
          .eq('worker_id', currentUserId)
          .eq('week_start', currentWeekStart)
          .maybeSingle(),
      ])

      setManualAcknowledged(!!manualResult.data)
      setMeetingAcknowledged(!!meetingResult.data)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to load home screen.')
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
        'Safety Acknowledgement Required',
        'You must acknowledge the weekly safety manual and sign into the weekly safety meeting before clocking in.'
      )
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      Alert.alert(t(language, 'error'), 'You must be signed in')
      return
    }

    if (activeEntry && !activeEntry.clock_out_time) {
      Alert.alert(t(language, 'error'), t(language, 'alreadyClockedIn'))
      return
    }

    try {
      setClocking(true)

      const userName = await getCurrentUserName(session.user.id)

      const { error } = await supabase.from('time_entries').insert({
        project_id: selectedProjectId,
        user_id: session.user.id,
        user_name: userName,
        clock_in_time: new Date().toISOString(),
      })

      if (error) {
        Alert.alert(t(language, 'error'), error.message)
        return
      }

      Alert.alert(t(language, 'success'), t(language, 'clockedInSuccessfully'))
      setClockModalVisible(false)
      await loadDashboard()
    } catch (error: any) {
      Alert.alert(t(language, 'error'), error?.message || 'Something went wrong')
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
      Alert.alert(t(language, 'error'), 'No active clock-in found.')
      return
    }

    try {
      setClocking(true)

      const clockOutTime = new Date().toISOString()

      const { error } = await supabase
        .from('time_entries')
        .update({
          clock_out_time: clockOutTime,
        })
        .eq('id', activeEntry.id)

      if (error) {
        Alert.alert(t(language, 'error'), error.message)
        return
      }

      Alert.alert(t(language, 'success'), t(language, 'clockedOutSuccessfully'))
      setClockModalVisible(false)
      await loadDashboard()
    } catch (error: any) {
      Alert.alert(t(language, 'error'), error?.message || 'Something went wrong')
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
      { text: 'Cancel', style: 'cancel' },
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
            Alert.alert(t(language, 'logoutError'), error?.message || 'Could not log out.')
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
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: COLORS.background,
        }}
      >
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>{t(language, 'loading')}</Text>
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
                  : require('../../assets/images/company-logo.png')
              }
              style={{ width: 54, height: 54, resizeMode: 'contain' }}
            />
          </View>

          <Pressable
            onPress={toggleLanguage}
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
              {language === 'en' ? 'EN' : 'ES'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setClockModalVisible(true)}
            style={{
              width: 74,
              height: 74,
              borderRadius: 22,
              backgroundColor: safetyCompleted() ? COLORS.red : '#94A3B8',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Ionicons name="time-outline" size={30} color={COLORS.white} />
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
          }}
        >
          <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: '700' }}>
            {displayName}
          </Text>
          <Text style={{ color: '#D9F6FB', marginTop: 2 }}>{currentStatusText}</Text>

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

          <Text style={{ color: '#D9F6FB', marginBottom: 6 }}>
            {t(language, 'workWeek')}: {weekStart.toLocaleDateString()} - {weekEnd.toLocaleDateString()}
          </Text>
          <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800' }}>
            {formatHours(weeklyTotalHours)} hrs
          </Text>
        </View>

        <View
          style={{
            backgroundColor: COLORS.card,
            borderRadius: 24,
            padding: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            marginBottom: 20,
          }}
        >
          <Text
            style={{
              color: safetyCompleted() ? COLORS.green : COLORS.red,
              fontSize: 20,
              fontWeight: '800',
              marginBottom: 14,
            }}
          >
            Weekly Safety Reminder
          </Text>

          <Pressable
            onPress={() => router.push('/safety')}
            style={{
              alignSelf: 'flex-start',
              backgroundColor: COLORS.navy,
              borderRadius: 16,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: COLORS.white, fontWeight: '800' }}>
              Open Safety Screen
            </Text>
          </Pressable>
        </View>

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
                backgroundColor: COLORS.navySoft,
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <MaterialCommunityIcons name="shield-check-outline" size={38} color={COLORS.navy} />
            </View>
            <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '700' }}>
              {t(language, 'safety')}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push('/smart-tools/index')}
          style={{
            backgroundColor: COLORS.navy,
            borderRadius: 24,
            paddingVertical: 20,
            paddingHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
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
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '800' }}>Smart Tools</Text>
            <Text style={{ color: '#A8C8E8', fontSize: 13 }}>21 field calculators — Elec, Plumb, Mech, Building</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.teal} />
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
            <Text style={{ fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: 16 }}>
              {t(language, 'clockInClockOut')}
            </Text>

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
                  Clock-In Blocked
                </Text>

                <Text style={{ color: COLORS.text, lineHeight: 22, marginBottom: 12 }}>
                  You must complete both weekly safety acknowledgements before clocking in.
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
                    Go to Safety
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={{ color: COLORS.subtext, marginBottom: 6 }}>
              {t(language, 'selectProject')}
            </Text>

            <View
              style={{
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 14,
                overflow: 'hidden',
                marginBottom: 10,
                backgroundColor: '#F8FAFC',
              }}
            >
              <Picker
                selectedValue={selectedProjectId}
                dropdownIconColor={COLORS.text}
                style={{ color: COLORS.text, backgroundColor: '#F8FAFC' }}
                itemStyle={
                  Platform.OS === 'ios'
                    ? {
                        color: COLORS.text,
                        fontSize: 18,
                      }
                    : undefined
                }
                onValueChange={(value) => {
                  if (value === null || value === undefined || value === '') {
                    setSelectedProjectId(null)
                  } else {
                    setSelectedProjectId(Number(value))
                  }
                }}
              >
                <Picker.Item label={t(language, 'selectProject')} value={null} color={COLORS.subtext} />
                {projects.map((project) => (
                  <Picker.Item key={project.id} label={project.name} value={project.id} color={COLORS.text} />
                ))}
              </Picker>
            </View>

            <Text style={{ color: COLORS.text, marginBottom: 16, fontWeight: '600' }}>
              {t(language, 'selected')}: {getProjectName(selectedProjectId)}
            </Text>

            <View style={{ gap: 12 }}>
              <Pressable
                onPress={handleClockIn}
                disabled={clocking || !!activeEntry || !selectedProjectId || !safetyCompleted()}
                style={{
                  backgroundColor:
                    clocking || !!activeEntry || !selectedProjectId || !safetyCompleted()
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

              <Pressable
                onPress={handleClockOut}
                disabled={clocking || !activeEntry}
                style={{
                  backgroundColor: clocking || !activeEntry ? '#CBD5E1' : COLORS.red,
                  borderRadius: 18,
                  paddingVertical: 16,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>
                  {t(language, 'clockOut')}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setClockModalVisible(false)}
                style={{ borderRadius: 18, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ color: COLORS.subtext, fontSize: 15, fontWeight: '600' }}>
                  {t(language, 'close')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}