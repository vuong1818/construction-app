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

const C = {
  bg: '#F6F8FB',
  card: '#FFFFFF',
  navy: '#16356B',
  teal: '#19B6D2',
  yellow: '#F9A825',
  yellowSoft: '#FFF8E1',
  text: '#0F172A',
  sub: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
  green: '#22C55E',
  greenSoft: '#ECFDF5',
  red: '#EF4444',
  redSoft: '#FEF2F2',
  inputBg: '#F8FAFC',
}

const inp = {
  backgroundColor: C.inputBg,
  borderWidth: 1,
  borderColor: C.border,
  borderRadius: 10,
  padding: 12,
  fontSize: 15,
  color: C.text,
  marginBottom: 12,
}

const lbl = {
  fontSize: 12,
  fontWeight: '700' as const,
  color: C.navy,
  marginBottom: 4,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
}

// ─── NEC TABLE 310.16 ────────────────────────────────────────────────────────
const T310_16_CU: Record<string, Record<number, number | null>> = {
  '14 AWG': { 60: 15,  75: 20,  90: 25  },
  '12 AWG': { 60: 20,  75: 25,  90: 30  },
  '10 AWG': { 60: 30,  75: 35,  90: 40  },
  '8 AWG':  { 60: 40,  75: 50,  90: 55  },
  '6 AWG':  { 60: 55,  75: 65,  90: 75  },
  '4 AWG':  { 60: 70,  75: 85,  90: 95  },
  '3 AWG':  { 60: 85,  75: 100, 90: 110 },
  '2 AWG':  { 60: 95,  75: 115, 90: 130 },
  '1 AWG':  { 60: 110, 75: 130, 90: 150 },
  '1/0':    { 60: 125, 75: 150, 90: 170 },
  '2/0':    { 60: 145, 75: 175, 90: 195 },
  '3/0':    { 60: 165, 75: 200, 90: 225 },
  '4/0':    { 60: 195, 75: 230, 90: 260 },
  '250':    { 60: 215, 75: 255, 90: 290 },
  '300':    { 60: 240, 75: 285, 90: 320 },
  '350':    { 60: 260, 75: 310, 90: 350 },
  '400':    { 60: 280, 75: 335, 90: 380 },
  '500':    { 60: 320, 75: 380, 90: 430 },
  '600':    { 60: 350, 75: 420, 90: 475 },
  '750':    { 60: 400, 75: 475, 90: 535 },
  '1000':   { 60: 455, 75: 545, 90: 615 },
}
const T310_16_AL: Record<string, Record<number, number | null>> = {
  '12 AWG': { 60: 15,  75: 20,  90: 25  },
  '10 AWG': { 60: 25,  75: 30,  90: 35  },
  '8 AWG':  { 60: 30,  75: 40,  90: 45  },
  '6 AWG':  { 60: 40,  75: 50,  90: 60  },
  '4 AWG':  { 60: 55,  75: 65,  90: 75  },
  '3 AWG':  { 60: 65,  75: 75,  90: 85  },
  '2 AWG':  { 60: 75,  75: 90,  90: 100 },
  '1 AWG':  { 60: 85,  75: 100, 90: 115 },
  '1/0':    { 60: 100, 75: 120, 90: 135 },
  '2/0':    { 60: 115, 75: 135, 90: 150 },
  '3/0':    { 60: 130, 75: 155, 90: 175 },
  '4/0':    { 60: 150, 75: 180, 90: 205 },
  '250':    { 60: 170, 75: 205, 90: 230 },
  '300':    { 60: 190, 75: 230, 90: 260 },
  '350':    { 60: 210, 75: 250, 90: 280 },
  '500':    { 60: 260, 75: 310, 90: 350 },
  '750':    { 60: 320, 75: 385, 90: 435 },
  '1000':   { 60: 375, 75: 445, 90: 500 },
}

// NEC Table 9 conductor resistance (Ω/1000 ft, 75°C, steel conduit)
const T9_CU: Record<string, number> = {
  '14 AWG': 3.14, '12 AWG': 1.98, '10 AWG': 1.24, '8 AWG': 0.778,
  '6 AWG': 0.491, '4 AWG': 0.308, '3 AWG': 0.245, '2 AWG': 0.194,
  '1 AWG': 0.154, '1/0': 0.122, '2/0': 0.096, '3/0': 0.077, '4/0': 0.061,
  '250': 0.052, '300': 0.043, '350': 0.037, '400': 0.033, '500': 0.027,
  '600': 0.022, '750': 0.018, '1000': 0.013,
}
const T9_AL: Record<string, number> = {
  '12 AWG': 3.25, '10 AWG': 2.04, '8 AWG': 1.28, '6 AWG': 0.808,
  '4 AWG': 0.508, '3 AWG': 0.403, '2 AWG': 0.319, '1 AWG': 0.253,
  '1/0': 0.201, '2/0': 0.159, '3/0': 0.126, '4/0': 0.100,
  '250': 0.085, '300': 0.071, '350': 0.061, '500': 0.043, '750': 0.029, '1000': 0.021,
}

// Conduit fill areas (sq in) — NEC Chapter 9 Table 4
const CONDUIT_AREAS: Record<string, Record<string, number>> = {
  'EMT':  { '1/2"': 0.304, '3/4"': 0.533, '1"': 0.864, '1-1/4"': 1.496, '1-1/2"': 1.963, '2"': 3.356, '2-1/2"': 5.858, '3"': 8.846, '3-1/2"': 11.545, '4"': 14.753 },
  'RMC':  { '1/2"': 0.314, '3/4"': 0.549, '1"': 0.887, '1-1/4"': 1.526, '1-1/2"': 2.013, '2"': 3.408, '2-1/2"': 5.901, '3"': 8.588, '3-1/2"': 11.938, '4"': 14.753 },
  'PVC-40': { '1/2"': 0.285, '3/4"': 0.508, '1"': 0.832, '1-1/4"': 1.453, '1-1/2"': 1.986, '2"': 3.291, '2-1/2"': 5.737, '3"': 8.688, '3-1/2"': 11.545, '4"': 14.753 },
}

// Wire OD areas (sq in) — NEC Chapter 9 Table 5
const WIRE_AREAS: Record<string, Record<string, number>> = {
  'THHN/THWN': {
    '14 AWG': 0.0097, '12 AWG': 0.0133, '10 AWG': 0.0211, '8 AWG': 0.0366,
    '6 AWG': 0.0507, '4 AWG': 0.0824, '3 AWG': 0.0973, '2 AWG': 0.1158,
    '1 AWG': 0.1562, '1/0': 0.1855, '2/0': 0.2223, '3/0': 0.2660, '4/0': 0.3237,
    '250': 0.3970, '300': 0.4608, '350': 0.5242, '400': 0.5863, '500': 0.7073,
  },
  'XHHW': {
    '14 AWG': 0.0097, '12 AWG': 0.0133, '10 AWG': 0.0211, '8 AWG': 0.0366,
    '6 AWG': 0.0507, '4 AWG': 0.0824, '3 AWG': 0.0973, '2 AWG': 0.1158,
    '1 AWG': 0.1667, '1/0': 0.1963, '2/0': 0.2340, '3/0': 0.2780, '4/0': 0.3460,
    '250': 0.4194, '300': 0.4840, '350': 0.5542, '400': 0.6150, '500': 0.7419,
  },
}

// NEC Table 250.122 EGC sizes
const EGC_TABLE = [
  { ocpd: 15,   cu: '14 AWG', al: '12 AWG' },
  { ocpd: 20,   cu: '12 AWG', al: '10 AWG' },
  { ocpd: 30,   cu: '10 AWG', al: '8 AWG'  },
  { ocpd: 40,   cu: '10 AWG', al: '8 AWG'  },
  { ocpd: 60,   cu: '10 AWG', al: '8 AWG'  },
  { ocpd: 100,  cu: '8 AWG',  al: '6 AWG'  },
  { ocpd: 200,  cu: '6 AWG',  al: '4 AWG'  },
  { ocpd: 300,  cu: '4 AWG',  al: '2 AWG'  },
  { ocpd: 400,  cu: '3 AWG',  al: '1 AWG'  },
  { ocpd: 500,  cu: '2 AWG',  al: '1/0'    },
  { ocpd: 600,  cu: '1 AWG',  al: '2/0'    },
  { ocpd: 800,  cu: '1/0',    al: '3/0'    },
  { ocpd: 1000, cu: '2/0',    al: '4/0'    },
  { ocpd: 1200, cu: '3/0',    al: '250'    },
  { ocpd: 1600, cu: '4/0',    al: '350'    },
  { ocpd: 2000, cu: '250',    al: '400'    },
]

// NEC Table 9 transformer kVA common sizes
const XFMR_KVA = [15,25,37.5,50,75,100,112.5,150,167,225,300,500,750,1000,1500,2000,2500]
const XFMR_Z: Record<number, number> = {
  15:2.0,25:2.0,37.5:2.0,50:2.2,75:2.5,100:2.5,112.5:2.5,150:3.0,
  167:3.0,225:3.0,300:3.5,500:3.5,750:5.75,1000:5.75,1500:5.75,2000:5.75,2500:5.75
}

// ─── SHARED UI COMPONENTS ────────────────────────────────────────────────────

function CalcModal({ visible, title, subtitle, onClose, children }: {
  visible: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingVertical: 14,
          backgroundColor: C.navy, borderBottomWidth: 1, borderBottomColor: '#0a2550',
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.white, fontSize: 17, fontWeight: '800' }}>{title}</Text>
            {subtitle ? <Text style={{ color: '#9DD8E8', fontSize: 12, marginTop: 1 }}>{subtitle}</Text> : null}
          </View>
          <Pressable onPress={onClose} style={{ padding: 8 }}>
            <MaterialCommunityIcons name="close" size={22} color={C.white} />
          </Pressable>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

function ResultCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={{
      backgroundColor: color ? color + '18' : C.greenSoft,
      borderRadius: 12, padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: color ? color + '40' : '#86EFAC',
    }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '900', color: color || C.navy, marginTop: 2 }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  )
}

function SelectRow({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={lbl}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {options.map(opt => (
            <Pressable key={opt} onPress={() => onChange(opt)}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                backgroundColor: value === opt ? C.navy : C.card,
                borderWidth: 1, borderColor: value === opt ? C.navy : C.border,
              }}>
              <Text style={{ color: value === opt ? C.white : C.text, fontWeight: '700', fontSize: 13 }}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

function CalcButton({ onPress, label }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      backgroundColor: C.navy, borderRadius: 12, padding: 14, alignItems: 'center',
      marginVertical: 8, opacity: pressed ? 0.85 : 1,
    })}>
      <Text style={{ color: C.white, fontWeight: '800', fontSize: 15 }}>{label || 'Calculate'}</Text>
    </Pressable>
  )
}

function InfoBox({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: C.yellowSoft, borderRadius: 10, padding: 12, marginTop: 8 }}>
      <Text style={{ color: '#7B5800', fontSize: 12, lineHeight: 18 }}>{text}</Text>
    </View>
  )
}

// ─── CALCULATOR 1: TABLE 310.16 AMPACITY ─────────────────────────────────────

function Calc310_16({ onClose }: { onClose: () => void }) {
  const cuSizes = Object.keys(T310_16_CU)
  const alSizes = Object.keys(T310_16_AL)
  const [mat, setMat] = useState('CU')
  const [size, setSize] = useState('12 AWG')
  const [temp, setTemp] = useState('75')
  const [conductors, setConductors] = useState('3')
  const [result, setResult] = useState<any>(null)

  const DERATING: Record<string, number> = { '4-6': 0.80, '7-9': 0.70, '10+': 0.50 }

  function calculate() {
    const table = mat === 'CU' ? T310_16_CU : T310_16_AL
    const row = table[size]
    if (!row) return
    const base = row[parseInt(temp) as 60 | 75 | 90]
    if (!base) return
    const n = parseInt(conductors)
    let derateFactor = 1
    let derateNote = 'No derating (≤ 3 current-carrying conductors)'
    if (n >= 4 && n <= 6)  { derateFactor = 0.80; derateNote = '4–6 conductors: 80% derating (NEC 310.15(C)(1))' }
    if (n >= 7 && n <= 9)  { derateFactor = 0.70; derateNote = '7–9 conductors: 70% derating' }
    if (n >= 10)            { derateFactor = 0.50; derateNote = '10+ conductors: 50% derating' }
    const derated = Math.floor(base * derateFactor)
    setResult({ base, derated, derateFactor, derateNote, size, mat, temp })
  }

  const sizes = mat === 'CU' ? cuSizes : alSizes

  return (
    <CalcModal visible onClose={onClose} title="Table 310.16 — Ampacity" subtitle="NEC 2026 · Allowable ampacity in conduit">
      <SelectRow label="Material" options={['CU', 'AL']} value={mat} onChange={v => { setMat(v); setSize(v === 'CU' ? '12 AWG' : '12 AWG') }} />
      <SelectRow label="Insulation Temp Rating" options={['60', '75', '90']} value={temp} onChange={setTemp} />
      <Text style={lbl}>Conductor Size</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {sizes.map(s => (
            <Pressable key={s} onPress={() => setSize(s)} style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
              backgroundColor: size === s ? C.navy : C.card,
              borderWidth: 1, borderColor: size === s ? C.navy : C.border,
            }}>
              <Text style={{ color: size === s ? C.white : C.text, fontWeight: '700', fontSize: 13 }}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Text style={lbl}>Current-Carrying Conductors in Raceway</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '14', '16'].map(n => (
            <Pressable key={n} onPress={() => setConductors(n)} style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
              backgroundColor: conductors === n ? C.navy : C.card,
              borderWidth: 1, borderColor: conductors === n ? C.navy : C.border,
            }}>
              <Text style={{ color: conductors === n ? C.white : C.text, fontWeight: '700', fontSize: 13 }}>{n}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <CalcButton onPress={calculate} />

      {result && (
        <View>
          <ResultCard label="Base Ampacity" value={`${result.base} A`} sub={`${result.size} ${result.mat} at ${result.temp}°C`} />
          <ResultCard
            label="Derated Ampacity"
            value={`${result.derated} A`}
            sub={`× ${result.derateFactor} derating factor`}
            color={result.derateFactor < 1 ? '#EF4444' : '#22C55E'}
          />
          <InfoBox text={result.derateNote} />
        </View>
      )}
    </CalcModal>
  )
}

// ─── CALCULATOR 2: VOLTAGE DROP ───────────────────────────────────────────────

function CalcVoltageDrop({ onClose }: { onClose: () => void }) {
  const [phases, setPhases] = useState('3')
  const [voltage, setVoltage] = useState('480')
  const [size, setSize] = useState('12 AWG')
  const [mat, setMat] = useState('CU')
  const [amps, setAmps] = useState('')
  const [length, setLength] = useState('')
  const [result, setResult] = useState<any>(null)

  const cuSizes = Object.keys(T9_CU)

  function calculate() {
    const A = parseFloat(amps), L = parseFloat(length), V = parseFloat(voltage)
    if (!A || !L || !V) return
    const R = mat === 'CU' ? T9_CU[size] : T9_AL[size]
    if (!R) return
    const K = phases === '3' ? 1.732 : 2
    const vd = (K * R * A * L) / 1000
    const pct = (vd / V) * 100
    setResult({ vd: vd.toFixed(2), pct: pct.toFixed(2), ok: pct <= 3, size, V })
  }

  return (
    <CalcModal visible onClose={onClose} title="Voltage Drop" subtitle="NEC Ch.9 Table 9 · Recommended max 3%">
      <SelectRow label="System" options={['3-Phase', '1-Phase']} value={phases === '3' ? '3-Phase' : '1-Phase'} onChange={v => setPhases(v === '3-Phase' ? '3' : '1')} />
      <SelectRow label="Voltage (L-L)" options={['120', '208', '240', '277', '480', '600']} value={voltage} onChange={setVoltage} />
      <SelectRow label="Material" options={['CU', 'AL']} value={mat} onChange={setMat} />

      <Text style={lbl}>Wire Size</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {cuSizes.map(s => (
            <Pressable key={s} onPress={() => setSize(s)} style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
              backgroundColor: size === s ? C.navy : C.card,
              borderWidth: 1, borderColor: size === s ? C.navy : C.border,
            }}>
              <Text style={{ color: size === s ? C.white : C.text, fontWeight: '700', fontSize: 13 }}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Text style={lbl}>Load Current (A)</Text>
      <TextInput style={inp} keyboardType="numeric" value={amps} onChangeText={setAmps} placeholder="e.g. 45" placeholderTextColor={C.sub} />
      <Text style={lbl}>One-Way Length (ft)</Text>
      <TextInput style={inp} keyboardType="numeric" value={length} onChangeText={setLength} placeholder="e.g. 150" placeholderTextColor={C.sub} />

      <CalcButton onPress={calculate} />

      {result && (
        <View>
          <ResultCard label="Voltage Drop" value={`${result.vd} V`} sub={`${result.pct}% of ${result.V}V`} color={result.ok ? '#22C55E' : '#EF4444'} />
          <InfoBox text={result.ok
            ? `${result.pct}% — within the NEC recommended maximum of 3% for branch circuits.`
            : `${result.pct}% exceeds 3%. Consider a larger conductor or shorter run.`}
          />
        </View>
      )}
    </CalcModal>
  )
}

// ─── CALCULATOR 3: CONDUIT FILL ───────────────────────────────────────────────

function CalcConduitFill({ onClose }: { onClose: () => void }) {
  const [conduitType, setConduitType] = useState('EMT')
  const [conduitSize, setConduitSize] = useState('1"')
  const [wireType, setWireType] = useState('THHN/THWN')
  const [wireSize, setWireSize] = useState('12 AWG')
  const [count, setCount] = useState('')
  const [wires, setWires] = useState<{ type: string; size: string; count: number }[]>([])
  const [result, setResult] = useState<any>(null)

  function addWire() {
    const n = parseInt(count)
    if (!n || n <= 0) return
    setWires(prev => [...prev, { type: wireType, size: wireSize, count: n }])
    setCount('')
  }

  function removeWire(i: number) {
    setWires(prev => prev.filter((_, idx) => idx !== i))
    setResult(null)
  }

  function calculate() {
    const conduitArea = CONDUIT_AREAS[conduitType]?.[conduitSize]
    if (!conduitArea) return
    let totalWireArea = 0
    for (const w of wires) {
      const area = WIRE_AREAS[w.type]?.[w.size]
      if (area) totalWireArea += area * w.count
    }
    const maxFill = wires.length === 1 ? 0.53 : wires.length === 2 ? 0.31 : 0.40
    const maxArea = conduitArea * maxFill
    const fillPct = (totalWireArea / conduitArea) * 100
    const ok = totalWireArea <= maxArea
    setResult({ totalWireArea: totalWireArea.toFixed(4), conduitArea: conduitArea.toFixed(4), fillPct: fillPct.toFixed(1), maxFill: (maxFill * 100).toFixed(0), ok })
  }

  const conduitSizes = Object.keys(CONDUIT_AREAS[conduitType] || {})
  const wireSizes = Object.keys(WIRE_AREAS[wireType] || {})

  return (
    <CalcModal visible onClose={onClose} title="Conduit Fill" subtitle="NEC Ch.9 Table 1 · Max fill % by wire count">
      <SelectRow label="Conduit Type" options={['EMT', 'RMC', 'PVC-40']} value={conduitType} onChange={v => { setConduitType(v); setConduitSize('1"') }} />
      <SelectRow label="Conduit Size" options={conduitSizes} value={conduitSize} onChange={setConduitSize} />
      <SelectRow label="Wire Insulation" options={['THHN/THWN', 'XHHW']} value={wireType} onChange={setWireType} />

      <Text style={lbl}>Wire Size</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {wireSizes.map(s => (
            <Pressable key={s} onPress={() => setWireSize(s)} style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
              backgroundColor: wireSize === s ? C.navy : C.card,
              borderWidth: 1, borderColor: wireSize === s ? C.navy : C.border,
            }}>
              <Text style={{ color: wireSize === s ? C.white : C.text, fontWeight: '700', fontSize: 13 }}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Text style={lbl}>Quantity</Text>
      <TextInput style={inp} keyboardType="numeric" value={count} onChangeText={setCount} placeholder="Number of this wire" placeholderTextColor={C.sub} />

      <Pressable onPress={addWire} style={{
        backgroundColor: C.teal, borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 16,
      }}>
        <Text style={{ color: C.white, fontWeight: '700' }}>+ Add Wire</Text>
      </Pressable>

      {wires.length > 0 && (
        <View style={{ backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.border }}>
          <Text style={{ fontWeight: '700', color: C.navy, marginBottom: 8 }}>Wires in Conduit:</Text>
          {wires.map((w, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ color: C.text, fontSize: 14 }}>{w.count}× {w.size} {w.type}</Text>
              <Pressable onPress={() => removeWire(i)} style={{ padding: 4 }}>
                <MaterialCommunityIcons name="close-circle" size={18} color={C.red} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {wires.length > 0 && <CalcButton onPress={calculate} />}

      {result && (
        <View>
          <ResultCard
            label="Fill Percentage"
            value={`${result.fillPct}%`}
            sub={`Max allowed: ${result.maxFill}% for ${wires.length} wire(s)`}
            color={result.ok ? '#22C55E' : '#EF4444'}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, backgroundColor: C.inputBg, borderRadius: 10, padding: 12 }}>
              <Text style={{ fontSize: 11, color: C.sub, fontWeight: '700' }}>WIRE AREA</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.navy }}>{result.totalWireArea} in²</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: C.inputBg, borderRadius: 10, padding: 12 }}>
              <Text style={{ fontSize: 11, color: C.sub, fontWeight: '700' }}>CONDUIT AREA</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.navy }}>{result.conduitArea} in²</Text>
            </View>
          </View>
          <InfoBox text={result.ok ? 'Conduit fill is within NEC limits.' : 'Conduit is overfilled. Use a larger conduit or reduce wire count.'} />
        </View>
      )}
    </CalcModal>
  )
}

// ─── CALCULATOR 4: EGC SIZE ───────────────────────────────────────────────────

function CalcEGC({ onClose }: { onClose: () => void }) {
  const [ocpd, setOcpd] = useState('')
  const [result, setResult] = useState<any>(null)

  function calculate() {
    const a = parseFloat(ocpd)
    if (!a) return
    const row = EGC_TABLE.find(r => r.ocpd >= a) || EGC_TABLE[EGC_TABLE.length - 1]
    setResult(row)
  }

  return (
    <CalcModal visible onClose={onClose} title="Table 250.122 — EGC Size" subtitle="NEC 2026 · Equipment Grounding Conductor">
      <Text style={lbl}>OCPD Rating (A)</Text>
      <TextInput style={inp} keyboardType="numeric" value={ocpd} onChangeText={setOcpd} placeholder="e.g. 100" placeholderTextColor={C.sub} />
      <Text style={{ color: C.sub, fontSize: 12, marginBottom: 12 }}>
        Enter the rating of the upstream overcurrent device protecting this circuit.
      </Text>
      <CalcButton onPress={calculate} />
      {result && (
        <View>
          <Text style={{ fontWeight: '700', color: C.navy, marginBottom: 10, marginTop: 4 }}>
            OCPD ≤ {result.ocpd}A:
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ResultCard label="Copper EGC" value={result.cu} />
            <ResultCard label="Aluminum EGC" value={result.al} color="#1565C0" />
          </View>
          <InfoBox text="EGC may be increased proportionally if ungrounded conductors are increased above minimum size (NEC 250.122(B))." />
        </View>
      )}
    </CalcModal>
  )
}

// ─── CALCULATOR 5: BOX FILL ───────────────────────────────────────────────────

function CalcBoxFill({ onClose }: { onClose: () => void }) {
  const VOL: Record<string, number> = {
    '14 AWG': 2.00, '12 AWG': 2.25, '10 AWG': 2.50, '8 AWG': 3.00, '6 AWG': 5.00,
  }
  const [condSize, setCondSize] = useState('12 AWG')
  const [conductors, setConductors] = useState('')
  const [devices, setDevices] = useState('')
  const [clamps, setClamps] = useState('0')
  const [result, setResult] = useState<any>(null)

  function calculate() {
    const vol = VOL[condSize]
    const n = parseInt(conductors) || 0
    const d = parseInt(devices) || 0
    const cl = parseInt(clamps) || 0
    // Each conductor: 1 vol unit; each device: 2; clamps (all together): 1 if any
    const total = (n * vol) + (d * 2 * vol) + (cl > 0 ? vol : 0)
    setResult({ total: total.toFixed(2), vol })
  }

  return (
    <CalcModal visible onClose={onClose} title="Box Fill — Table 314.16(B)" subtitle="NEC 2026 · Required box volume">
      <SelectRow label="Largest Conductor Size" options={Object.keys(VOL)} value={condSize} onChange={setCondSize} />
      <Text style={lbl}>Number of Conductors</Text>
      <TextInput style={inp} keyboardType="numeric" value={conductors} onChangeText={setConductors} placeholder="All conductors entering box" placeholderTextColor={C.sub} />
      <Text style={lbl}>Devices (switches, outlets)</Text>
      <TextInput style={inp} keyboardType="numeric" value={devices} onChangeText={setDevices} placeholder="Number of devices" placeholderTextColor={C.sub} />
      <SelectRow label="Internal Cable Clamps?" options={['0', '1']} value={clamps} onChange={setClamps} />
      <CalcButton onPress={calculate} />
      {result && (
        <View>
          <ResultCard label="Required Box Volume" value={`${result.total} in³`} sub={`Based on ${result.vol} in³ per conductor (${condSize})`} />
          <InfoBox text="Select a box with a cubic inch rating equal to or greater than this value. Standard 4x4 square box = 30.3 in³, single-gang = 18 in³." />
        </View>
      )}
    </CalcModal>
  )
}

// ─── CALCULATOR 6: FAULT CURRENT (BUSSMANN P-t-P) ────────────────────────────

function CalcFaultCurrent({ onClose }: { onClose: () => void }) {
  const [phases, setPhases] = useState('3')
  const [secV, setSecV] = useState('480')
  const [kva, setKva] = useState('')
  const [zPct, setZpct] = useState('')
  const [runs, setRuns] = useState<{ id: number; label: string; size: string; mat: string; length: string; parallel: string }[]>([])
  const [points, setPoints] = useState<{ label: string; isc: number | null; note: string; drop?: string }[]>([])

  const SIZES_CU = Object.keys(T9_CU)

  function addRun() {
    setRuns(prev => [...prev, { id: Date.now(), label: '', size: '4/0', mat: 'CU', length: '', parallel: '1' }])
  }

  function updateRun(id: number, field: string, val: string) {
    setRuns(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r))
  }

  function removeRun(id: number) {
    setRuns(prev => prev.filter(r => r.id !== id))
    setPoints([])
  }

  function calculate() {
    const kvaNum = parseFloat(kva), vLL = parseFloat(secV), zNum = parseFloat(zPct) / 100
    if (!kvaNum || !vLL || !zNum) return
    const isc0 = phases === '3'
      ? (kvaNum * 1000) / (1.732 * vLL * zNum)
      : (kvaNum * 1000) / (vLL * zNum)
    const chain: typeof points = [{ label: 'Transformer Secondary', isc: isc0, note: `${kvaNum} kVA, %Z = ${zPct}%` }]
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i]
      const L = parseFloat(r.length), P = parseInt(r.parallel) || 1
      if (!L || L <= 0) { chain.push({ label: r.label || `Point ${i + 1}`, isc: null, note: 'Missing length' }); continue }
      const Rv = (r.mat === 'CU' ? T9_CU[r.size] : T9_AL[r.size]) || null
      if (!Rv) { chain.push({ label: r.label || `Point ${i + 1}`, isc: null, note: 'Invalid conductor' }); continue }
      const isc_prev = chain[chain.length - 1].isc
      if (!isc_prev) { chain.push({ label: r.label || `Point ${i + 1}`, isc: null, note: 'Upstream invalid' }); continue }
      const Reff = Rv / P
      const f = phases === '3'
        ? (1.732 * Reff * L * isc_prev) / (1000 * vLL)
        : (2 * Reff * L * isc_prev) / (1000 * vLL)
      const isc_new = isc_prev / (1 + f)
      const drop = ((1 - isc_new / isc_prev) * 100).toFixed(1)
      chain.push({ label: r.label || `Point ${i + 1}`, isc: isc_new, note: `${P > 1 ? P + ' sets ' : ''}${r.size} ${r.mat}, ${L} ft`, drop })
    }
    setPoints(chain)
  }

  const autoZ = XFMR_Z[parseFloat(kva)]

  return (
    <CalcModal visible onClose={onClose} title="Available Fault Current" subtitle="Bussmann Point-to-Point · NEC 110.9">
      <Text style={{ fontWeight: '800', color: C.navy, marginBottom: 10 }}>Step 1 — Transformer</Text>
      <SelectRow label="Phases" options={['3-Phase', '1-Phase']} value={phases === '3' ? '3-Phase' : '1-Phase'} onChange={v => { setPhases(v === '3-Phase' ? '3' : '1'); setPoints([]) }} />
      <SelectRow label="Secondary Voltage" options={phases === '3' ? ['208','240','480','600','4160'] : ['120','240','277']} value={secV} onChange={setSecV} />

      <Text style={lbl}>Transformer kVA</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {XFMR_KVA.map(k => (
            <Pressable key={k} onPress={() => { setKva(String(k)); if (!zPct) setZpct(String(XFMR_Z[k])) }} style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
              backgroundColor: kva === String(k) ? C.navy : C.card,
              borderWidth: 1, borderColor: kva === String(k) ? C.navy : C.border,
            }}>
              <Text style={{ color: kva === String(k) ? C.white : C.text, fontWeight: '700', fontSize: 13 }}>{k} kVA</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Text style={lbl}>%Z Impedance</Text>
      <TextInput style={inp} keyboardType="numeric" value={zPct} onChangeText={setZpct} placeholder={autoZ ? `Typical: ${autoZ}%` : 'e.g. 5.75'} placeholderTextColor={C.sub} />

      {runs.length > 0 && (
        <View>
          <Text style={{ fontWeight: '800', color: C.navy, marginBottom: 10, marginTop: 4 }}>Step 2 — Conductor Runs</Text>
          {runs.map((r, i) => (
            <View key={r.id} style={{ backgroundColor: C.inputBg, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: C.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontWeight: '700', color: C.navy }}>Run {i + 1}</Text>
                <Pressable onPress={() => removeRun(r.id)}>
                  <MaterialCommunityIcons name="close-circle" size={20} color={C.red} />
                </Pressable>
              </View>
              <TextInput style={{ ...inp, marginBottom: 8 }} value={r.label} onChangeText={v => updateRun(r.id, 'label', v)} placeholder="Label (e.g. MDP → Panel A)" placeholderTextColor={C.sub} />
              <SelectRow label="Material" options={['CU', 'AL']} value={r.mat} onChange={v => updateRun(r.id, 'mat', v)} />
              <Text style={lbl}>Wire Size</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {SIZES_CU.map(s => (
                    <Pressable key={s} onPress={() => updateRun(r.id, 'size', s)} style={{
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
                      backgroundColor: r.size === s ? C.teal : C.card,
                      borderWidth: 1, borderColor: r.size === s ? C.teal : C.border,
                    }}>
                      <Text style={{ color: r.size === s ? C.white : C.text, fontWeight: '700', fontSize: 12 }}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <TextInput style={{ ...inp, marginBottom: 8 }} keyboardType="numeric" value={r.length} onChangeText={v => updateRun(r.id, 'length', v)} placeholder="One-way length (ft)" placeholderTextColor={C.sub} />
              <SelectRow label="Parallel Sets" options={['1','2','3','4']} value={r.parallel} onChange={v => updateRun(r.id, 'parallel', v)} />
            </View>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={calculate} style={{ flex: 1, backgroundColor: C.navy, borderRadius: 12, padding: 14, alignItems: 'center' }}>
          <Text style={{ color: C.white, fontWeight: '800', fontSize: 15 }}>Calculate</Text>
        </Pressable>
        <Pressable onPress={addRun} style={{ flex: 1, backgroundColor: C.teal, borderRadius: 12, padding: 14, alignItems: 'center' }}>
          <Text style={{ color: C.white, fontWeight: '700' }}>+ Add Run</Text>
        </Pressable>
      </View>

      {points.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: '800', color: C.navy, marginBottom: 10 }}>Results</Text>
          {points.map((pt, i) => (
            <View key={i} style={{
              backgroundColor: i === 0 ? C.navy : C.card,
              borderRadius: 12, padding: 14, marginBottom: 8,
              borderWidth: 1, borderColor: i === 0 ? C.navy : C.border,
              flexDirection: 'row', alignItems: 'center',
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: i === 0 ? C.white : C.navy, fontSize: 14 }}>{pt.label}</Text>
                <Text style={{ color: i === 0 ? '#9DD8E8' : C.sub, fontSize: 12 }}>{pt.note}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {pt.isc ? (
                  <>
                    <Text style={{ fontWeight: '900', color: i === 0 ? C.white : (pt.isc > 10000 ? C.red : C.navy), fontSize: 18 }}>
                      {(pt.isc / 1000).toFixed(2)} kA
                    </Text>
                    <Text style={{ color: i === 0 ? '#9DD8E8' : C.sub, fontSize: 12 }}>{Math.round(pt.isc).toLocaleString()} A</Text>
                    {pt.drop && <Text style={{ color: C.yellow, fontSize: 11, fontWeight: '700' }}>↓ {pt.drop}%</Text>}
                  </>
                ) : (
                  <Text style={{ color: C.red, fontSize: 13, fontWeight: '600' }}>⚠ Error</Text>
                )}
              </View>
            </View>
          ))}
          <InfoBox text="Use these values to select properly rated overcurrent devices. All OCPDs must have an interrupting rating ≥ available fault current (NEC 110.9)." />
        </View>
      )}
    </CalcModal>
  )
}

// ─── TOOLS LIST ───────────────────────────────────────────────────────────────

const TOOLS = [
  { id: 'ampacity',    icon: 'table-large',           title: 'Table 310.16 — Ampacity',       desc: 'Allowable ampacity by wire size, insulation, and material with derating',  ref: 'NEC 2026 §310.16' },
  { id: 'vdrop',      icon: 'lightning-bolt-outline', title: 'Voltage Drop',                  desc: 'VD% for any conductor, length, and load current',                          ref: 'NEC Ch.9 Table 9' },
  { id: 'conduit',    icon: 'pipe',                   title: 'Conduit Fill',                  desc: 'Fill % for any conduit type and size with multiple wire types',             ref: 'NEC Ch.9 Table 1' },
  { id: 'egc',        icon: 'electric-switch',        title: 'EGC Size — Table 250.122',      desc: 'Equipment grounding conductor size based on OCPD rating',                  ref: 'NEC 2026 §250.122' },
  { id: 'boxfill',    icon: 'checkbox-blank-outline', title: 'Box Fill — Table 314.16(B)',    desc: 'Required box volume from conductors, devices, and clamps',                  ref: 'NEC 2026 §314.16' },
  { id: 'fault',      icon: 'flash-alert',            title: 'Available Fault Current',       desc: 'Bussmann Point-to-Point: fault current at transformer & downstream panels', ref: 'NEC 110.9 / Bussmann' },
]

export default function ElectricalTools() {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: C.navy, fontSize: 22, fontWeight: '900', marginBottom: 4 }}>⚡ Electrical Tools</Text>
          <Text style={{ color: C.sub, fontSize: 13 }}>Field calculators based on NEC 2026</Text>
        </View>

        {TOOLS.map(tool => (
          <Pressable
            key={tool.id}
            onPress={() => setOpen(tool.id)}
            style={({ pressed }) => ({
              backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12,
              borderWidth: 1, borderColor: C.border, flexDirection: 'row',
              alignItems: 'center', gap: 14, opacity: pressed ? 0.85 : 1,
            })}
          >
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: C.yellowSoft, justifyContent: 'center', alignItems: 'center' }}>
              <MaterialCommunityIcons name={tool.icon as any} size={26} color={C.yellow} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.navy, fontSize: 15, fontWeight: '800', marginBottom: 2 }}>{tool.title}</Text>
              <Text style={{ color: C.sub, fontSize: 12, lineHeight: 16 }}>{tool.desc}</Text>
              <View style={{ marginTop: 4, backgroundColor: C.yellowSoft, alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: C.yellow, fontSize: 10, fontWeight: '700' }}>{tool.ref}</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={C.sub} />
          </Pressable>
        ))}
      </ScrollView>

      {open === 'ampacity' && <Calc310_16      onClose={() => setOpen(null)} />}
      {open === 'vdrop'    && <CalcVoltageDrop onClose={() => setOpen(null)} />}
      {open === 'conduit'  && <CalcConduitFill onClose={() => setOpen(null)} />}
      {open === 'egc'      && <CalcEGC         onClose={() => setOpen(null)} />}
      {open === 'boxfill'  && <CalcBoxFill     onClose={() => setOpen(null)} />}
      {open === 'fault'    && <CalcFaultCurrent onClose={() => setOpen(null)} />}
    </SafeAreaView>
  )
}
