import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Picker } from '@react-native-picker/picker'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,

  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRealtimeRefetch } from '../../hooks/useRealtimeRefetch'
import { useLanguage } from '../../lib/i18n'
import { isManagerRole } from '../../lib/roles'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'

type TimeEntry = {
  id: number
  project_id: number | null
  user_id: string | null
  user_name: string | null
  clock_in_time: string | null
  clock_out_time: string | null
  created_at: string
}

type Profile = {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  wage: number | null
  role: string | null
}

type WorkerWeekAdjustment = {
  id: number
  worker_id: string
  week_start: string
  hours_override: number | null
  receipts_amount: number | null
}

type WeekOption = {
  key: string
  label: string
  start: Date
  end: Date
}

type WorkerSummary = {
  workerId: string
  workerName: string
  wage: number
  rawHours: number
  totalHours: number
  labor: number
  receiptsAmount: number
  drivenMiles: number
  paidMiles: number
  mileageReimb: number
  totalAmount: number
  adjustmentId: number | null
}

// The threshold comes off each qualifying trip individually, never off the
// week's total — and it does not apply to site-to-site transfers, which are
// paid in full. Same rule as the web payroll and the mobile Travel card; if
// these three ever disagree, a worker gets paid a different amount depending
// on which screen you look at.
function tripThresholdApplies(kind: string | null): boolean {
  return kind !== 'transfer'
}

type EditForm = {
  workerName: string
  hours: string
  receiptsAmount: string
}

const EMPTY_FORM: EditForm = {
  workerName: '',
  hours: '',
  receiptsAmount: '',
}

function getCurrentWorkWeekRange(baseDate = new Date()) {
  const now = new Date(baseDate)
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

function buildWeekOptions(count = 16): WeekOption[] {
  const { weekStart: currentStart } = getCurrentWorkWeekRange()
  const options: WeekOption[] = []

  for (let i = 0; i < count; i++) {
    const start = new Date(currentStart)
    start.setDate(currentStart.getDate() - i * 7)
    start.setHours(0, 0, 0, 0)

    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)

    options.push({
      key: start.toISOString(),
      label: `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`,
      start,
      end,
    })
  }

  return options
}

function calculateHours(clockInTime: string | null, clockOutTime: string | null) {
  if (!clockInTime) return 0
  const start = new Date(clockInTime).getTime()
  const end = clockOutTime ? new Date(clockOutTime).getTime() : Date.now()
  const diffMs = end - start
  const diffHours = diffMs / (1000 * 60 * 60)
  return diffHours > 0 ? diffHours : 0
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`
}

function formatHours(value: number) {
  return value.toFixed(2)
}

function weekStartDateString(date: Date) {
  return date.toISOString().split('T')[0]
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 8 }}>
        {label}
      </Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.subtext}
        keyboardType="numeric"
        style={{
          backgroundColor: COLORS.white,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: COLORS.text,
        }}
      />
    </View>
  )
}

function WorkerCard({
  item,
  onEdit,
  showMileage,
  mileageRate,
}: {
  item: WorkerSummary
  onEdit: (item: WorkerSummary) => void
  showMileage: boolean
  mileageRate: number
}) {
  const { t } = useLanguage()
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: 14,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text
            style={{
              color: COLORS.navy,
              fontSize: 20,
              fontWeight: '800',
              marginBottom: 8,
            }}
          >
            {item.workerName}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 4 }}>
            {t('wageColon', { amount: formatMoney(item.wage) })}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 4 }}>
            {t('totalHoursColon', { hours: formatHours(item.totalHours) })}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 4 }}>
            {t('laborColon', { amount: formatMoney(item.labor) })}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 4 }}>
            {t('receiptsColon', { amount: formatMoney(item.receiptsAmount) })}
          </Text>

          {showMileage && (
            <View style={{ marginBottom: 4 }}>
              <Text style={{ color: COLORS.text }}>
                {t('mileageColon', { amount: formatMoney(item.mileageReimb) })}
              </Text>
              {item.drivenMiles > 0 && (
                // Driven vs paid, because they differ and the difference is the
                // first thing a worker asks about. Showing only the dollars
                // makes the threshold look like an error.
                <Text style={{ color: COLORS.subtext, fontSize: 12 }}>
                  {t('mileageDetail', {
                    driven: item.drivenMiles.toFixed(1),
                    paid: item.paidMiles.toFixed(1),
                    rate: mileageRate.toFixed(2),
                  })}
                </Text>
              )}
            </View>
          )}

          <Text style={{ color: COLORS.navy, fontWeight: '800' }}>
            {t('totalAmountColon', { amount: formatMoney(item.totalAmount) })}
          </Text>
        </View>

        <Pressable
          onPress={() => onEdit(item)}
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            backgroundColor: COLORS.tealSoft,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <MaterialCommunityIcons name="pencil-outline" size={24} color={COLORS.teal} />
        </Pressable>
      </View>
    </View>
  )
}

export default function ManagerTimeClockScreen() {
  const { t } = useLanguage()
  const weekOptions = useMemo(() => buildWeekOptions(16), [])
  const [selectedWeekKey, setSelectedWeekKey] = useState(weekOptions[0]?.key || '')
  const [userRole, setUserRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [adjustments, setAdjustments] = useState<WorkerWeekAdjustment[]>([])
  const [travel, setTravel] = useState<{ user_id: string; miles: number | null; kind: string | null }[]>([])
  const [mileageRate, setMileageRate] = useState(0)
  const [mileageThreshold, setMileageThreshold] = useState(0)
  // Travel is a switchable feature. Off means mileage never appears here and
  // never lands in a total — a tenant that does not reimburse mileage should
  // not see a zero row prompting them to wonder what it is.
  const [travelEnabled, setTravelEnabled] = useState(true)

  const [modalVisible, setModalVisible] = useState(false)
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null)
  const [editingAdjustmentId, setEditingAdjustmentId] = useState<number | null>(null)
  const [form, setForm] = useState<EditForm>(EMPTY_FORM)

  const selectedWeek =
    weekOptions.find((option) => option.key === selectedWeekKey) || weekOptions[0]

  useEffect(() => {
    if (selectedWeek) {
      loadScreen(selectedWeek.start, selectedWeek.end)
    }
  }, [selectedWeekKey])

  // Live updates while the manager is viewing a week
  const refetchSelectedWeek = () => {
    if (selectedWeek) loadScreen(selectedWeek.start, selectedWeek.end)
  }
  useRealtimeRefetch('time_entries', refetchSelectedWeek, undefined, !!selectedWeek)
  useRealtimeRefetch('worker_week_adjustments', refetchSelectedWeek, undefined, !!selectedWeek)

  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function resetForm() {
    setEditingWorkerId(null)
    setEditingAdjustmentId(null)
    setForm(EMPTY_FORM)
  }

  async function loadScreen(weekStart: Date, weekEnd: Date) {
    setLoading(true)
    setErrorMessage('')

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        setErrorMessage(t('mustBeSignedIn'))
        return
      }

      const { data: me, error: meError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (meError) {
        setErrorMessage(meError.message)
        return
      }

      const role = me?.role || 'worker'
      setUserRole(role)

      if (!['manager', 'owner'].includes(String(role))) {
        setEntries([])
        setProfiles([])
        setAdjustments([])
        return
      }

      const weekStartStr = weekStartDateString(weekStart)

      const [entriesResult, profilesResult, adjustmentsResult, travelResult, settingsResult] = await Promise.all([
        supabase
          .from('time_entries')
          .select('id, project_id, user_id, user_name, clock_in_time, clock_out_time, created_at')
          .gte('clock_in_time', weekStart.toISOString())
          .lte('clock_in_time', weekEnd.toISOString())
          .order('clock_in_time', { ascending: false }),

        supabase
          .from('profiles')
          .select('id, first_name, last_name, full_name, wage, role')
          .in('role', ['owner', 'manager', 'office', 'worker', 'warehouse'])
          .order('first_name', { ascending: true }),

        supabase
          .from('worker_week_adjustments')
          .select('id, worker_id, week_start, hours_override, receipts_amount')
          .eq('week_start', weekStartStr),

        // Trips in this week, and the rate/threshold they are paid at. Mileage
        // is pay, not a footnote: leaving it out of this screen meant the
        // manager's total and the worker's check disagreed.
        supabase
          .from('travel_segments')
          .select('user_id, miles, kind')
          .gte('started_at', weekStart.toISOString())
          .lte('started_at', weekEnd.toISOString()),

        supabase
          .from('company_settings')
          .select('mileage_rate, mileage_threshold_miles, feature_travel')
          .limit(1)
          .maybeSingle(),
      ])

      if (entriesResult.error) {
        setErrorMessage(entriesResult.error.message)
        return
      }

      if (profilesResult.error) {
        setErrorMessage(profilesResult.error.message)
        return
      }

      if (adjustmentsResult.error) {
        setErrorMessage(adjustmentsResult.error.message)
        return
      }

      setEntries(entriesResult.data || [])
      setProfiles(profilesResult.data || [])
      setAdjustments(adjustmentsResult.data || [])
      // A failed travel read must not blank the payroll screen — hours and
      // receipts are still correct without it. Mileage shows as zero and the
      // manager can see something is off, which beats an empty week.
      setTravel(travelResult.error ? [] : (travelResult.data || []))
      const cs: any = settingsResult.data || {}
      setMileageRate(Number(cs.mileage_rate || 0))
      setMileageThreshold(Number(cs.mileage_threshold_miles || 0))
      setTravelEnabled(cs.feature_travel !== false)
    } catch (error: any) {
      setErrorMessage(error?.message || t('failedToLoadTimeClock'))
    } finally {
      setLoading(false)
    }
  }

  const workerSummaries = useMemo(() => {
    const groupedHours: Record<string, { workerName: string; rawHours: number }> = {}

    for (const entry of entries) {
      if (!entry.user_id) continue

      if (!groupedHours[entry.user_id]) {
        groupedHours[entry.user_id] = {
          workerName: entry.user_name || t('unknownWorkerName'),
          rawHours: 0,
        }
      }

      groupedHours[entry.user_id].rawHours += calculateHours(
        entry.clock_in_time,
        entry.clock_out_time
      )
    }

    const allWorkerIds = Array.from(
      new Set([
        ...Object.keys(groupedHours),
        ...adjustments.map((item) => item.worker_id),
      ])
    )

    const summaryList: WorkerSummary[] = allWorkerIds.map((workerId) => {
      const profile = profiles.find((item) => item.id === workerId)
      const adjustment = adjustments.find((item) => item.worker_id === workerId)
      const grouped = groupedHours[workerId]

      const profileName =
        `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() ||
        profile?.full_name ||
        grouped?.workerName ||
        t('unknownWorkerName')

      const wage = Number(profile?.wage || 0)
      const rawHours = grouped?.rawHours || 0
      const totalHours =
        adjustment?.hours_override !== null && adjustment?.hours_override !== undefined
          ? Number(adjustment.hours_override)
          : rawHours
      // Gas is not a pay category — mileage covers a worker's own fuel, and gas for
      // equipment books as a company expense.
      const receiptsAmount = Number(adjustment?.receipts_amount || 0)
      const labor = totalHours * wage

      // Mileage, per trip and driven by the trip type the worker picked:
      //   home↔jobsite legs      → (trip miles − threshold) × rate
      //   site-to-site transfers → every mile × rate
      let drivenMiles = 0
      let paidMiles = 0
      if (travelEnabled) {
        for (const ts of travel) {
          if (ts.user_id !== workerId) continue
          const m = Number(ts.miles) || 0
          drivenMiles += m
          paidMiles += tripThresholdApplies(ts.kind) ? Math.max(0, m - mileageThreshold) : m
        }
      }
      const mileageReimb = paidMiles * mileageRate
      const totalAmount = labor + receiptsAmount + mileageReimb

      return {
        workerId,
        workerName: profileName,
        wage,
        rawHours,
        totalHours,
        labor,
        receiptsAmount,
        drivenMiles,
        paidMiles,
        mileageReimb,
        totalAmount,
        adjustmentId: adjustment?.id || null,
      }
    })

    return summaryList.sort((a, b) => a.workerName.localeCompare(b.workerName))
  }, [entries, profiles, adjustments, travel, mileageRate, mileageThreshold, travelEnabled, t])

  function openEditModal(item: WorkerSummary) {
    setEditingWorkerId(item.workerId)
    setEditingAdjustmentId(item.adjustmentId)
    setForm({
      workerName: item.workerName,
      hours: String(item.totalHours),
      receiptsAmount: String(item.receiptsAmount),
    })
    setModalVisible(true)
  }

  function validateAmount(value: string, label: string) {
    if (!value.trim()) return true
    if (Number.isNaN(Number(value))) {
      Alert.alert(t('invalidNumber'), t('fieldMustBeNumber', { label }))
      return false
    }
    return true
  }

  async function handleSaveEdit() {
    if (!editingWorkerId || !selectedWeek) {
      Alert.alert(t('error'), t('noWorkerSelected'))
      return
    }

    if (!validateAmount(form.hours, t('hoursLabelShort'))) return
    if (!validateAmount(form.receiptsAmount, t('receiptsLabelShort'))) return

    try {
      setSaving(true)

      const payload = {
        worker_id: editingWorkerId,
        week_start: weekStartDateString(selectedWeek.start),
        hours_override: form.hours.trim() ? Number(form.hours) : null,
        receipts_amount: form.receiptsAmount.trim() ? Number(form.receiptsAmount) : 0,
      }

      const { error } = await supabase
        .from('worker_week_adjustments')
        .upsert(payload, {
          onConflict: 'worker_id,week_start',
        })

      if (error) {
        Alert.alert(t('saveError'), error.message)
        return
      }

      Alert.alert(t('success'), t('weeklyAmountsUpdated'))
      setModalVisible(false)
      resetForm()
      await loadScreen(selectedWeek.start, selectedWeek.end)
    } catch (error: any) {
      Alert.alert(t('error'), error?.message || t('couldNotUpdateWeeklyAmounts'))
    } finally {
      setSaving(false)
    }
  }

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
        <Text style={{ marginTop: 12, color: COLORS.text }}>
          {t('loadingTimeClock')}
        </Text>
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
        <Text style={{ color: COLORS.red, fontWeight: '700', marginBottom: 10 }}>
          {t('error')}
        </Text>

        <Text style={{ color: COLORS.text, textAlign: 'center', marginBottom: 16 }}>
          {errorMessage}
        </Text>

        <Pressable
          onPress={() => {
            if (selectedWeek) loadScreen(selectedWeek.start, selectedWeek.end)
          }}
          style={{
            backgroundColor: COLORS.navy,
            borderRadius: 14,
            paddingHorizontal: 18,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>{t('retry')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (!isManagerRole(userRole)) {
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
        <Text
          style={{
            color: COLORS.navy,
            fontSize: 24,
            fontWeight: '800',
            marginBottom: 10,
          }}
        >
          {t('managerOnly')}
        </Text>

        <Text style={{ color: COLORS.text, textAlign: 'center' }}>
          {t('noPermissionTimeClock')}
        </Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View
          style={{
            backgroundColor: COLORS.navy,
            borderRadius: 28,
            padding: 22,
            marginBottom: 18,
          }}
        >
          <Text
            style={{
              color: COLORS.white,
              fontSize: 28,
              fontWeight: '800',
              marginBottom: 6,
            }}
          >
            {t('timeClockTitle')}
          </Text>

          <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
            {t('timeClockIntro')}
          </Text>
        </View>

        <Text
          style={{
            color: COLORS.navy,
            fontSize: 18,
            fontWeight: '800',
            marginBottom: 10,
          }}
        >
          {t('workWeekHeader')}
        </Text>

        <View
          style={{
            backgroundColor: COLORS.card,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            overflow: 'hidden',
            marginBottom: 18,
          }}
        >
          <Picker
            selectedValue={selectedWeekKey}
            onValueChange={(value) => setSelectedWeekKey(String(value))}
            itemStyle={Platform.OS === 'ios' ? { color: COLORS.text, fontSize: 18 } : undefined}
            style={{
              color: COLORS.text,
              backgroundColor: COLORS.card,
            }}
          >
            {weekOptions.map((option) => (
              <Picker.Item
                key={option.key}
                label={option.label}
                value={option.key}
                color={COLORS.text}
              />
            ))}
          </Picker>
        </View>

        <Text
          style={{
            color: COLORS.navy,
            fontSize: 18,
            fontWeight: '800',
            marginBottom: 10,
          }}
        >
          {t('workersHeader')}
        </Text>

        {workerSummaries.length === 0 ? (
          <View
            style={{
              backgroundColor: COLORS.card,
              borderRadius: 20,
              padding: 18,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, textAlign: 'center' }}>
              {t('noWorkersForWeek')}
            </Text>
          </View>
        ) : (
          workerSummaries.map((item) => (
            <WorkerCard
              key={item.workerId}
              item={item}
              onEdit={openEditModal}
              showMileage={travelEnabled}
              mileageRate={mileageRate}
            />
          ))
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setModalVisible(false)
          resetForm()
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.40)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: COLORS.card,
              borderTopLeftRadius: 30,
              borderTopRightRadius: 30,
              maxHeight: '85%',
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <Text
                style={{
                  color: COLORS.navy,
                  fontSize: 24,
                  fontWeight: '800',
                  marginBottom: 8,
                }}
              >
                {t('updateWorkerTotals')}
              </Text>

              <Text
                style={{
                  color: COLORS.subtext,
                  marginBottom: 18,
                }}
              >
                {form.workerName}
              </Text>

              <Field
                label={t('totalHoursField')}
                value={form.hours}
                onChangeText={(text) => setField('hours', text)}
                placeholder={t('totalHoursPh')}
              />

              <Field
                label={t('receiptsAmountField')}
                value={form.receiptsAmount}
                onChangeText={(text) => setField('receiptsAmount', text)}
                placeholder={t('receiptsAmountPh')}
              />

              <View style={{ gap: 12, marginTop: 10 }}>
                <Pressable
                  onPress={handleSaveEdit}
                  disabled={saving}
                  style={{
                    backgroundColor: saving ? '#94A3B8' : COLORS.navy,
                    borderRadius: 18,
                    paddingVertical: 16,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.white,
                      fontSize: 16,
                      fontWeight: '800',
                    }}
                  >
                    {saving ? t('saving') : t('update')}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setModalVisible(false)
                    resetForm()
                  }}
                  style={{
                    borderRadius: 18,
                    paddingVertical: 14,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.subtext,
                      fontSize: 15,
                      fontWeight: '700',
                    }}
                  >
                    {t('cancel')}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}