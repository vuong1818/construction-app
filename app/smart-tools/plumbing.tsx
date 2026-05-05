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
import { COLORS } from '../../lib/theme'

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

function Divider() {
  return <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 16 }} />
}

// ─── 1. Water Pipe Sizing ─────────────────────────────────────────────────────
// Velocity = GPM × 0.4085 / ID²  →  ID = sqrt(GPM × 0.4085 / v)
// Pick smallest pipe that keeps velocity within limits

const COPPER_SIZES = [
  { label: '3/8"', id: 0.430 },
  { label: '1/2"', id: 0.527 },
  { label: '3/4"', id: 0.745 },
  { label: '1"',   id: 0.995 },
  { label: '1-1/4"', id: 1.245 },
  { label: '1-1/2"', id: 1.481 },
  { label: '2"',   id: 1.959 },
  { label: '2-1/2"', id: 2.435 },
  { label: '3"',   id: 2.945 },
]

const CPVC_SIZES = [
  { label: '1/2"',  id: 0.526 },
  { label: '3/4"',  id: 0.722 },
  { label: '1"',    id: 0.936 },
  { label: '1-1/4"', id: 1.164 },
  { label: '1-1/2"', id: 1.356 },
  { label: '2"',    id: 1.754 },
]

const PEX_SIZES = [
  { label: '3/8"',  id: 0.350 },
  { label: '1/2"',  id: 0.475 },
  { label: '3/4"',  id: 0.671 },
  { label: '1"',    id: 0.894 },
  { label: '1-1/4"', id: 1.107 },
  { label: '1-1/2"', id: 1.265 },
  { label: '2"',    id: 1.592 },
]

function CalcPipeSizing({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [gpm, setGpm] = useState('')
  const [material, setMaterial] = useState('Copper')
  const [maxVel, setMaxVel] = useState('8')
  const [result, setResult] = useState<{ size: string; vel: number; id: number } | null>(null)
  const [error, setError] = useState('')

  const COPPER_LABEL = t('stpMatCopper')

  function calc() {
    setError('')
    setResult(null)
    const q = parseFloat(gpm)
    const vMax = parseFloat(maxVel)
    if (isNaN(q) || q <= 0 || isNaN(vMax) || vMax <= 0) {
      setError(t('stpEnterValidGpmVel'))
      return
    }
    const sizes = material === COPPER_LABEL ? COPPER_SIZES : material === 'CPVC' ? CPVC_SIZES : PEX_SIZES
    // velocity (fps) = Q(gpm) × 0.4085 / id²
    for (const s of sizes) {
      const vel = q * 0.4085 / (s.id * s.id)
      if (vel <= vMax) {
        setResult({ size: s.label, vel, id: s.id })
        return
      }
    }
    setError(t('stpFlowExceedsMax'))
  }

  return (
    <CalcModal visible onClose={onClose} title={t('stpPipeSizingTitle')}>
      <InfoBox text={t('stpPipeInfo')} />
      <FieldLabel label={t('stpFlowRateGpm')} />
      <Field value={gpm} onChange={setGpm} placeholder={t('stpFlowRatePlaceholder')} />
      <FieldLabel label={t('stpPipeMaterial')} />
      <SelectRow options={[COPPER_LABEL, 'CPVC', 'PEX']} value={material} onChange={setMaterial} />
      <FieldLabel label={t('stpMaxVelocityFps')} />
      <SelectRow options={['4', '6', '8', '10']} value={maxVel} onChange={setMaxVel} />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label={t('stpRecommendedPipeSize')} value={result.size} sub={t('stpPipeSizeSub', { material, id: result.id, vel: result.vel.toFixed(1) })} color="blue" />
          <InfoBox text={t('stpPipeSizeFooter')} />
        </>
      )}
    </CalcModal>
  )
}

// ─── 2. Fixture Units → GPM (Hunter's Curve) ─────────────────────────────────
const HUNTERS_TABLE: [number, number][] = [
  [0, 0], [1, 1.0], [2, 1.5], [3, 1.9], [4, 2.0], [5, 2.2],
  [6, 2.6], [8, 3.0], [10, 3.5], [15, 4.0], [20, 5.0], [25, 5.6],
  [30, 6.2], [40, 7.2], [50, 8.0], [60, 8.8], [75, 9.6],
  [100, 11.0], [120, 12.0], [150, 13.5], [200, 15.6], [300, 19.0],
  [400, 22.0], [500, 24.5], [750, 29.0], [1000, 33.0],
]

function interpolateHunters(dfu: number): number {
  if (dfu <= 0) return 0
  for (let i = 1; i < HUNTERS_TABLE.length; i++) {
    const [d0, g0] = HUNTERS_TABLE[i - 1]
    const [d1, g1] = HUNTERS_TABLE[i]
    if (dfu <= d1) {
      const t = (dfu - d0) / (d1 - d0)
      return g0 + t * (g1 - g0)
    }
  }
  return HUNTERS_TABLE[HUNTERS_TABLE.length - 1][1]
}

// Common fixture DFU values (IPC Table 709.1)
const FIXTURE_DFU: { key: string; nameKey: 'stpFixLavatory' | 'stpFixKitchenSink' | 'stpFixBathtub' | 'stpFixShower' | 'stpFixToiletTank' | 'stpFixToiletFlush' | 'stpFixDishwasher' | 'stpFixClothesWasher' | 'stpFixFloorDrain2' | 'stpFixFloorDrain3' | 'stpFixServiceSink' | 'stpFixUrinal' | 'stpFixDrinkingFountain'; dfu: number }[] = [
  { key: 'lavatory', nameKey: 'stpFixLavatory', dfu: 1 },
  { key: 'kitchenSink', nameKey: 'stpFixKitchenSink', dfu: 2 },
  { key: 'bathtub', nameKey: 'stpFixBathtub', dfu: 2 },
  { key: 'shower', nameKey: 'stpFixShower', dfu: 2 },
  { key: 'toiletTank', nameKey: 'stpFixToiletTank', dfu: 3 },
  { key: 'toiletFlush', nameKey: 'stpFixToiletFlush', dfu: 6 },
  { key: 'dishwasher', nameKey: 'stpFixDishwasher', dfu: 2 },
  { key: 'clothesWasher', nameKey: 'stpFixClothesWasher', dfu: 3 },
  { key: 'floorDrain2', nameKey: 'stpFixFloorDrain2', dfu: 1 },
  { key: 'floorDrain3', nameKey: 'stpFixFloorDrain3', dfu: 2 },
  { key: 'serviceSink', nameKey: 'stpFixServiceSink', dfu: 3 },
  { key: 'urinal', nameKey: 'stpFixUrinal', dfu: 5 },
  { key: 'drinkingFountain', nameKey: 'stpFixDrinkingFountain', dfu: 1 },
]

function CalcFixtureUnits({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ dfu: number; gpm: number } | null>(null)

  function calc() {
    let totalDFU = 0
    FIXTURE_DFU.forEach((f) => {
      const n = parseInt(counts[f.key] || '0') || 0
      totalDFU += n * f.dfu
    })
    const gpm = interpolateHunters(totalDFU)
    setResult({ dfu: totalDFU, gpm })
  }

  return (
    <CalcModal visible onClose={onClose} title={t('stpFixUnitsTitle')}>
      <InfoBox text={t('stpFixUnitsInfo')} />
      {FIXTURE_DFU.map((f) => (
        <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: '600', fontSize: 14 }}>{t(f.nameKey)}</Text>
            <Text style={{ color: COLORS.subtext, fontSize: 11 }}>{t('stpDfuEach', { n: f.dfu })}</Text>
          </View>
          <TextInput
            value={counts[f.key] || ''}
            onChangeText={(v) => setCounts((prev) => ({ ...prev, [f.key]: v }))}
            placeholder="0"
            placeholderTextColor={COLORS.subtext}
            keyboardType="number-pad"
            style={{
              width: 56,
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 8,
              textAlign: 'center',
              color: COLORS.text,
              fontSize: 16,
              fontWeight: '700',
            }}
          />
        </View>
      ))}
      <CalcButton onPress={calc} />
      {result && (
        <>
          <ResultCard label={t('stpTotalDfu')} value={`${result.dfu} DFU`} color="blue" />
          <ResultCard label={t('stpEquivPeakFlow')} value={`${result.gpm.toFixed(1)} GPM`} color="green" />
          <InfoBox text={t('stpFixUnitsFooter')} />
        </>
      )}
    </CalcModal>
  )
}

// ─── 3. DWV Pipe Sizing ───────────────────────────────────────────────────────
// IPC Table 702.1 — horizontal drain pipes
const DWV_TABLE: { size: string; slope_eighth: number; slope_quarter: number }[] = [
  { size: '1-1/2"', slope_eighth: 1,    slope_quarter: 3 },
  { size: '2"',     slope_eighth: 8,    slope_quarter: 6 },
  { size: '2-1/2"', slope_eighth: 12,   slope_quarter: 10 },
  { size: '3"',     slope_eighth: 20,   slope_quarter: 27 },
  { size: '4"',     slope_eighth: 90,   slope_quarter: 100 },
  { size: '5"',     slope_eighth: 200,  slope_quarter: 216 },
  { size: '6"',     slope_eighth: 700,  slope_quarter: 840 },
  { size: '8"',     slope_eighth: 1400, slope_quarter: 1920 },
  { size: '10"',    slope_eighth: 2500, slope_quarter: 3500 },
  { size: '12"',    slope_eighth: 3900, slope_quarter: 5600 },
]

function CalcDWV({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [dfu, setDfu] = useState('')
  const [slope, setSlope] = useState('1/4" per ft')
  const [result, setResult] = useState<{ size: string; capacity: number } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const d = parseFloat(dfu)
    if (isNaN(d) || d < 0) { setError(t('stpEnterValidDfu')); return }
    const useEighth = slope === '1/8" per ft'
    for (const row of DWV_TABLE) {
      const cap = useEighth ? row.slope_eighth : row.slope_quarter
      if (d <= cap) {
        setResult({ size: row.size, capacity: cap })
        return
      }
    }
    setError(t('stpDfuExceeds'))
  }

  return (
    <CalcModal visible onClose={onClose} title={t('stpDwvTitle')}>
      <InfoBox text={t('stpDwvInfo')} />
      <FieldLabel label={t('stpTotalDfuOnSection')} />
      <Field value={dfu} onChange={setDfu} placeholder={t('stpDfuPlaceholder')} />
      <FieldLabel label={t('stpPipeSlope')} />
      <SelectRow options={['1/8" per ft', '1/4" per ft']} value={slope} onChange={setSlope} />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard
            label={t('stpMinPipeSize')}
            value={result.size}
            sub={t('stpMaxCapacityAt', { cap: result.capacity, slope })}
            color="blue"
          />
          <InfoBox text={t('stpDwvFooter')} />
        </>
      )}
    </CalcModal>
  )
}

// ─── 4. Gas Pipe Sizing ───────────────────────────────────────────────────────
// IFGC Table 402.4(1) — Natural Gas, Schedule 40 steel, low pressure (<2 psi)
// Capacity in BTU/hr at various lengths and pipe sizes
// [length: {1/2: cap, 3/4: cap, 1: cap, 1.25: cap, 1.5: cap, 2: cap}]
const GAS_TABLE: { len: number; cap: Record<string, number> }[] = [
  { len: 10,  cap: { '1/2"': 175, '3/4"': 360, '1"': 680, '1-1/4"': 1400, '1-1/2"': 2100, '2"': 4100 } },
  { len: 20,  cap: { '1/2"': 120, '3/4"': 250, '1"': 465, '1-1/4"': 950,  '1-1/2"': 1460, '2"': 2850 } },
  { len: 30,  cap: { '1/2"': 97,  '3/4"': 200, '1"': 375, '1-1/4"': 770,  '1-1/2"': 1180, '2"': 2300 } },
  { len: 40,  cap: { '1/2"': 82,  '3/4"': 170, '1"': 320, '1-1/4"': 660,  '1-1/2"': 990,  '2"': 1950 } },
  { len: 50,  cap: { '1/2"': 73,  '3/4"': 151, '1"': 285, '1-1/4"': 580,  '1-1/2"': 900,  '2"': 1750 } },
  { len: 60,  cap: { '1/2"': 66,  '3/4"': 138, '1"': 260, '1-1/4"': 530,  '1-1/2"': 810,  '2"': 1600 } },
  { len: 80,  cap: { '1/2"': 57,  '3/4"': 118, '1"': 220, '1-1/4"': 460,  '1-1/2"': 700,  '2"': 1380 } },
  { len: 100, cap: { '1/2"': 50,  '3/4"': 103, '1"': 195, '1-1/4"': 400,  '1-1/2"': 620,  '2"': 1200 } },
  { len: 125, cap: { '1/2"': 44,  '3/4"': 93,  '1"': 174, '1-1/4"': 360,  '1-1/2"': 550,  '2"': 1085 } },
  { len: 150, cap: { '1/2"': 40,  '3/4"': 84,  '1"': 157, '1-1/4"': 325,  '1-1/2"': 495,  '2"': 980  } },
  { len: 200, cap: { '1/2"': 34,  '3/4"': 72,  '1"': 134, '1-1/4"': 278,  '1-1/2"': 425,  '2"': 840  } },
  { len: 250, cap: { '1/2"': 30,  '3/4"': 63,  '1"': 118, '1-1/4"': 245,  '1-1/2"': 375,  '2"': 740  } },
]
const GAS_PIPE_SIZES = ['1/2"', '3/4"', '1"', '1-1/4"', '1-1/2"', '2"']

function CalcGasPipe({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [btuh, setBtuh] = useState('')
  const [length, setLength] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const b = parseFloat(btuh)
    const L = parseFloat(length)
    if (isNaN(b) || b <= 0) { setError(t('stpEnterValidBtuh')); return }
    if (isNaN(L) || L <= 0) { setError(t('stpEnterValidLength')); return }

    // Find nearest table length (round up)
    let row = GAS_TABLE[GAS_TABLE.length - 1]
    for (const r of GAS_TABLE) {
      if (L <= r.len) { row = r; break }
    }

    for (const size of GAS_PIPE_SIZES) {
      if ((row.cap[size] || 0) >= b) {
        setResult(size)
        return
      }
    }
    setError(t('stpGasExceeds2'))
  }

  return (
    <CalcModal visible onClose={onClose} title={t('stpGasTitle')}>
      <InfoBox text={t('stpGasInfo')} />
      <FieldLabel label={t('stpTotalBtuhLoad')} />
      <Field value={btuh} onChange={setBtuh} placeholder={t('stpBtuhPlaceholder')} />
      <FieldLabel label={t('stpPipeLengthLongest')} />
      <Field value={length} onChange={setLength} placeholder={t('stpLengthPlaceholder')} />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label={t('stpMinPipeSizeShort')} value={result} sub={t('stpGasResultSub')} color="blue" />
          <InfoBox text={t('stpGasFooter')} />
        </>
      )}
    </CalcModal>
  )
}

// ─── 5. Pressure Loss (Hazen-Williams) ───────────────────────────────────────
// hL = 10.67 × L × Q^1.852 / (C^1.852 × d^4.87)
// where L=length(ft), Q=flow(gpm), C=roughness coeff, d=pipe ID(in)
// Result in ft of head. Multiply by 0.4335 for psi.

const HW_MATERIALS: { labelKey: 'stpMatCopperBrass' | 'stpMatPvcCpvc' | 'stpMatPex' | 'stpMatGalvSteel' | 'stpMatCastIronNew' | 'stpMatCastIronOld'; C: number }[] = [
  { labelKey: 'stpMatCopperBrass', C: 140 },
  { labelKey: 'stpMatPvcCpvc', C: 150 },
  { labelKey: 'stpMatPex', C: 130 },
  { labelKey: 'stpMatGalvSteel', C: 120 },
  { labelKey: 'stpMatCastIronNew', C: 100 },
  { labelKey: 'stpMatCastIronOld', C: 80 },
]

const PRESS_PIPE_SIZES: { label: string; id: number }[] = [
  { label: '1/2"',   id: 0.622 },
  { label: '3/4"',   id: 0.824 },
  { label: '1"',     id: 1.049 },
  { label: '1-1/4"', id: 1.380 },
  { label: '1-1/2"', id: 1.610 },
  { label: '2"',     id: 2.067 },
  { label: '2-1/2"', id: 2.469 },
  { label: '3"',     id: 3.068 },
  { label: '4"',     id: 4.026 },
]

function CalcPressureLoss({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [gpm, setGpm] = useState('')
  const [length, setLength] = useState('')
  const [pipeSize, setPipeSize] = useState('1"')
  const [matIdx, setMatIdx] = useState(0)
  const [result, setResult] = useState<{ headLoss: number; psi: number; vel: number } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const Q = parseFloat(gpm)
    const L = parseFloat(length)
    if (isNaN(Q) || Q <= 0) { setError(t('stpEnterValidFlow')); return }
    if (isNaN(L) || L <= 0) { setError(t('stpEnterValidLength')); return }
    const mat = HW_MATERIALS[matIdx]
    const pipeData = PRESS_PIPE_SIZES.find((p) => p.label === pipeSize)
    if (!pipeData) { setError(t('stpInvalidPipeSize')); return }
    const C = mat.C
    const d = pipeData.id
    // Hazen-Williams
    const headLoss = 10.67 * L * Math.pow(Q, 1.852) / (Math.pow(C, 1.852) * Math.pow(d, 4.87))
    const psi = headLoss * 0.4335
    const vel = Q * 0.4085 / (d * d)
    setResult({ headLoss, psi, vel })
  }

  return (
    <CalcModal visible onClose={onClose} title={t('stpPressLossTitle')}>
      <InfoBox text={t('stpPressLossInfo')} />
      <FieldLabel label={t('stpFlowRateGpm')} />
      <Field value={gpm} onChange={setGpm} placeholder={t('stpFlowRatePlaceholder10')} />
      <FieldLabel label={t('stpPipeLengthFt')} />
      <Field value={length} onChange={setLength} placeholder={t('stpPipeLengthPlaceholder')} />
      <FieldLabel label={t('stpPipeSizeNominal')} />
      <SelectRow options={PRESS_PIPE_SIZES.map((p) => p.label)} value={pipeSize} onChange={setPipeSize} />
      <FieldLabel label={t('stpPipeMaterialC')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {HW_MATERIALS.map((m, i) => (
            <Pressable
              key={m.labelKey}
              onPress={() => setMatIdx(i)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: matIdx === i ? COLORS.navy : COLORS.card,
                borderWidth: 1,
                borderColor: matIdx === i ? COLORS.navy : COLORS.border,
              }}
            >
              <Text style={{ color: matIdx === i ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 12 }}>
                {t(m.labelKey)} (C={m.C})
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label={t('stpPressureLoss')} value={`${result.psi.toFixed(2)} psi`} sub={t('stpHeadLossSub', { ft: result.headLoss.toFixed(1) })} color="blue" />
          <ResultCard label={t('stpVelocity')} value={`${result.vel.toFixed(1)} fps`} sub={result.vel > 8 ? t('stpVelOver') : t('stpVelOk')} color={result.vel > 8 ? 'yellow' : 'green'} />
          <InfoBox text={t('stpPressLossFooter')} />
        </>
      )}
    </CalcModal>
  )
}

// ─── Tool List ────────────────────────────────────────────────────────────────

export default function PlumbingScreen() {
  const { t } = useLanguage()
  const [open, setOpen] = useState<string | null>(null)

  const TOOLS = [
    { id: 'pipesizing', icon: 'pipe-valve',         title: t('stpPipeSizingTitle'), desc: t('stpPipeSizingDesc'), color: '#1565C0', bg: '#E3F2FD' },
    { id: 'fixunits',   icon: 'countertop',         title: t('stpFixUnitsTitle'),   desc: t('stpFixUnitsDesc'),   color: '#2E7D32', bg: '#E8F5E9' },
    { id: 'dwv',        icon: 'arrow-down-circle',  title: t('stpDwvTitle'),        desc: t('stpDwvDesc'),        color: '#6A1B9A', bg: '#F3E5F5' },
    { id: 'gaspipe',    icon: 'fire',               title: t('stpGasTitle'),        desc: t('stpGasDesc'),        color: '#C62828', bg: '#FFEBEE' },
    { id: 'pressloss',  icon: 'gauge',              title: t('stpPressLossTitle'),  desc: t('stpPressLossDesc'),  color: '#EF6C00', bg: '#FFF3E0' },
  ]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '900', marginBottom: 4 }}>
            {t('stpTitle')}
          </Text>
          <Text style={{ color: COLORS.subtext, fontSize: 14 }}>
            {t('stpSubtitle')}
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

      {open === 'pipesizing' && <CalcPipeSizing onClose={() => setOpen(null)} />}
      {open === 'fixunits'  && <CalcFixtureUnits onClose={() => setOpen(null)} />}
      {open === 'dwv'       && <CalcDWV onClose={() => setOpen(null)} />}
      {open === 'gaspipe'   && <CalcGasPipe onClose={() => setOpen(null)} />}
      {open === 'pressloss' && <CalcPressureLoss onClose={() => setOpen(null)} />}
    </SafeAreaView>
  )
}
