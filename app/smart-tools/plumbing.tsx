import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'

const COLORS = {
  background: '#F6F8FB',
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
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: COLORS.navy, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 4, marginBottom: 8 }}
    >
      <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 15 }}>{label || 'Calculate'}</Text>
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
  const [gpm, setGpm] = useState('')
  const [material, setMaterial] = useState('Copper')
  const [maxVel, setMaxVel] = useState('8')
  const [result, setResult] = useState<{ size: string; vel: number; id: number } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const q = parseFloat(gpm)
    const vMax = parseFloat(maxVel)
    if (isNaN(q) || q <= 0 || isNaN(vMax) || vMax <= 0) {
      setError('Enter valid GPM and max velocity.')
      return
    }
    const sizes = material === 'Copper' ? COPPER_SIZES : material === 'CPVC' ? CPVC_SIZES : PEX_SIZES
    // velocity (fps) = Q(gpm) × 0.4085 / id²
    for (const s of sizes) {
      const vel = q * 0.4085 / (s.id * s.id)
      if (vel <= vMax) {
        setResult({ size: s.label, vel, id: s.id })
        return
      }
    }
    setError('Flow exceeds largest available pipe size. Use multiple branches or larger pipe schedule.')
  }

  return (
    <CalcModal visible onClose={onClose} title="Water Pipe Sizing">
      <InfoBox text="Based on velocity method. Max velocity: 8 fps supply, 4 fps hot, 10 fps drain (general). Enter flow rate in GPM." />
      <FieldLabel label="Flow Rate (GPM)" />
      <Field value={gpm} onChange={setGpm} placeholder="e.g. 5" />
      <FieldLabel label="Pipe Material" />
      <SelectRow options={['Copper', 'CPVC', 'PEX']} value={material} onChange={setMaterial} />
      <FieldLabel label="Max Velocity (fps)" />
      <SelectRow options={['4', '6', '8', '10']} value={maxVel} onChange={setMaxVel} />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label="Recommended Pipe Size" value={result.size} sub={`${material} — ID: ${result.id}" — Velocity: ${result.vel.toFixed(1)} fps`} color="blue" />
          <InfoBox text="Next size up recommended if velocity is close to max, or if pipe run exceeds 100 ft. Always verify with local code and pressure available." />
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
const FIXTURE_DFU: { name: string; dfu: number }[] = [
  { name: 'Lavatory', dfu: 1 },
  { name: 'Kitchen Sink', dfu: 2 },
  { name: 'Bathtub', dfu: 2 },
  { name: 'Shower', dfu: 2 },
  { name: 'Toilet (tank)', dfu: 3 },
  { name: 'Toilet (flushvalve)', dfu: 6 },
  { name: 'Dishwasher', dfu: 2 },
  { name: 'Clothes Washer', dfu: 3 },
  { name: 'Floor Drain (2")', dfu: 1 },
  { name: 'Floor Drain (3")', dfu: 2 },
  { name: 'Service Sink', dfu: 3 },
  { name: 'Urinal (flushvalve)', dfu: 5 },
  { name: 'Drinking Fountain', dfu: 1 },
]

function CalcFixtureUnits({ onClose }: { onClose: () => void }) {
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ dfu: number; gpm: number } | null>(null)

  function calc() {
    let totalDFU = 0
    FIXTURE_DFU.forEach((f) => {
      const n = parseInt(counts[f.name] || '0') || 0
      totalDFU += n * f.dfu
    })
    const gpm = interpolateHunters(totalDFU)
    setResult({ dfu: totalDFU, gpm })
  }

  return (
    <CalcModal visible onClose={onClose} title="Fixture Units → GPM">
      <InfoBox text="Enter number of each fixture. Calculates total Drainage Fixture Units (DFU) and equivalent peak flow rate via Hunter's Curve (IPC Table 709.1)." />
      {FIXTURE_DFU.map((f) => (
        <View key={f.name} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: '600', fontSize: 14 }}>{f.name}</Text>
            <Text style={{ color: COLORS.subtext, fontSize: 11 }}>{f.dfu} DFU each</Text>
          </View>
          <TextInput
            value={counts[f.name] || ''}
            onChangeText={(v) => setCounts((prev) => ({ ...prev, [f.name]: v }))}
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
          <ResultCard label="Total Drainage Fixture Units" value={`${result.dfu} DFU`} color="blue" />
          <ResultCard label="Equivalent Peak Flow (Hunter's Curve)" value={`${result.gpm.toFixed(1)} GPM`} color="green" />
          <InfoBox text="Use this GPM value to size your main water service line or meter." />
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
  const [dfu, setDfu] = useState('')
  const [slope, setSlope] = useState('1/4" per ft')
  const [result, setResult] = useState<{ size: string; capacity: number } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const d = parseFloat(dfu)
    if (isNaN(d) || d < 0) { setError('Enter valid DFU value.'); return }
    const useEighth = slope === '1/8" per ft'
    for (const row of DWV_TABLE) {
      const cap = useEighth ? row.slope_eighth : row.slope_quarter
      if (d <= cap) {
        setResult({ size: row.size, capacity: cap })
        return
      }
    }
    setError('DFU exceeds table. Use 12" or larger — contact engineer.')
  }

  return (
    <CalcModal visible onClose={onClose} title="DWV Pipe Sizing">
      <InfoBox text="IPC Table 702.1 — horizontal drainage pipe sizing. Enter total DFU load for the section. Use the Fixture Units calculator to get DFU." />
      <FieldLabel label="Total DFU on This Pipe Section" />
      <Field value={dfu} onChange={setDfu} placeholder="e.g. 18" />
      <FieldLabel label="Pipe Slope" />
      <SelectRow options={['1/8" per ft', '1/4" per ft']} value={slope} onChange={setSlope} />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard
            label="Minimum Pipe Size (IPC 702.1)"
            value={result.size}
            sub={`Max capacity: ${result.capacity} DFU at ${slope}`}
            color="blue"
          />
          <InfoBox text="Stacks and building drains may have different sizing — see IPC Table 710.1. Verify with local amendments." />
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
  const [btuh, setBtuh] = useState('')
  const [length, setLength] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const b = parseFloat(btuh)
    const L = parseFloat(length)
    if (isNaN(b) || b <= 0) { setError('Enter valid BTU/hr load.'); return }
    if (isNaN(L) || L <= 0) { setError('Enter valid pipe length.'); return }

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
    setError('Load exceeds 2" pipe capacity at this length. Use multiple runs or higher pressure system.')
  }

  return (
    <CalcModal visible onClose={onClose} title="Gas Pipe Sizing">
      <InfoBox text="IFGC Table 402.4(1) — Natural gas, Schedule 40 black steel pipe, low pressure (under 0.5 psi). Uses longest-run method. For LP gas, divide BTU/hr by 2.50 before entering." />
      <FieldLabel label="Total BTU/hr Load on This Run" />
      <Field value={btuh} onChange={setBtuh} placeholder="e.g. 85000" />
      <FieldLabel label="Pipe Length — Longest Run (ft)" />
      <Field value={length} onChange={setLength} placeholder="e.g. 75" />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label="Minimum Pipe Size" value={result} sub="Schedule 40 black steel — natural gas, low pressure" color="blue" />
          <InfoBox text="Common appliance BTU/hr ratings: Furnace 80–120k, Water Heater 30–50k, Range 65k, Dryer 35k, Fireplace 30–60k. Always use your longest run for the whole system." />
        </>
      )}
    </CalcModal>
  )
}

// ─── 5. Pressure Loss (Hazen-Williams) ───────────────────────────────────────
// hL = 10.67 × L × Q^1.852 / (C^1.852 × d^4.87)
// where L=length(ft), Q=flow(gpm), C=roughness coeff, d=pipe ID(in)
// Result in ft of head. Multiply by 0.4335 for psi.

const HW_MATERIALS: { label: string; C: number }[] = [
  { label: 'Copper / Brass', C: 140 },
  { label: 'PVC / CPVC', C: 150 },
  { label: 'PEX', C: 130 },
  { label: 'Galvanized Steel', C: 120 },
  { label: 'Cast Iron (new)', C: 100 },
  { label: 'Cast Iron (old)', C: 80 },
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
    if (isNaN(Q) || Q <= 0) { setError('Enter valid flow rate.'); return }
    if (isNaN(L) || L <= 0) { setError('Enter valid pipe length.'); return }
    const mat = HW_MATERIALS[matIdx]
    const pipeData = PRESS_PIPE_SIZES.find((p) => p.label === pipeSize)
    if (!pipeData) { setError('Invalid pipe size.'); return }
    const C = mat.C
    const d = pipeData.id
    // Hazen-Williams
    const headLoss = 10.67 * L * Math.pow(Q, 1.852) / (Math.pow(C, 1.852) * Math.pow(d, 4.87))
    const psi = headLoss * 0.4335
    const vel = Q * 0.4085 / (d * d)
    setResult({ headLoss, psi, vel })
  }

  return (
    <CalcModal visible onClose={onClose} title="Pressure Loss (H-W)">
      <InfoBox text="Hazen-Williams formula for water pressure loss in straight pipe runs. Add 10-15% for fittings and valves (minor losses)." />
      <FieldLabel label="Flow Rate (GPM)" />
      <Field value={gpm} onChange={setGpm} placeholder="e.g. 10" />
      <FieldLabel label="Pipe Length (ft)" />
      <Field value={length} onChange={setLength} placeholder="e.g. 150" />
      <FieldLabel label="Pipe Size (Nominal)" />
      <SelectRow options={PRESS_PIPE_SIZES.map((p) => p.label)} value={pipeSize} onChange={setPipeSize} />
      <FieldLabel label="Pipe Material (C factor)" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {HW_MATERIALS.map((m, i) => (
            <Pressable
              key={m.label}
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
                {m.label} (C={m.C})
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label="Pressure Loss" value={`${result.psi.toFixed(2)} psi`} sub={`${result.headLoss.toFixed(1)} ft of head`} color="blue" />
          <ResultCard label="Velocity" value={`${result.vel.toFixed(1)} fps`} sub={result.vel > 8 ? 'WARNING: exceeds 8 fps — upsize pipe' : 'Within acceptable range'} color={result.vel > 8 ? 'yellow' : 'green'} />
          <InfoBox text="Available pressure at fixture = Supply pressure - static head - friction loss. Typical supply: 40-80 psi. Min at fixture: 20 psi (flush valve: 25 psi)." />
        </>
      )}
    </CalcModal>
  )
}

// ─── Tool List ────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    id: 'pipesizing',
    icon: 'pipe-valve',
    title: 'Water Pipe Sizing',
    desc: 'Size supply pipe by velocity method (copper, CPVC, PEX)',
    color: '#1565C0',
    bg: '#E3F2FD',
  },
  {
    id: 'fixunits',
    icon: 'countertop',
    title: 'Fixture Units → GPM',
    desc: 'Count fixtures, get total DFU and peak flow via Hunter\'s Curve',
    color: '#2E7D32',
    bg: '#E8F5E9',
  },
  {
    id: 'dwv',
    icon: 'arrow-down-circle',
    title: 'DWV Pipe Sizing',
    desc: 'Horizontal drain sizing per IPC Table 702.1',
    color: '#6A1B9A',
    bg: '#F3E5F5',
  },
  {
    id: 'gaspipe',
    icon: 'fire',
    title: 'Gas Pipe Sizing',
    desc: 'Natural gas pipe sizing — IFGC longest-run method',
    color: '#C62828',
    bg: '#FFEBEE',
  },
  {
    id: 'pressloss',
    icon: 'gauge',
    title: 'Pressure Loss',
    desc: 'Hazen-Williams friction loss for water supply runs',
    color: '#EF6C00',
    bg: '#FFF3E0',
  },
]

export default function PlumbingScreen() {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '900', marginBottom: 4 }}>
            Plumbing Tools
          </Text>
          <Text style={{ color: COLORS.subtext, fontSize: 14 }}>
            IPC / IFGC field calculators
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
