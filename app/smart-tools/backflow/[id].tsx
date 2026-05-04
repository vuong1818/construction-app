import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
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
  rowDivider: '#F1F5F9',
}

const ASSEMBLY_TYPE_LABEL: Record<string, string> = {
  rpp: 'Reduced Pressure Principle',
  dcv: 'Double Check Valve',
  pvb: 'Pressure Vacuum Breaker',
  srpvb: 'Spill-Resistant Pressure Vacuum Breaker',
  rpp_detector_type_ii: 'Reduced Pressure Principle',
  dc_detector_type_ii: 'Double Check Valve',
}

type BackflowTest = {
  id: number
  test_date: string | null
  initial_test_time: string | null
  after_test_time: string | null
  assembly_address: string | null
  city: string | null
  permit_number: string | null
  manufacturer: string | null
  size: string | null
  model_number: string | null
  serial_number: string | null
  facility_owner: string | null
  facility_phone: string | null
  facility_address: string | null
  facility_city: string | null
  facility_state: string | null
  facility_zip: string | null
  facility_type: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_address: string | null
  contact_city: string | null
  contact_state: string | null
  contact_zip: string | null
  assembly_status: string | null
  replacement_old_serial: string | null
  on_site_location: string | null
  service_type: string | null
  assembly_type: string | null
  installed_per_manufacturer: boolean | null
  installed_on_non_potable: boolean | null
  result: 'pass' | 'fail'
  check1_held_psid: number | null
  check1_closed_tight: boolean | null
  check2_held_psid: number | null
  check2_closed_tight: boolean | null
  relief_opened_psid: number | null
  relief_did_not_open: boolean | null
  air_inlet_opened_psid: number | null
  air_inlet_did_not_open: boolean | null
  air_inlet_did_fully_open: boolean | null
  check_valve_held_psid: number | null
  check_valve_closed_tight: boolean | null
  repair_main: boolean | null
  repair_bypass: boolean | null
  repair_notes: string | null
  after_check1_held_psid: number | null
  after_check1_closed_tight: boolean | null
  after_check2_held_psid: number | null
  after_check2_closed_tight: boolean | null
  after_relief_opened_psid: number | null
  after_air_inlet_opened_psid: number | null
  after_air_inlet_did_not_open: boolean | null
  after_air_inlet_did_fully_open: boolean | null
  after_check_valve_held_psid: number | null
  after_check_valve_closed_tight: boolean | null
  gauge_make: string | null
  gauge_model: string | null
  gauge_serial: string | null
  gauge_calibration_date: string | null
  firm_name: string | null
  firm_address: string | null
  firm_city_state_zip: string | null
  firm_phone: string | null
  tester_name: string | null
  tester_license: string | null
  comments: string | null
}

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function cap(s: string | null | undefined) {
  if (!s) return null
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function showsCheck1And2(t: string | null) {
  return t === 'rpp' || t === 'dcv' || t === 'rpp_detector_type_ii' || t === 'dc_detector_type_ii'
}
function showsRelief(t: string | null) {
  return t === 'rpp' || t === 'rpp_detector_type_ii'
}
function showsPVB(t: string | null) {
  return t === 'pvb' || t === 'srpvb'
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: C.card,
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: C.border,
      }}
    >
      <Text
        style={{
          color: C.navy,
          fontWeight: '800',
          fontSize: 14,
          marginBottom: 10,
          paddingBottom: 6,
          borderBottomWidth: 2,
          borderBottomColor: C.teal,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: C.rowDivider,
      }}
    >
      <Text style={{ flex: 1.2, color: C.sub, fontWeight: '600', fontSize: 12 }}>{label}</Text>
      <View style={{ flex: 2 }}>
        {value == null || value === '' ? (
          <Text style={{ color: C.border, fontSize: 13 }}>—</Text>
        ) : (
          <Text style={{ color: C.navy, fontWeight: '600', fontSize: 13 }}>{String(value)}</Text>
        )}
      </View>
    </View>
  )
}

function BoolRow({ label, value }: { label: string; value: boolean | null | undefined }) {
  const { t } = useLanguage()
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: C.rowDivider,
      }}
    >
      <Text style={{ flex: 1.2, color: C.sub, fontWeight: '600', fontSize: 12 }}>{label}</Text>
      <View style={{ flex: 2 }}>
        {value == null ? (
          <Text style={{ color: C.border, fontSize: 13 }}>—</Text>
        ) : (
          <Text
            style={{
              color: value ? C.green : C.sub,
              fontWeight: '600',
              fontSize: 13,
            }}
          >
            {value ? t('backflowYes') : t('backflowNo')}
          </Text>
        )}
      </View>
    </View>
  )
}

export default function BackflowDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { t } = useLanguage()
  const [test, setTest] = useState<BackflowTest | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [isManager, setIsManager] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/sign-in' as any)
        return
      }
      const [profRes, testRes] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', user.id).single(),
        supabase.from('backflow_tests').select('*').eq('id', id).single(),
      ])
      setIsManager(profRes.data?.role === 'manager')
      if (testRes.error) {
        setErrorMsg(testRes.error.message)
      } else {
        setTest(testRes.data as BackflowTest)
      }
      setLoading(false)
    })()
  }, [id, router])

  function confirmDelete() {
    Alert.alert(
      t('delete'),
      t('backflowDeleteConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('backflow_tests').delete().eq('id', id)
            if (error) {
              Alert.alert(t('error'), t('backflowDeleteFailed', { msg: error.message }))
              return
            }
            router.back()
          },
        },
      ],
      { cancelable: true },
    )
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

  if (errorMsg || !test) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <MaterialCommunityIcons name="alert-circle-outline" size={36} color={C.sub} />
          <Text style={{ color: C.sub, marginTop: 10, fontSize: 14, textAlign: 'center' }}>
            {errorMsg || t('backflowNotFound')}
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  const at = test.assembly_type
  const isPass = test.result === 'pass'
  const accent = isPass ? C.green : C.red
  const accentSoft = isPass ? C.greenSoft : C.redSoft

  const facilityAddress = [
    test.facility_address,
    [test.facility_city, test.facility_state, test.facility_zip].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join(' — ')

  const contactAddress = [
    test.contact_address,
    [test.contact_city, test.contact_state, test.contact_zip].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join(' — ')

  const showRepairs =
    test.repair_main ||
    test.repair_bypass ||
    test.repair_notes ||
    test.after_test_time ||
    test.after_check1_held_psid != null ||
    test.after_check2_held_psid != null ||
    test.after_relief_opened_psid != null ||
    test.after_air_inlet_opened_psid != null ||
    test.after_check_valve_held_psid != null

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        {/* Header card */}
        <View
          style={{
            backgroundColor: C.card,
            borderRadius: 14,
            padding: 14,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: C.border,
            borderLeftWidth: 5,
            borderLeftColor: accent,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <View
              style={{
                backgroundColor: accentSoft,
                borderRadius: 100,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}
            >
              <Text
                style={{
                  color: accent,
                  fontWeight: '800',
                  fontSize: 11,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                {isPass ? t('backflowResultPass') : t('backflowResultFail')}
              </Text>
            </View>
            <Text style={{ color: C.sub, fontSize: 12 }}>
              {formatDate(test.test_date) || t('backflowNoDate')}
            </Text>
          </View>
          <Text style={{ color: C.navy, fontWeight: '800', fontSize: 17, marginBottom: 4 }}>
            {test.assembly_address || t('backflowNoAddress')}
          </Text>
          <Text style={{ color: C.sub, fontSize: 12, lineHeight: 16 }}>
            {[
              (at && ASSEMBLY_TYPE_LABEL[at]) || null,
              test.serial_number ? `SN ${test.serial_number}` : null,
              test.manufacturer || null,
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
          </Text>

          {isManager ? (
            <Pressable
              onPress={confirmDelete}
              style={({ pressed }) => ({
                marginTop: 12,
                backgroundColor: C.redSoft,
                borderRadius: 10,
                padding: 10,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={C.red} />
              <Text style={{ color: C.red, fontWeight: '700', fontSize: 13 }}>{t('delete')}</Text>
            </Pressable>
          ) : null}
        </View>

        <Card title={t('backflowSecPermitAssembly')}>
          <Row label={t('backflowCity')} value={test.city || test.permit_number} />
          <Row label={t('backflowAssemblyAddress')} value={test.assembly_address} />
          <Row label={t('backflowManufacturer')} value={test.manufacturer} />
          <Row label={t('backflowSize')} value={test.size} />
          <Row label={t('backflowModelNumber')} value={test.model_number} />
          <Row label={t('backflowSerialNumber')} value={test.serial_number} />
        </Card>

        <Card title={t('backflowSecFacility')}>
          <Row label={t('backflowOwner')} value={test.facility_owner} />
          <Row label={t('backflowPhone')} value={test.facility_phone} />
          <Row label={t('backflowAddress')} value={facilityAddress} />
          <Row label={t('backflowFacilityType')} value={cap(test.facility_type)} />
        </Card>

        <Card title={t('backflowSecContact')}>
          <Row label={t('backflowContactName')} value={test.contact_name} />
          <Row label={t('backflowPhone')} value={test.contact_phone} />
          <Row label={t('backflowAddress')} value={contactAddress} />
          <Row label={t('backflowStatus')} value={cap(test.assembly_status)} />
          {test.assembly_status === 'replacement' ? (
            <Row label={t('backflowOldSerial')} value={test.replacement_old_serial} />
          ) : null}
        </Card>

        <Card title={t('backflowSecLocation')}>
          <Row label={t('backflowOnSiteLocation')} value={test.on_site_location} />
          <Row label={t('backflowService')} value={cap(test.service_type)} />
        </Card>

        <Card title={t('backflowSecAssemblyType')}>
          <Row label={t('backflowFacilityType')} value={(at && ASSEMBLY_TYPE_LABEL[at]) || null} />
          <BoolRow label={t('backflowInstalledPerMfr')} value={test.installed_per_manufacturer} />
          <BoolRow label={t('backflowInstalledNonPotable')} value={test.installed_on_non_potable} />
        </Card>

        <Card title={t('backflowSecInitialTest')}>
          <Row label={t('backflowTestTime')} value={test.initial_test_time} />
          {showsCheck1And2(at) ? (
            <>
              <Row
                label="1st Check held at"
                value={test.check1_held_psid != null ? `${test.check1_held_psid} psid` : null}
              />
              <BoolRow label="1st Check closed tight" value={test.check1_closed_tight} />
              <Row
                label="2nd Check held at"
                value={test.check2_held_psid != null ? `${test.check2_held_psid} psid` : null}
              />
              <BoolRow label="2nd Check closed tight" value={test.check2_closed_tight} />
            </>
          ) : null}
          {showsRelief(at) ? (
            <>
              <Row
                label="Relief Valve opened at"
                value={test.relief_opened_psid != null ? `${test.relief_opened_psid} psid` : null}
              />
              <BoolRow label="Relief did NOT open" value={test.relief_did_not_open} />
            </>
          ) : null}
          {showsPVB(at) ? (
            <>
              <Row
                label="Air Inlet opened at"
                value={test.air_inlet_opened_psid != null ? `${test.air_inlet_opened_psid} psid` : null}
              />
              <BoolRow label={t('backflowDidNotOpen')} value={test.air_inlet_did_not_open} />
              <BoolRow label={t('backflowDidFullyOpen')} value={test.air_inlet_did_fully_open} />
              <Row
                label="Check Valve held at"
                value={test.check_valve_held_psid != null ? `${test.check_valve_held_psid} psid` : null}
              />
              <BoolRow label="Check Valve closed tight" value={test.check_valve_closed_tight} />
            </>
          ) : null}
        </Card>

        {showRepairs ? (
          <Card title={t('backflowSecRepairs')}>
            <BoolRow label={t('backflowDetailRepairsMain')} value={test.repair_main} />
            <BoolRow label={t('backflowDetailRepairsBypass')} value={test.repair_bypass} />
            <Row label={t('backflowNotesMaterials')} value={test.repair_notes} />
            {test.after_test_time ? <Row label={t('backflowRetestTime')} value={test.after_test_time} /> : null}
            {showsCheck1And2(at) &&
            (test.after_check1_held_psid != null || test.after_check2_held_psid != null) ? (
              <>
                <Row
                  label="1st Check held at"
                  value={test.after_check1_held_psid != null ? `${test.after_check1_held_psid} psid` : null}
                />
                <BoolRow label="1st Check closed tight" value={test.after_check1_closed_tight} />
                <Row
                  label="2nd Check held at"
                  value={test.after_check2_held_psid != null ? `${test.after_check2_held_psid} psid` : null}
                />
                <BoolRow label="2nd Check closed tight" value={test.after_check2_closed_tight} />
              </>
            ) : null}
            {showsRelief(at) && test.after_relief_opened_psid != null ? (
              <Row label="Relief Valve opened at" value={`${test.after_relief_opened_psid} psid`} />
            ) : null}
            {showsPVB(at) &&
            (test.after_air_inlet_opened_psid != null || test.after_check_valve_held_psid != null) ? (
              <>
                <Row
                  label="Air Inlet opened at"
                  value={
                    test.after_air_inlet_opened_psid != null ? `${test.after_air_inlet_opened_psid} psid` : null
                  }
                />
                <BoolRow label={t('backflowDidNotOpen')} value={test.after_air_inlet_did_not_open} />
                <BoolRow label={t('backflowDidFullyOpen')} value={test.after_air_inlet_did_fully_open} />
                <Row
                  label="Check Valve held at"
                  value={
                    test.after_check_valve_held_psid != null ? `${test.after_check_valve_held_psid} psid` : null
                  }
                />
                <BoolRow label="Check Valve closed tight" value={test.after_check_valve_closed_tight} />
              </>
            ) : null}
          </Card>
        ) : null}

        <Card title={t('backflowSecGauge')}>
          <Row label={t('backflowDetailGaugeMake')} value={test.gauge_make} />
          <Row label={t('backflowDetailGaugeModel')} value={test.gauge_model} />
          <Row label={t('backflowDetailGaugeSerial')} value={test.gauge_serial} />
          <Row label={t('backflowDetailCalibrationDate')} value={formatDate(test.gauge_calibration_date)} />
        </Card>

        <Card title={t('backflowSecTester')}>
          <Row label={t('backflowDetailFirmName')} value={test.firm_name} />
          <Row label={t('backflowDetailFirmAddress')} value={test.firm_address} />
          <Row label={t('backflowDetailFirmCSZ')} value={test.firm_city_state_zip} />
          <Row label={t('backflowDetailFirmPhone')} value={test.firm_phone} />
          <Row label={t('backflowDetailTester')} value={test.tester_name} />
          <Row label={t('backflowDetailLicense')} value={test.tester_license} />
          <Row label={t('backflowTestDate')} value={formatDate(test.test_date)} />
        </Card>

        {test.comments ? (
          <Card title={t('backflowSecComments')}>
            <Text style={{ color: C.navy, fontSize: 13, lineHeight: 18 }}>{test.comments}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}
