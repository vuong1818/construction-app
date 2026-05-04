import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Picker } from '@react-native-picker/picker'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import DatePickerField from '../../../components/DatePickerField'
import PickerWrap from '../../../components/PickerWrap'
import { useLanguage } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'

const C = {
  bg: '#D6E8FF',
  card: '#FFFFFF',
  navy: '#16356B',
  teal: '#00695C',
  tealSoft: '#E0F2F1',
  text: '#0F172A',
  sub: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
  green: '#2E7D32',
  greenSoft: '#E8F5E9',
  red: '#C62828',
  redSoft: '#FFEBEE',
  inputBg: '#F8FAFC',
  panelBg: '#FAFBFD',
}

type AssemblyType = 'rpp' | 'dcv' | 'pvb' | 'srpvb'
type FacilityType = 'containment' | 'isolation'
type ServiceType = 'domestic' | 'irrigation' | 'fire'
type AssemblyStatus = 'new' | 'existing' | 'replacement'

const ASSEMBLY_TYPES: { value: AssemblyType; label: string }[] = [
  { value: 'rpp', label: 'RPP — Reduced Pressure Principle' },
  { value: 'dcv', label: 'DCV — Double Check Valve' },
  { value: 'pvb', label: 'PVB — Pressure Vacuum Breaker' },
  { value: 'srpvb', label: 'SRPVB — Spill-Resistant PVB' },
]

const SIZE_OPTIONS = ['', '1/2"', '3/4"', '1"', '1 1/4"', '1 1/2"', '2"', '2 1/2"', '3"', '4"', '5"', '6"', '8"']

type Gauge = {
  id: number
  make: string
  model: string | null
  serial: string | null
  calibration_date: string | null
}

type Tester = {
  id: number
  name: string
  license_number: string | null
  firm_name: string | null
  firm_address: string | null
  firm_city_state_zip: string | null
  firm_phone: string | null
}

function showsCheck1And2(t: AssemblyType | null) {
  return t === 'rpp' || t === 'dcv'
}
function showsRelief(t: AssemblyType | null) {
  return t === 'rpp'
}
function showsPVB(t: AssemblyType | null) {
  return t === 'pvb' || t === 'srpvb'
}

function num(v: string | number | null | undefined): number | null {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function dateOrNull(v: string | null | undefined): string | null {
  return v && v.length >= 10 ? v : null
}

type FormState = {
  city: string
  assembly_address: string
  manufacturer: string
  size: string
  model_number: string
  serial_number: string
  facility_owner: string
  facility_phone: string
  facility_address: string
  facility_city: string
  facility_state: string
  facility_zip: string
  facility_type: FacilityType
  contact_name: string
  contact_phone: string
  contact_address: string
  contact_city: string
  contact_state: string
  contact_zip: string
  assembly_status: AssemblyStatus
  replacement_old_serial: string
  on_site_location: string
  service_type: ServiceType
  assembly_type: AssemblyType
  installed_per_manufacturer: boolean
  installed_on_non_potable: boolean
  initial_test_time: string
  check1_held_psid: string
  check1_closed_tight: boolean
  check2_held_psid: string
  check2_closed_tight: boolean
  relief_opened_psid: string
  relief_did_not_open: boolean
  air_inlet_opened_psid: string
  air_inlet_did_not_open: boolean
  air_inlet_did_fully_open: boolean
  check_valve_held_psid: string
  check_valve_closed_tight: boolean
  repair_main: boolean
  repair_bypass: boolean
  repair_notes: string
  after_test_time: string
  after_check1_held_psid: string
  after_check1_closed_tight: boolean
  after_check2_held_psid: string
  after_check2_closed_tight: boolean
  after_relief_opened_psid: string
  after_air_inlet_opened_psid: string
  after_air_inlet_did_not_open: boolean
  after_air_inlet_did_fully_open: boolean
  after_check_valve_held_psid: string
  after_check_valve_closed_tight: boolean
  gauge_id: string
  tester_id: string
  test_date: string
  comments: string
}

function emptyForm(): FormState {
  return {
    city: '',
    assembly_address: '',
    manufacturer: '',
    size: '',
    model_number: '',
    serial_number: '',
    facility_owner: '',
    facility_phone: '',
    facility_address: '',
    facility_city: '',
    facility_state: 'TX',
    facility_zip: '',
    facility_type: 'containment',
    contact_name: '',
    contact_phone: '',
    contact_address: '',
    contact_city: '',
    contact_state: 'TX',
    contact_zip: '',
    assembly_status: 'new',
    replacement_old_serial: '',
    on_site_location: '',
    service_type: 'domestic',
    assembly_type: 'rpp',
    installed_per_manufacturer: true,
    installed_on_non_potable: false,
    initial_test_time: '',
    check1_held_psid: '',
    check1_closed_tight: true,
    check2_held_psid: '',
    check2_closed_tight: true,
    relief_opened_psid: '',
    relief_did_not_open: false,
    air_inlet_opened_psid: '',
    air_inlet_did_not_open: false,
    air_inlet_did_fully_open: true,
    check_valve_held_psid: '',
    check_valve_closed_tight: true,
    repair_main: false,
    repair_bypass: false,
    repair_notes: '',
    after_test_time: '',
    after_check1_held_psid: '',
    after_check1_closed_tight: true,
    after_check2_held_psid: '',
    after_check2_closed_tight: true,
    after_relief_opened_psid: '',
    after_air_inlet_opened_psid: '',
    after_air_inlet_did_not_open: false,
    after_air_inlet_did_fully_open: true,
    after_check_valve_held_psid: '',
    after_check_valve_closed_tight: true,
    gauge_id: '',
    tester_id: '',
    test_date: new Date().toISOString().slice(0, 10),
    comments: '',
  }
}

function computeResult(form: FormState): 'pass' | 'fail' | null {
  const t = form.assembly_type
  if (!t) return null
  const c1 = num(form.check1_held_psid)
  const c2 = num(form.check2_held_psid)
  const rv = num(form.relief_opened_psid)
  const ai = num(form.air_inlet_opened_psid)
  const cv = num(form.check_valve_held_psid)
  const c1Ok = form.check1_closed_tight === true
  const c2Ok = form.check2_closed_tight === true
  const cvOk = form.check_valve_closed_tight === true
  const inletOpened = form.air_inlet_did_not_open === false
  const inletFully = form.air_inlet_did_fully_open === true

  const pass = (() => {
    if (t === 'rpp') return (c1 ?? -1) >= 5 && (rv ?? -1) >= 2 && (c2 ?? -1) >= 1 && c1Ok && c2Ok
    if (t === 'dcv') return (c1 ?? -1) >= 1 && (c2 ?? -1) >= 1 && c1Ok && c2Ok
    if (t === 'pvb') return (ai ?? -1) >= 1 && inletOpened && inletFully && (cv ?? -1) >= 1 && cvOk
    if (t === 'srpvb') return (ai ?? -1) >= 1 && inletOpened && inletFully && (cv ?? -1) >= 1 && cvOk
    return false
  })()
  return pass ? 'pass' : 'fail'
}

// ── Reusable building blocks ───────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        color: C.navy,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {children}
    </Text>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  autoCapitalize,
  multiline,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'decimal-pad'
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  multiline?: boolean
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.sub}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        style={{
          backgroundColor: C.inputBg,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 10,
          padding: 12,
          fontSize: 15,
          color: C.text,
          minHeight: multiline ? 70 : undefined,
          textAlignVertical: multiline ? 'top' : 'auto',
        }}
      />
    </View>
  )
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: value ? C.teal : C.border,
          backgroundColor: value ? C.teal : C.white,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {value ? <MaterialCommunityIcons name="check" size={14} color={C.white} /> : null}
      </View>
      <Text style={{ flex: 1, color: C.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  )
}

function RadioPair<T>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {options.map(o => {
        const selected = o.value === value
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 100,
              backgroundColor: selected ? C.teal : C.card,
              borderWidth: 1,
              borderColor: selected ? C.teal : C.border,
            }}
          >
            <Text style={{ color: selected ? C.white : C.text, fontWeight: '700', fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function Section({
  title,
  defaultOpen = false,
  children,
  badge,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  badge?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <View
      style={{
        backgroundColor: C.card,
        borderRadius: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: C.border,
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={() => setOpen(o => !o)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: 14,
          gap: 8,
        }}
      >
        <Text style={{ flex: 1, color: C.navy, fontWeight: '800', fontSize: 15 }}>{title}</Text>
        {badge}
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={C.sub} />
      </Pressable>
      {open ? <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>{children}</View> : null}
    </View>
  )
}

function CheckBlock({
  title,
  psid,
  setPsid,
  closedTight,
  setClosedTight,
}: {
  title: string
  psid: string
  setPsid: (v: string) => void
  closedTight: boolean
  setClosedTight: (v: boolean) => void
}) {
  const { t } = useLanguage()
  return (
    <View
      style={{
        backgroundColor: C.panelBg,
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: C.border,
        marginBottom: 10,
      }}
    >
      <Text style={{ color: C.navy, fontWeight: '700', fontSize: 13, marginBottom: 6 }}>{title}</Text>
      <TextField
        label={t('backflowHeldAtPsid')}
        value={psid}
        onChange={setPsid}
        keyboardType="decimal-pad"
        placeholder="0.0"
      />
      <RadioPair<boolean>
        value={closedTight}
        onChange={setClosedTight}
        options={[
          { value: true, label: t('backflowClosedTight') },
          { value: false, label: t('backflowLeaked') },
        ]}
      />
    </View>
  )
}

function ReliefBlock({
  opened,
  setOpened,
  didNotOpen,
  setDidNotOpen,
  title,
}: {
  title: string
  opened: string
  setOpened: (v: string) => void
  didNotOpen: boolean
  setDidNotOpen: (v: boolean) => void
}) {
  const { t } = useLanguage()
  return (
    <View
      style={{
        backgroundColor: C.panelBg,
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: C.border,
        marginBottom: 10,
      }}
    >
      <Text style={{ color: C.navy, fontWeight: '700', fontSize: 13, marginBottom: 6 }}>{title}</Text>
      <TextField
        label={t('backflowOpenedAtPsid')}
        value={opened}
        onChange={setOpened}
        keyboardType="decimal-pad"
        placeholder="0.0"
      />
      <ToggleRow label={t('backflowDidNotOpen')} value={didNotOpen} onChange={setDidNotOpen} />
    </View>
  )
}

function AirInletBlock({
  opened,
  setOpened,
  didNotOpen,
  setDidNotOpen,
  fullyOpen,
  setFullyOpen,
}: {
  opened: string
  setOpened: (v: string) => void
  didNotOpen: boolean
  setDidNotOpen: (v: boolean) => void
  fullyOpen: boolean
  setFullyOpen: (v: boolean) => void
}) {
  const { t } = useLanguage()
  return (
    <View
      style={{
        backgroundColor: C.panelBg,
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: C.border,
        marginBottom: 10,
      }}
    >
      <Text style={{ color: C.navy, fontWeight: '700', fontSize: 13, marginBottom: 6 }}>
        Air Inlet (need ≥ 1 psid, opened, fully open)
      </Text>
      <TextField
        label={t('backflowOpenedAtPsid')}
        value={opened}
        onChange={setOpened}
        keyboardType="decimal-pad"
        placeholder="0.0"
      />
      <ToggleRow label={t('backflowDidNotOpen')} value={didNotOpen} onChange={setDidNotOpen} />
      <View style={{ marginTop: 6 }}>
        <FieldLabel>{t('backflowDidFullyOpen')}</FieldLabel>
        <RadioPair<boolean>
          value={fullyOpen}
          onChange={setFullyOpen}
          options={[
            { value: true, label: t('backflowYes') },
            { value: false, label: t('backflowNo') },
          ]}
        />
      </View>
    </View>
  )
}

function ResultBadge({ result }: { result: 'pass' | 'fail' | null }) {
  const { t } = useLanguage()
  if (!result) return null
  const isPass = result === 'pass'
  return (
    <View
      style={{
        backgroundColor: isPass ? C.greenSoft : C.redSoft,
        borderRadius: 100,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text
        style={{
          color: isPass ? C.green : C.red,
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        {isPass ? t('backflowResultPass') : t('backflowResultFail')}
      </Text>
    </View>
  )
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function NewBackflowTest() {
  const router = useRouter()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [errorMsg, setErrorMsg] = useState('')
  const [gauges, setGauges] = useState<Gauge[]>([])
  const [testers, setTesters] = useState<Tester[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/sign-in' as any)
        return
      }
      setUserId(user.id)
      const [gRes, tRes] = await Promise.all([
        supabase.from('backflow_test_gauges').select('id, make, model, serial, calibration_date').order('make'),
        supabase
          .from('backflow_testers')
          .select('id, name, license_number, firm_name, firm_address, firm_city_state_zip, firm_phone')
          .order('name'),
      ])
      setGauges((gRes.data as Gauge[]) || [])
      setTesters((tRes.data as Tester[]) || [])
      setLoading(false)
    })()
  }, [router])

  async function save() {
    setErrorMsg('')
    if (!form.assembly_address.trim() && !form.serial_number.trim()) {
      setErrorMsg(t('backflowRequireAddressOrSerial'))
      return
    }
    setSaving(true)

    const gauge = form.gauge_id ? gauges.find(g => g.id === Number(form.gauge_id)) : undefined
    const tester = form.tester_id ? testers.find(tt => tt.id === Number(form.tester_id)) : undefined

    const payload: Record<string, unknown> = {
      city: form.city || null,
      assembly_address: form.assembly_address || null,
      manufacturer: form.manufacturer || null,
      size: form.size || null,
      model_number: form.model_number || null,
      serial_number: form.serial_number || null,
      facility_owner: form.facility_owner || null,
      facility_phone: form.facility_phone || null,
      facility_address: form.facility_address || null,
      facility_city: form.facility_city || null,
      facility_state: form.facility_state || null,
      facility_zip: form.facility_zip || null,
      facility_type: form.facility_type,
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      contact_address: form.contact_address || null,
      contact_city: form.contact_city || null,
      contact_state: form.contact_state || null,
      contact_zip: form.contact_zip || null,
      assembly_status: form.assembly_status,
      replacement_old_serial:
        form.assembly_status === 'replacement' ? form.replacement_old_serial.trim() || null : null,
      on_site_location: form.on_site_location || null,
      service_type: form.service_type,
      assembly_type: form.assembly_type,
      installed_per_manufacturer: form.installed_per_manufacturer,
      installed_on_non_potable: form.installed_on_non_potable,

      initial_test_time: form.initial_test_time || null,
      check1_held_psid: num(form.check1_held_psid),
      check1_closed_tight: form.check1_closed_tight,
      check2_held_psid: num(form.check2_held_psid),
      check2_closed_tight: form.check2_closed_tight,
      relief_opened_psid: num(form.relief_opened_psid),
      relief_did_not_open: form.relief_did_not_open,
      air_inlet_opened_psid: num(form.air_inlet_opened_psid),
      air_inlet_did_not_open: form.air_inlet_did_not_open,
      air_inlet_did_fully_open: form.air_inlet_did_fully_open,
      check_valve_held_psid: num(form.check_valve_held_psid),
      check_valve_closed_tight: form.check_valve_closed_tight,

      repair_main: form.repair_main,
      repair_bypass: form.repair_bypass,
      repair_notes: form.repair_notes || null,

      after_test_time: form.after_test_time || null,
      after_check1_held_psid: num(form.after_check1_held_psid),
      after_check1_closed_tight: form.after_check1_closed_tight,
      after_check2_held_psid: num(form.after_check2_held_psid),
      after_check2_closed_tight: form.after_check2_closed_tight,
      after_relief_opened_psid: num(form.after_relief_opened_psid),
      after_air_inlet_opened_psid: num(form.after_air_inlet_opened_psid),
      after_air_inlet_did_not_open: form.after_air_inlet_did_not_open,
      after_air_inlet_did_fully_open: form.after_air_inlet_did_fully_open,
      after_check_valve_held_psid: num(form.after_check_valve_held_psid),
      after_check_valve_closed_tight: form.after_check_valve_closed_tight,

      gauge_id: gauge?.id ?? null,
      tester_id: tester?.id ?? null,

      gauge_make: gauge?.make ?? null,
      gauge_model: gauge?.model ?? null,
      gauge_serial: gauge?.serial ?? null,
      gauge_calibration_date: gauge?.calibration_date ?? null,
      tester_name: tester?.name ?? null,
      tester_license: tester?.license_number ?? null,
      firm_name: tester?.firm_name ?? null,
      firm_address: tester?.firm_address ?? null,
      firm_city_state_zip: tester?.firm_city_state_zip ?? null,
      firm_phone: tester?.firm_phone ?? null,

      test_date: dateOrNull(form.test_date),
      comments: form.comments || null,
      created_by: userId,
      result: computeResult(form) ?? 'fail',
    }

    const { data, error } = await supabase.from('backflow_tests').insert(payload).select('id').single()
    setSaving(false)
    if (error) {
      setErrorMsg(t('backflowSaveFailed', { msg: error.message }))
      return
    }
    router.replace(`/smart-tools/backflow/${(data as { id: number }).id}` as any)
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.navy} />
        </View>
      </SafeAreaView>
    )
  }

  const at = form.assembly_type
  const computed = computeResult(form)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: C.navy, fontSize: 20, fontWeight: '900' }}>{t('backflowNewTitle')}</Text>
          </View>

          {/* Permit & Assembly */}
          <Section title={t('backflowSecPermitAssembly')} defaultOpen>
            <TextField label={t('backflowCity')} value={form.city} onChange={v => set('city', v)} placeholder="Plano" />
            <TextField
              label={t('backflowAssemblyAddress')}
              value={form.assembly_address}
              onChange={v => set('assembly_address', v)}
            />
            <TextField label={t('backflowManufacturer')} value={form.manufacturer} onChange={v => set('manufacturer', v)} />
            <FieldLabel>{t('backflowSize')}</FieldLabel>
            <PickerWrap selectedValue={form.size} onValueChange={v => set('size', v)}>
              {SIZE_OPTIONS.map(s => (
                <Picker.Item key={s || 'none'} label={s || '—'} value={s} />
              ))}
            </PickerWrap>
            <TextField label={t('backflowModelNumber')} value={form.model_number} onChange={v => set('model_number', v)} />
            <TextField
              label={t('backflowSerialNumber')}
              value={form.serial_number}
              onChange={v => set('serial_number', v)}
            />
          </Section>

          {/* Type of Assembly */}
          <Section title={t('backflowSecAssemblyType')} defaultOpen>
            {ASSEMBLY_TYPES.map(opt => {
              const selected = form.assembly_type === opt.value
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => set('assembly_type', opt.value)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    padding: 12,
                    borderRadius: 10,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? C.teal : C.border,
                    backgroundColor: selected ? C.tealSoft : C.white,
                    marginBottom: 8,
                  }}
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      borderWidth: 2,
                      borderColor: selected ? C.teal : C.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selected ? (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.teal }} />
                    ) : null}
                  </View>
                  <Text style={{ color: C.navy, fontWeight: '600', fontSize: 13, flex: 1 }}>{opt.label}</Text>
                </Pressable>
              )
            })}
            <View style={{ marginTop: 6 }}>
              <ToggleRow
                label={t('backflowInstalledPerMfr')}
                value={form.installed_per_manufacturer}
                onChange={v => set('installed_per_manufacturer', v)}
              />
              <ToggleRow
                label={t('backflowInstalledNonPotable')}
                value={form.installed_on_non_potable}
                onChange={v => set('installed_on_non_potable', v)}
              />
            </View>
          </Section>

          {/* Initial Test */}
          <Section title={t('backflowSecInitialTest')} defaultOpen badge={<ResultBadge result={computed} />}>
            <TextField
              label={t('backflowTestTime')}
              value={form.initial_test_time}
              onChange={v => set('initial_test_time', v)}
              placeholder="HH:MM"
            />
            {showsCheck1And2(at) ? (
              <>
                <CheckBlock
                  title={`1st Check (need ≥ ${at === 'rpp' ? 5 : 1} psid, closed tight)`}
                  psid={form.check1_held_psid}
                  setPsid={v => set('check1_held_psid', v)}
                  closedTight={form.check1_closed_tight}
                  setClosedTight={v => set('check1_closed_tight', v)}
                />
                <CheckBlock
                  title="2nd Check (need ≥ 1 psid, closed tight)"
                  psid={form.check2_held_psid}
                  setPsid={v => set('check2_held_psid', v)}
                  closedTight={form.check2_closed_tight}
                  setClosedTight={v => set('check2_closed_tight', v)}
                />
              </>
            ) : null}
            {showsRelief(at) ? (
              <ReliefBlock
                title="Relief Valve (need ≥ 2 psid)"
                opened={form.relief_opened_psid}
                setOpened={v => set('relief_opened_psid', v)}
                didNotOpen={form.relief_did_not_open}
                setDidNotOpen={v => set('relief_did_not_open', v)}
              />
            ) : null}
            {showsPVB(at) ? (
              <>
                <AirInletBlock
                  opened={form.air_inlet_opened_psid}
                  setOpened={v => set('air_inlet_opened_psid', v)}
                  didNotOpen={form.air_inlet_did_not_open}
                  setDidNotOpen={v => set('air_inlet_did_not_open', v)}
                  fullyOpen={form.air_inlet_did_fully_open}
                  setFullyOpen={v => set('air_inlet_did_fully_open', v)}
                />
                <CheckBlock
                  title="Check Valve (need ≥ 1 psid, closed tight)"
                  psid={form.check_valve_held_psid}
                  setPsid={v => set('check_valve_held_psid', v)}
                  closedTight={form.check_valve_closed_tight}
                  setClosedTight={v => set('check_valve_closed_tight', v)}
                />
              </>
            ) : null}
          </Section>

          {/* Facility */}
          <Section title={t('backflowSecFacility')}>
            <TextField label={t('backflowOwner')} value={form.facility_owner} onChange={v => set('facility_owner', v)} />
            <TextField
              label={t('backflowPhone')}
              value={form.facility_phone}
              onChange={v => set('facility_phone', v)}
              keyboardType="phone-pad"
            />
            <FieldLabel>{t('backflowFacilityType')}</FieldLabel>
            <RadioPair<FacilityType>
              value={form.facility_type}
              onChange={v => set('facility_type', v)}
              options={[
                { value: 'containment', label: t('backflowContainment') },
                { value: 'isolation', label: t('backflowIsolation') },
              ]}
            />
            <View style={{ height: 12 }} />
            <TextField
              label={t('backflowAddress')}
              value={form.facility_address}
              onChange={v => set('facility_address', v)}
            />
            <TextField label={t('backflowCity')} value={form.facility_city} onChange={v => set('facility_city', v)} />
            <TextField
              label={t('backflowState')}
              value={form.facility_state}
              onChange={v => set('facility_state', v.toUpperCase().slice(0, 2))}
              autoCapitalize="characters"
            />
            <TextField
              label={t('backflowZip')}
              value={form.facility_zip}
              onChange={v => set('facility_zip', v)}
              keyboardType="numeric"
            />
          </Section>

          {/* Contact */}
          <Section title={t('backflowSecContact')}>
            <TextField label={t('backflowContactName')} value={form.contact_name} onChange={v => set('contact_name', v)} />
            <TextField
              label={t('backflowPhone')}
              value={form.contact_phone}
              onChange={v => set('contact_phone', v)}
              keyboardType="phone-pad"
            />
            <TextField
              label={t('backflowAddress')}
              value={form.contact_address}
              onChange={v => set('contact_address', v)}
            />
            <TextField label={t('backflowCity')} value={form.contact_city} onChange={v => set('contact_city', v)} />
            <TextField
              label={t('backflowState')}
              value={form.contact_state}
              onChange={v => set('contact_state', v.toUpperCase().slice(0, 2))}
              autoCapitalize="characters"
            />
            <TextField
              label={t('backflowZip')}
              value={form.contact_zip}
              onChange={v => set('contact_zip', v)}
              keyboardType="numeric"
            />
            <FieldLabel>{t('backflowStatus')}</FieldLabel>
            <RadioPair<AssemblyStatus>
              value={form.assembly_status}
              onChange={v => set('assembly_status', v)}
              options={[
                { value: 'new', label: t('backflowStatusNew') },
                { value: 'existing', label: t('backflowStatusExisting') },
                { value: 'replacement', label: t('backflowStatusReplacement') },
              ]}
            />
            {form.assembly_status === 'replacement' ? (
              <View style={{ marginTop: 12 }}>
                <TextField
                  label={t('backflowOldSerial')}
                  value={form.replacement_old_serial}
                  onChange={v => set('replacement_old_serial', v)}
                />
              </View>
            ) : null}
          </Section>

          {/* On-Site Location */}
          <Section title={t('backflowSecLocation')}>
            <TextField
              label={t('backflowOnSiteLocation')}
              value={form.on_site_location}
              onChange={v => set('on_site_location', v)}
            />
            <FieldLabel>{t('backflowService')}</FieldLabel>
            <RadioPair<ServiceType>
              value={form.service_type}
              onChange={v => set('service_type', v)}
              options={[
                { value: 'domestic', label: t('backflowDomestic') },
                { value: 'irrigation', label: t('backflowIrrigation') },
                { value: 'fire', label: t('backflowFire') },
              ]}
            />
          </Section>

          {/* Repairs & After-Repair Test */}
          <Section title={t('backflowSecRepairs')}>
            <ToggleRow label={t('backflowMain')} value={form.repair_main} onChange={v => set('repair_main', v)} />
            <ToggleRow label={t('backflowBypass')} value={form.repair_bypass} onChange={v => set('repair_bypass', v)} />
            <View style={{ height: 8 }} />
            <TextField
              label={t('backflowNotesMaterials')}
              value={form.repair_notes}
              onChange={v => set('repair_notes', v)}
              multiline
              placeholder="Use only manufacturer's replacement parts."
            />
            <TextField
              label={t('backflowRetestTime')}
              value={form.after_test_time}
              onChange={v => set('after_test_time', v)}
              placeholder="HH:MM"
            />
            {showsCheck1And2(at) ? (
              <>
                <CheckBlock
                  title="1st Check"
                  psid={form.after_check1_held_psid}
                  setPsid={v => set('after_check1_held_psid', v)}
                  closedTight={form.after_check1_closed_tight}
                  setClosedTight={v => set('after_check1_closed_tight', v)}
                />
                <CheckBlock
                  title="2nd Check"
                  psid={form.after_check2_held_psid}
                  setPsid={v => set('after_check2_held_psid', v)}
                  closedTight={form.after_check2_closed_tight}
                  setClosedTight={v => set('after_check2_closed_tight', v)}
                />
              </>
            ) : null}
            {showsRelief(at) ? (
              <TextField
                label="Relief Valve Opened at (psid)"
                value={form.after_relief_opened_psid}
                onChange={v => set('after_relief_opened_psid', v)}
                keyboardType="decimal-pad"
              />
            ) : null}
            {showsPVB(at) ? (
              <>
                <AirInletBlock
                  opened={form.after_air_inlet_opened_psid}
                  setOpened={v => set('after_air_inlet_opened_psid', v)}
                  didNotOpen={form.after_air_inlet_did_not_open}
                  setDidNotOpen={v => set('after_air_inlet_did_not_open', v)}
                  fullyOpen={form.after_air_inlet_did_fully_open}
                  setFullyOpen={v => set('after_air_inlet_did_fully_open', v)}
                />
                <CheckBlock
                  title="Check Valve"
                  psid={form.after_check_valve_held_psid}
                  setPsid={v => set('after_check_valve_held_psid', v)}
                  closedTight={form.after_check_valve_closed_tight}
                  setClosedTight={v => set('after_check_valve_closed_tight', v)}
                />
              </>
            ) : null}
          </Section>

          {/* Gauge */}
          <Section title={t('backflowSecGauge')}>
            {gauges.length === 0 ? (
              <Text style={{ color: C.sub, fontSize: 13 }}>{t('backflowNoGauges')}</Text>
            ) : (
              <PickerWrap selectedValue={form.gauge_id} onValueChange={v => set('gauge_id', v)}>
                <Picker.Item label={`— ${t('backflowSelectGauge')} —`} value="" />
                {gauges.map(g => {
                  const parts = [
                    `${g.make}${g.model ? ' ' + g.model : ''}`,
                    g.serial ? `SN ${g.serial}` : null,
                    g.calibration_date ? `Cal ${g.calibration_date}` : null,
                  ].filter(Boolean)
                  return <Picker.Item key={g.id} label={parts.join(' · ')} value={String(g.id)} />
                })}
              </PickerWrap>
            )}
          </Section>

          {/* Tester */}
          <Section title={t('backflowSecTester')}>
            {testers.length === 0 ? (
              <Text style={{ color: C.sub, fontSize: 13 }}>{t('backflowNoTesters')}</Text>
            ) : (
              <PickerWrap selectedValue={form.tester_id} onValueChange={v => set('tester_id', v)}>
                <Picker.Item label={`— ${t('backflowSelectTester')} —`} value="" />
                {testers.map(tt => {
                  const parts = [
                    tt.name,
                    tt.license_number ? `License ${tt.license_number}` : null,
                    tt.firm_name || null,
                  ].filter(Boolean)
                  return <Picker.Item key={tt.id} label={parts.join(' · ')} value={String(tt.id)} />
                })}
              </PickerWrap>
            )}
            <FieldLabel>{t('backflowTestDate')}</FieldLabel>
            <DatePickerField value={form.test_date} onChange={v => set('test_date', v)} allowClear />
          </Section>

          {/* Comments */}
          <Section title={t('backflowSecComments')}>
            <TextField
              label={t('backflowComments')}
              value={form.comments}
              onChange={v => set('comments', v)}
              multiline
            />
          </Section>

          {errorMsg ? (
            <View
              style={{
                backgroundColor: C.redSoft,
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: C.red, fontWeight: '600', fontSize: 13 }}>{errorMsg}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <ResultBadge result={computed} />
            {computed ? (
              <Text style={{ color: C.sub, fontSize: 12 }}>
                {t('backflowAutoResult', {
                  result: computed === 'pass' ? t('backflowResultPass') : t('backflowResultFail'),
                })}
              </Text>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: C.card,
                borderRadius: 12,
                padding: 14,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: C.border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: C.sub, fontWeight: '700' }}>{t('cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={saving}
              style={({ pressed }) => ({
                flex: 2,
                backgroundColor: C.teal,
                borderRadius: 12,
                padding: 14,
                alignItems: 'center',
                opacity: pressed || saving ? 0.7 : 1,
              })}
            >
              <Text style={{ color: C.white, fontWeight: '800', fontSize: 15 }}>
                {saving ? t('saving') : t('backflowSaveTest')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

