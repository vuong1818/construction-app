import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,

  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../lib/i18n'

const COLORS = {
  background: '#D6E8FF',
  card: '#FFFFFF',
  navy: '#16356B',
  teal: '#19B6D2',
  tealSoft: '#E7F9FC',
  text: '#0F172A',
  subtext: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
  yellow: '#F9A825',
  yellowSoft: '#FFF8E1',
  red: '#EF4444',
  green: '#22C55E',
  greenSoft: '#ECFDF5',
  blue: '#1565C0',
  blueSoft: '#E3F2FD',
}

// ─── Shared Components ────────────────────────────────────────────────────────

function CalcModal({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View
            style={{
              backgroundColor: COLORS.navy,
              paddingHorizontal: 20,
              paddingVertical: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '800', flex: 1 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={COLORS.white} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function ResultCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  const bg = color === 'green' ? COLORS.greenSoft : color === 'blue' ? COLORS.blueSoft : color === 'yellow' ? COLORS.yellowSoft : COLORS.tealSoft
  const fg = color === 'green' ? COLORS.green : color === 'blue' ? COLORS.blue : color === 'yellow' ? COLORS.yellow : COLORS.teal
  return (
    <View style={{ backgroundColor: bg, borderRadius: 16, padding: 14, marginBottom: 10 }}>
      <Text style={{ color: COLORS.subtext, fontSize: 12, marginBottom: 4 }}>{label}</Text>
      <Text style={{ color: fg, fontSize: 22, fontWeight: '900' }}>{value}</Text>
      {sub ? <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  )
}

function SelectRow({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {options.map((opt) => (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: value === opt ? COLORS.navy : COLORS.card,
              borderWidth: 1,
              borderColor: value === opt ? COLORS.navy : COLORS.border,
            }}
          >
            <Text style={{ color: value === opt ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 13 }}>
              {opt}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  )
}

function CalcButton({ onPress, label }: { onPress: () => void; label?: string }) {
  const { t } = useLanguage()
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: COLORS.navy, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 4, marginBottom: 8 }}
    >
      <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 15 }}>{label || t('stcCalculate')}</Text>
    </Pressable>
  )
}

function InfoBox({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: COLORS.yellowSoft, borderRadius: 12, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: COLORS.yellow }}>
      <Text style={{ color: '#7A5F00', fontSize: 12, lineHeight: 18 }}>{text}</Text>
    </View>
  )
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={{ color: COLORS.subtext, fontSize: 12, marginBottom: 4, marginTop: 10 }}>{label}</Text>
}

function Field({ value, onChange, placeholder, keyboardType }: { value: string; onChange: (v: string) => void; placeholder?: string; keyboardType?: any }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder || '0'}
      placeholderTextColor={COLORS.subtext}
      keyboardType={keyboardType || 'decimal-pad'}
      style={{
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: COLORS.text,
        fontSize: 16,
        marginBottom: 4,
      }}
    />
  )
}

// ─── 1. HVAC Load (Manual J Simplified) ──────────────────────────────────────
// Cooling: 1 ton = 12,000 BTU/hr
// Simplified: Q_cool = sqft × cooling_factor (BTU/hr per sqft by climate zone)
// Heating: Q_heat = sqft × U_avg × delta_T × 1.2 (simplified)
// Using simplified rules of thumb with climate zone adjustments

const CLIMATE_ZONES: { labelKey: 'stmZoneHotHumid' | 'stmZoneMixedHumid' | 'stmZoneMixedDry' | 'stmZoneCold' | 'stmZoneVeryCold'; coolFactor: number; heatFactor: number }[] = [
  { labelKey: 'stmZoneHotHumid',   coolFactor: 30, heatFactor: 15 },
  { labelKey: 'stmZoneMixedHumid', coolFactor: 25, heatFactor: 20 },
  { labelKey: 'stmZoneMixedDry',   coolFactor: 22, heatFactor: 22 },
  { labelKey: 'stmZoneCold',       coolFactor: 18, heatFactor: 35 },
  { labelKey: 'stmZoneVeryCold',   coolFactor: 15, heatFactor: 45 },
]

function CalcHVACLoad({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [sqft, setSqft] = useState('')
  const [ceilingHt, setCeilingHt] = useState('9')
  const [zoneIdx, setZoneIdx] = useState(0)
  const [occupants, setOccupants] = useState('')
  const [windows, setWindows] = useState('')
  const [result, setResult] = useState<{
    coolBtu: number; coolTons: number; heatBtu: number
  } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const sf = parseFloat(sqft)
    if (isNaN(sf) || sf <= 0) { setError(t('stmEnterValidSqft')); return }
    const zone = CLIMATE_ZONES[zoneIdx]
    const htFactor = parseFloat(ceilingHt) > 9 ? 1.1 : 1.0
    const occ = parseInt(occupants) || 0
    const win = parseInt(windows) || 0

    let coolBtu = sf * zone.coolFactor * htFactor
    coolBtu += occ * 600   // 600 BTU/person sensible
    coolBtu += win * 1000  // ~1000 BTU/window (single pane exposure)
    const coolTons = coolBtu / 12000

    const heatBtu = sf * zone.heatFactor * htFactor + win * 500

    setResult({ coolBtu, coolTons, heatBtu })
  }

  return (
    <CalcModal visible onClose={onClose} title={t('stmHvacLoadTitle')}>
      <InfoBox text={t('stmHvacInfo')} />
      <FieldLabel label={t('stmConditionedArea')} />
      <Field value={sqft} onChange={setSqft} placeholder={t('stmConditionedAreaPlaceholder')} />
      <FieldLabel label={t('stmCeilingHeight')} />
      <SelectRow options={['8 ft', '9 ft', '10 ft', '12 ft']} value={`${ceilingHt} ft`} onChange={(v) => setCeilingHt(v.replace(' ft', ''))} />
      <FieldLabel label={t('stmClimateZone')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {CLIMATE_ZONES.map((z, i) => (
            <Pressable
              key={z.labelKey}
              onPress={() => setZoneIdx(i)}
              style={{
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                backgroundColor: zoneIdx === i ? COLORS.navy : COLORS.card,
                borderWidth: 1, borderColor: zoneIdx === i ? COLORS.navy : COLORS.border,
              }}
            >
              <Text style={{ color: zoneIdx === i ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 12 }}>
                {t(z.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <FieldLabel label={t('stmOccupantsOptional')} />
      <Field value={occupants} onChange={setOccupants} placeholder={t('stmOccupantsPlaceholder')} keyboardType="number-pad" />
      <FieldLabel label={t('stmWindowsOptional')} />
      <Field value={windows} onChange={setWindows} placeholder={t('stmWindowsPlaceholder')} keyboardType="number-pad" />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label={t('stmCoolingLoad')} value={`${result.coolTons.toFixed(1)} tons`} sub={t('stmCoolingSub', { btu: Math.round(result.coolBtu).toLocaleString() })} color="blue" />
          <ResultCard label={t('stmHeatingLoad')} value={t('stmCoolingSub', { btu: Math.round(result.heatBtu).toLocaleString() })} sub={t('stmHeatingSub', { mbh: (result.heatBtu / 1000).toFixed(1) })} color="yellow" />
          <InfoBox text={t('stmHvacFooter')} />
        </>
      )}
    </CalcModal>
  )
}

// ─── 2. Duct Sizing (Velocity Method) ────────────────────────────────────────
// CFM = Velocity (fpm) × Area (sq ft)
// Area = CFM / velocity
// For round duct: D = sqrt(4A/pi) × 12 (inches)
// For rectangular: select W given H, A = CFM/velocity

const DUCT_VELOCITIES: { labelKey: 'stmDuctMainTrunk' | 'stmDuctBranch' | 'stmDuctFinalBranch' | 'stmDuctReturn' | 'stmDuctCustom'; fpm: number }[] = [
  { labelKey: 'stmDuctMainTrunk',   fpm: 900 },
  { labelKey: 'stmDuctBranch',      fpm: 700 },
  { labelKey: 'stmDuctFinalBranch', fpm: 500 },
  { labelKey: 'stmDuctReturn',      fpm: 600 },
  { labelKey: 'stmDuctCustom',      fpm: 0 },
]

function CalcDuctSizing({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const ductRound = t('stmDuctRound')
  const ductRect = t('stmDuctRectangular')
  const [cfm, setCfm] = useState('')
  const [velIdx, setVelIdx] = useState(0)
  const [customVel, setCustomVel] = useState('')
  const [ductType, setDuctType] = useState(ductRound)
  const [rectHeight, setRectHeight] = useState('10')
  const [result, setResult] = useState<{ roundDia: number; rectW: number; area: number; vel: number } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const q = parseFloat(cfm)
    if (isNaN(q) || q <= 0) { setError(t('stmEnterValidCfm')); return }
    const selectedVel = DUCT_VELOCITIES[velIdx]
    const vel = selectedVel.fpm === 0 ? parseFloat(customVel) : selectedVel.fpm
    if (isNaN(vel) || vel <= 0) { setError(t('stmEnterValidVelocity')); return }

    const areaSqFt = q / vel
    const roundDia = Math.sqrt(4 * areaSqFt / Math.PI) * 12 // inches
    const h = parseFloat(rectHeight)
    const rectW = (areaSqFt * 144) / h // width in inches

    setResult({ roundDia, rectW, area: areaSqFt, vel })
  }

  return (
    <CalcModal visible onClose={onClose} title={t('stmDuctSizingTitle')}>
      <InfoBox text={t('stmDuctInfo')} />
      <FieldLabel label={t('stmAirflowCfm')} />
      <Field value={cfm} onChange={setCfm} placeholder={t('stmAirflowPlaceholder')} />
      <FieldLabel label={t('stmDuctApplication')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {DUCT_VELOCITIES.map((v, i) => (
            <Pressable
              key={v.labelKey}
              onPress={() => setVelIdx(i)}
              style={{
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                backgroundColor: velIdx === i ? COLORS.navy : COLORS.card,
                borderWidth: 1, borderColor: velIdx === i ? COLORS.navy : COLORS.border,
              }}
            >
              <Text style={{ color: velIdx === i ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 12 }}>
                {t(v.labelKey)}{v.fpm > 0 ? ` (${v.fpm})` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {velIdx === DUCT_VELOCITIES.length - 1 && (
        <>
          <FieldLabel label={t('stmCustomVelocityFpm')} />
          <Field value={customVel} onChange={setCustomVel} placeholder={t('stmCustomVelocityPlaceholder')} />
        </>
      )}
      <FieldLabel label={t('stmDuctShape')} />
      <SelectRow options={[ductRound, ductRect]} value={ductType} onChange={setDuctType} />
      {ductType === ductRect && (
        <>
          <FieldLabel label={t('stmDuctHeightInches')} />
          <SelectRow options={['6', '8', '10', '12', '14', '16']} value={rectHeight} onChange={setRectHeight} />
        </>
      )}
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label={t('stmRoundDuctDiameter')} value={`${result.roundDia.toFixed(1)}"`} sub={t('stmRoundUpToStandard')} color="blue" />
          {ductType === ductRect && (
            <ResultCard label={t('stmRectDuctWidth', { h: rectHeight })} value={`${result.rectW.toFixed(1)}"`} sub={t('stmRectDuctSub', { w: result.rectW.toFixed(1), h: rectHeight })} color="teal" />
          )}
          <ResultCard label={t('stmDuctArea')} value={`${(result.area * 144).toFixed(1)} sq in`} sub={t('stmVelocityFpm', { vel: result.vel })} color="green" />
          <InfoBox text={t('stmDuctFooter')} />
        </>
      )}
    </CalcModal>
  )
}

// ─── 3. Refrigerant P-T Chart ─────────────────────────────────────────────────
// Saturation temperatures at given pressures for common refrigerants
// Data: approximate saturation temp (F) at given psig

const R410A_PT: [number, number][] = [
  [0, -62], [10, -48], [20, -37], [30, -27], [40, -19], [50, -12],
  [60, -6], [70, 0], [80, 5], [90, 10], [100, 14], [110, 18],
  [120, 22], [130, 26], [140, 29], [150, 32], [175, 39], [200, 46],
  [225, 51], [250, 57], [275, 62], [300, 66], [325, 71], [350, 74],
  [375, 78], [400, 82], [425, 85], [450, 88], [475, 91], [500, 94],
]

const R22_PT: [number, number][] = [
  [0, -41], [10, -29], [20, -20], [30, -12], [40, -6], [50, 0],
  [60, 5], [70, 9], [80, 14], [90, 18], [100, 21], [110, 25],
  [120, 28], [130, 31], [140, 34], [150, 37], [175, 44], [200, 50],
  [225, 56], [250, 61], [275, 66], [300, 71],
]

const R32_PT: [number, number][] = [
  [0, -62], [20, -42], [40, -27], [60, -14], [80, -4], [100, 5],
  [120, 12], [140, 19], [160, 25], [180, 31], [200, 36], [225, 42],
  [250, 48], [275, 53], [300, 58], [325, 63], [350, 67], [400, 75],
]

const R134A_PT: [number, number][] = [
  [0, -15], [10, -8], [20, -2], [30, 4], [40, 9], [50, 14],
  [60, 18], [70, 22], [80, 26], [90, 29], [100, 33], [110, 36],
  [120, 39], [130, 42], [140, 45], [150, 47], [175, 53], [200, 59],
]

function interpolatePT(table: [number, number][], psig: number): number | null {
  if (psig < table[0][0]) return null
  for (let i = 1; i < table.length; i++) {
    if (psig <= table[i][0]) {
      const [p0, t0] = table[i - 1]
      const [p1, t1] = table[i]
      const ratio = (psig - p0) / (p1 - p0)
      return t0 + ratio * (t1 - t0)
    }
  }
  return null
}

const REFRIGERANTS = [
  { label: 'R-410A', table: R410A_PT, maxPsig: 500 },
  { label: 'R-22',   table: R22_PT,   maxPsig: 300 },
  { label: 'R-32',   table: R32_PT,   maxPsig: 400 },
  { label: 'R-134a', table: R134A_PT, maxPsig: 200 },
]

function CalcRefrigPT({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [psig, setPsig] = useState('')
  const [refIdx, setRefIdx] = useState(0)
  const [result, setResult] = useState<{ satF: number; satC: number } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const p = parseFloat(psig)
    if (isNaN(p) || p < 0) { setError(t('stmEnterValidPressure')); return }
    const ref = REFRIGERANTS[refIdx]
    const satF = interpolatePT(ref.table, p)
    if (satF === null) {
      setError(t('stmPressureOutOfRange', { ref: ref.label, max: ref.maxPsig }))
      return
    }
    const satC = (satF - 32) * 5 / 9
    setResult({ satF, satC })
  }

  return (
    <CalcModal visible onClose={onClose} title={t('stmRefrigPtTitle')}>
      <InfoBox text={t('stmRefrigPtInfo')} />
      <FieldLabel label={t('stmRefrigerant')} />
      <SelectRow options={REFRIGERANTS.map((r) => r.label)} value={REFRIGERANTS[refIdx].label} onChange={(v) => setRefIdx(REFRIGERANTS.findIndex((r) => r.label === v))} />
      <FieldLabel label={t('stmPressurePsig')} />
      <Field value={psig} onChange={setPsig} placeholder={t('stmPressurePlaceholder')} />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label={t('stmRefrigSatTemp', { ref: REFRIGERANTS[refIdx].label })} value={`${result.satF.toFixed(1)} °F`} sub={`${result.satC.toFixed(1)} °C`} color="blue" />
          <View style={{ backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ color: COLORS.navy, fontWeight: '800', marginBottom: 8 }}>{t('stmFieldReference')}</Text>
            <Text style={{ color: COLORS.text, fontSize: 13, marginBottom: 4 }}>{t('stmSuperheatFormula')}</Text>
            <Text style={{ color: COLORS.text, fontSize: 13, marginBottom: 4 }}>{t('stmTargetSuperheat')}</Text>
            <Text style={{ color: COLORS.text, fontSize: 13, marginBottom: 4 }}>{t('stmSubcoolingFormula')}</Text>
            <Text style={{ color: COLORS.text, fontSize: 13 }}>{t('stmTargetSubcooling')}</Text>
          </View>
        </>
      )}
    </CalcModal>
  )
}

// ─── 4. Ventilation (ASHRAE 62.1) ─────────────────────────────────────────────
// Vbz = Rp × Pz + Ra × Az
// Rp = outdoor air per person (cfm/person), Ra = outdoor air per area (cfm/sqft)
// ASHRAE 62.1-2022 Table 6-1 defaults

const SPACE_TYPES: { labelKey: 'stmSpaceOffice' | 'stmSpaceConference' | 'stmSpaceClassroom' | 'stmSpaceLobby' | 'stmSpaceRetail' | 'stmSpaceGym' | 'stmSpaceRestaurant' | 'stmSpaceKitchen' | 'stmSpaceBreakRoom' | 'stmSpaceCorridor' | 'stmSpaceWarehouse' | 'stmSpaceHospital' | 'stmSpaceResidential'; Rp: number; Ra: number }[] = [
  { labelKey: 'stmSpaceOffice',      Rp: 5,   Ra: 0.06 },
  { labelKey: 'stmSpaceConference',  Rp: 5,   Ra: 0.06 },
  { labelKey: 'stmSpaceClassroom',   Rp: 10,  Ra: 0.12 },
  { labelKey: 'stmSpaceLobby',       Rp: 5,   Ra: 0.06 },
  { labelKey: 'stmSpaceRetail',      Rp: 8,   Ra: 0.12 },
  { labelKey: 'stmSpaceGym',         Rp: 20,  Ra: 0.18 },
  { labelKey: 'stmSpaceRestaurant',  Rp: 18,  Ra: 0.18 },
  { labelKey: 'stmSpaceKitchen',     Rp: 7.5, Ra: 0.12 },
  { labelKey: 'stmSpaceBreakRoom',   Rp: 5,   Ra: 0.06 },
  { labelKey: 'stmSpaceCorridor',    Rp: 0,   Ra: 0.06 },
  { labelKey: 'stmSpaceWarehouse',   Rp: 10,  Ra: 0.06 },
  { labelKey: 'stmSpaceHospital',    Rp: 25,  Ra: 0.12 },
  { labelKey: 'stmSpaceResidential', Rp: 5,   Ra: 0.06 },
]

function CalcVentilation({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [spaceIdx, setSpaceIdx] = useState(0)
  const [sqft, setSqft] = useState('')
  const [occupants, setOccupants] = useState('')
  const [result, setResult] = useState<{ vbz: number; perPerson: number; perSqft: number } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const Az = parseFloat(sqft)
    const Pz = parseFloat(occupants)
    if (isNaN(Az) || Az <= 0) { setError(t('stmEnterValidArea')); return }
    if (isNaN(Pz) || Pz < 0) { setError(t('stmEnterValidOccupants')); return }
    const sp = SPACE_TYPES[spaceIdx]
    const vbz = sp.Rp * Pz + sp.Ra * Az
    setResult({ vbz, perPerson: sp.Rp * Pz, perSqft: sp.Ra * Az })
  }

  return (
    <CalcModal visible onClose={onClose} title={t('stmVentilationTitle')}>
      <InfoBox text={t('stmVentInfo')} />
      <FieldLabel label={t('stmSpaceType')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {SPACE_TYPES.map((s, i) => (
            <Pressable
              key={s.labelKey}
              onPress={() => setSpaceIdx(i)}
              style={{
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                backgroundColor: spaceIdx === i ? COLORS.navy : COLORS.card,
                borderWidth: 1, borderColor: spaceIdx === i ? COLORS.navy : COLORS.border,
              }}
            >
              <Text style={{ color: spaceIdx === i ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 12 }}>
                {t(s.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {spaceIdx >= 0 && (
        <View style={{ backgroundColor: COLORS.blueSoft, borderRadius: 12, padding: 10, marginBottom: 10 }}>
          <Text style={{ color: COLORS.blue, fontSize: 12, fontWeight: '700' }}>
            {t('stmSpaceRpRa', { label: t(SPACE_TYPES[spaceIdx].labelKey), rp: SPACE_TYPES[spaceIdx].Rp, ra: SPACE_TYPES[spaceIdx].Ra })}
          </Text>
        </View>
      )}
      <FieldLabel label={t('stmFloorAreaSqft')} />
      <Field value={sqft} onChange={setSqft} placeholder={t('stmFloorAreaPlaceholder')} />
      <FieldLabel label={t('stmOccupantCount')} />
      <Field value={occupants} onChange={setOccupants} placeholder={t('stmOccupantCountPlaceholder')} keyboardType="number-pad" />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label={t('stmRequiredOutdoorAir')} value={`${result.vbz.toFixed(0)} CFM`} color="blue" />
          <ResultCard label={t('stmPeopleComponent')} value={`${result.perPerson.toFixed(0)} CFM`} color="teal" />
          <ResultCard label={t('stmAreaComponent')} value={`${result.perSqft.toFixed(0)} CFM`} color="green" />
          <InfoBox text={t('stmVentFooter')} />
        </>
      )}
    </CalcModal>
  )
}

// ─── 5. CFM / Tons Converter ──────────────────────────────────────────────────
// Rule of thumb: 400 CFM per ton (common), 350-450 range
// For specific applications: Q = 1.08 × CFM × delta_T (sensible)
// 1 ton = 12,000 BTU/hr; 1 BTU/hr = 0.0833 CFM (approx at 20F delta_T)

function CalcCFMTons({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  // Mode is a stable internal key so language toggles don't break comparisons.
  const [mode, setMode] = useState<'cfm_to_tons' | 'tons_to_cfm'>('cfm_to_tons')
  const cfmToTonsLabel = t('stmCfmToTons')
  const tonsToCfmLabel = t('stmTonsToCfm')
  const labelToKey = (label: string): 'cfm_to_tons' | 'tons_to_cfm' =>
    label === tonsToCfmLabel ? 'tons_to_cfm' : 'cfm_to_tons'
  const [value, setValue] = useState('')
  const [deltaT, setDeltaT] = useState('20')
  const [result, setResult] = useState<{ primary: number; secondary: number; btu: number } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const v = parseFloat(value)
    const dt = parseFloat(deltaT)
    if (isNaN(v) || v <= 0) { setError(t('stmEnterValidValue')); return }
    if (isNaN(dt) || dt <= 0) { setError(t('stmEnterValidDeltaT')); return }

    if (mode === 'cfm_to_tons') {
      // Q_btu = 1.08 × CFM × delta_T (sensible only)
      const btu = 1.08 * v * dt
      const tons = btu / 12000
      const sqftRule = v / 400
      setResult({ primary: tons, secondary: sqftRule, btu })
    } else {
      // Tons to CFM
      const btu = v * 12000
      const cfm = btu / (1.08 * dt)
      const cfmRule = v * 400
      setResult({ primary: cfm, secondary: cfmRule, btu })
    }
  }

  const currentLabel = mode === 'cfm_to_tons' ? cfmToTonsLabel : tonsToCfmLabel

  return (
    <CalcModal visible onClose={onClose} title={t('stmCfmTonsTitle')}>
      <InfoBox text={t('stmCfmTonsInfo')} />
      <FieldLabel label={t('stmConversionDirection')} />
      <SelectRow options={[cfmToTonsLabel, tonsToCfmLabel]} value={currentLabel} onChange={(label) => setMode(labelToKey(label))} />
      <FieldLabel label={mode === 'cfm_to_tons' ? t('stmAirflowCfm') : t('stmCapacityTons')} />
      <Field value={value} onChange={setValue} placeholder={mode === 'cfm_to_tons' ? t('stmCfmToTonsPlaceholder') : t('stmTonsToCfmPlaceholder')} />
      <FieldLabel label={t('stmDeltaTF')} />
      <SelectRow options={['15', '18', '20', '22', '25']} value={deltaT} onChange={setDeltaT} />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          {mode === 'cfm_to_tons' ? (
            <>
              <ResultCard label={t('stmSensibleCoolingCapacity')} value={`${result.primary.toFixed(2)} tons`} sub={t('stmSensibleSub', { btu: Math.round(result.btu).toLocaleString() })} color="blue" />
              <ResultCard label={t('stmRuleOfThumb')} value={`${result.secondary.toFixed(2)} tons`} color="teal" />
            </>
          ) : (
            <>
              <ResultCard label={t('stmRequiredAirflow')} value={`${result.primary.toFixed(0)} CFM`} sub={t('stmRequiredAirflowSub', { btu: Math.round(result.btu).toLocaleString() })} color="blue" />
              <ResultCard label={t('stmRuleOfThumb')} value={`${result.secondary.toFixed(0)} CFM`} color="teal" />
            </>
          )}
          <InfoBox text={t('stmCfmTonsFooter')} />
        </>
      )}
    </CalcModal>
  )
}

// ─── 6. Duct Shape Conversion ─────────────────────────────────────────────────
// Equivalent round diameter: De = 1.30 × (a × b)^0.625 / (a + b)^0.25 (SMACNA)
// Rect to round: direct formula
// Round to rect: bisect — find width given height such that De = target round diameter

function CalcDuctConversion({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  // Mode is a stable internal key so language toggles don't break comparisons.
  const [mode, setMode] = useState<'rect_to_round' | 'round_to_rect'>('rect_to_round')
  const rectToRoundLabel = t('stmRectToRound')
  const roundToRectLabel = t('stmRoundToRect')
  const labelToKey = (label: string): 'rect_to_round' | 'round_to_rect' =>
    label === roundToRectLabel ? 'round_to_rect' : 'rect_to_round'
  // Rect to Round
  const [rectW, setRectW] = useState('')
  const [rectH, setRectH] = useState('')
  // Round to Rect
  const [roundD, setRoundD] = useState('')
  const [knownDim, setKnownDim] = useState('')

  const [result, setResult] = useState<{ value: number; area: number; perimeter: number } | null>(null)
  const [error, setError] = useState('')

  function calcRectToRound() {
    const a = parseFloat(rectW)
    const b = parseFloat(rectH)
    if (isNaN(a) || isNaN(b) || a <= 0 || b <= 0) { setError(t('stmEnterValidWH')); return }
    const De = 1.30 * Math.pow(a * b, 0.625) / Math.pow(a + b, 0.25)
    const area = (Math.PI / 4) * Math.pow(De / 12, 2) * 144
    const perimeter = Math.PI * De
    setResult({ value: De, area, perimeter })
  }

  function calcRoundToRect() {
    const D = parseFloat(roundD)
    const known = parseFloat(knownDim)
    if (isNaN(D) || D <= 0) { setError(t('stmEnterValidRoundD')); return }
    if (isNaN(known) || known <= 0) { setError(t('stmEnterValidKnownDim')); return }
    // Bisect: find unknown dimension x such that De(known, x) = D
    let lo = 1, hi = 200, mid = 50
    for (let i = 0; i < 60; i++) {
      mid = (lo + hi) / 2
      const De = 1.30 * Math.pow(known * mid, 0.625) / Math.pow(known + mid, 0.25)
      if (De < D) lo = mid; else hi = mid
    }
    const area = (known * mid) / 144
    const perimeter = 2 * (known + mid)
    setResult({ value: mid, area, perimeter })
  }

  function calc() {
    setError('')
    setResult(null)
    if (mode === 'rect_to_round') calcRectToRound()
    else calcRoundToRect()
  }

  const currentLabel = mode === 'rect_to_round' ? rectToRoundLabel : roundToRectLabel

  return (
    <CalcModal visible onClose={onClose} title={t('stmDuctConvTitle')}>
      <InfoBox text={t('stmDuctConvInfo')} />
      <FieldLabel label={t('stmConversion')} />
      <SelectRow options={[rectToRoundLabel, roundToRectLabel]} value={currentLabel} onChange={(label) => { setMode(labelToKey(label)); setResult(null); setError('') }} />
      {mode === 'rect_to_round' ? (
        <>
          <FieldLabel label={t('stmRectWidth')} />
          <Field value={rectW} onChange={setRectW} placeholder={t('stmRectWidthPlaceholder')} />
          <FieldLabel label={t('stmRectHeight')} />
          <Field value={rectH} onChange={setRectH} placeholder={t('stmRectHeightPlaceholder')} />
        </>
      ) : (
        <>
          <FieldLabel label={t('stmRoundDiameter')} />
          <Field value={roundD} onChange={setRoundD} placeholder={t('stmRoundDiameterPlaceholder')} />
          <FieldLabel label={t('stmKnownRectDim')} />
          <Field value={knownDim} onChange={setKnownDim} placeholder={t('stmKnownRectDimPlaceholder')} />
        </>
      )}
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          {mode === 'rect_to_round' ? (
            <ResultCard
              label={t('stmEquivRoundDiameter')}
              value={`${result.value.toFixed(1)}"`}
              sub={t('stmEquivRoundSub', { area: result.area.toFixed(1) })}
              color="blue"
            />
          ) : (
            <ResultCard
              label={t('stmRequiredRectWidth')}
              value={`${result.value.toFixed(1)}"`}
              sub={t('stmRequiredRectSub', { w: result.value.toFixed(1), h: knownDim, area: (result.area * 144).toFixed(1) })}
              color="blue"
            />
          )}
          <InfoBox text={t('stmDuctConvFooter')} />
        </>
      )}
    </CalcModal>
  )
}

// ─── Tool List ────────────────────────────────────────────────────────────────

export default function MechanicalScreen() {
  const { t } = useLanguage()
  const [open, setOpen] = useState<string | null>(null)

  const TOOLS = [
    { id: 'hvacload',    icon: 'thermometer',     title: t('stmHvacLoadTitle'),    desc: t('stmHvacLoadDesc'),    color: '#C62828', bg: '#FFEBEE' },
    { id: 'ductsizing',  icon: 'air-filter',      title: t('stmDuctSizingTitle'),  desc: t('stmDuctSizingDesc'),  color: '#2E7D32', bg: '#E8F5E9' },
    { id: 'refrigpt',    icon: 'gauge',           title: t('stmRefrigPtTitle'),    desc: t('stmRefrigPtDesc'),    color: '#1565C0', bg: '#E3F2FD' },
    { id: 'ventilation', icon: 'weather-windy',   title: t('stmVentilationTitle'), desc: t('stmVentilationDesc'), color: '#6A1B9A', bg: '#F3E5F5' },
    { id: 'cfmtons',     icon: 'snowflake',       title: t('stmCfmTonsTitle'),     desc: t('stmCfmTonsDesc'),     color: '#00838F', bg: '#E0F7FA' },
    { id: 'ductconv',    icon: 'swap-horizontal', title: t('stmDuctConvTitle'),    desc: t('stmDuctConvDesc'),    color: '#EF6C00', bg: '#FFF3E0' },
  ]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '900', marginBottom: 4 }}>
            {t('stmTitle')}
          </Text>
          <Text style={{ color: COLORS.subtext, fontSize: 14 }}>
            {t('stmSubtitle')}
          </Text>
        </View>

        {TOOLS.map((tool) => (
          <Pressable
            key={tool.id}
            onPress={() => setOpen(tool.id)}
            style={({ pressed }) => ({
              backgroundColor: COLORS.card,
              borderRadius: 20,
              padding: 18,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: COLORS.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: tool.bg,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <MaterialCommunityIcons name={tool.icon as any} size={28} color={tool.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.navy, fontSize: 16, fontWeight: '800', marginBottom: 2 }}>
                {tool.title}
              </Text>
              <Text style={{ color: COLORS.subtext, fontSize: 13 }}>{tool.desc}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.subtext} />
          </Pressable>
        ))}
      </ScrollView>

      {open === 'hvacload'   && <CalcHVACLoad onClose={() => setOpen(null)} />}
      {open === 'ductsizing' && <CalcDuctSizing onClose={() => setOpen(null)} />}
      {open === 'refrigpt'   && <CalcRefrigPT onClose={() => setOpen(null)} />}
      {open === 'ventilation' && <CalcVentilation onClose={() => setOpen(null)} />}
      {open === 'cfmtons'    && <CalcCFMTons onClose={() => setOpen(null)} />}
      {open === 'ductconv'   && <CalcDuctConversion onClose={() => setOpen(null)} />}
    </SafeAreaView>
  )
}
