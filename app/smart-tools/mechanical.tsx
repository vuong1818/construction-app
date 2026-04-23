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

// ─── 1. HVAC Load (Manual J Simplified) ──────────────────────────────────────
// Cooling: 1 ton = 12,000 BTU/hr
// Simplified: Q_cool = sqft × cooling_factor (BTU/hr per sqft by climate zone)
// Heating: Q_heat = sqft × U_avg × delta_T × 1.2 (simplified)
// Using simplified rules of thumb with climate zone adjustments

const CLIMATE_ZONES = [
  { label: 'Hot/Humid (TX, FL)', coolFactor: 30, heatFactor: 15 },
  { label: 'Mixed Humid (TN, NC)', coolFactor: 25, heatFactor: 20 },
  { label: 'Mixed Dry (NM, CO)', coolFactor: 22, heatFactor: 22 },
  { label: 'Cold (MN, NY)', coolFactor: 18, heatFactor: 35 },
  { label: 'Very Cold (ND, MT)', coolFactor: 15, heatFactor: 45 },
]

function CalcHVACLoad({ onClose }: { onClose: () => void }) {
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
    if (isNaN(sf) || sf <= 0) { setError('Enter valid square footage.'); return }
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
    <CalcModal visible onClose={onClose} title="HVAC Load (Manual J)">
      <InfoBox text="Simplified Manual J estimate. Use for preliminary sizing only — full Manual J required for permits and equipment selection." />
      <FieldLabel label="Conditioned Area (sq ft)" />
      <Field value={sqft} onChange={setSqft} placeholder="e.g. 2000" />
      <FieldLabel label="Ceiling Height" />
      <SelectRow options={['8 ft', '9 ft', '10 ft', '12 ft']} value={`${ceilingHt} ft`} onChange={(v) => setCeilingHt(v.replace(' ft', ''))} />
      <FieldLabel label="Climate Zone" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {CLIMATE_ZONES.map((z, i) => (
            <Pressable
              key={z.label}
              onPress={() => setZoneIdx(i)}
              style={{
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                backgroundColor: zoneIdx === i ? COLORS.navy : COLORS.card,
                borderWidth: 1, borderColor: zoneIdx === i ? COLORS.navy : COLORS.border,
              }}
            >
              <Text style={{ color: zoneIdx === i ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 12 }}>
                {z.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <FieldLabel label="Number of Occupants (optional)" />
      <Field value={occupants} onChange={setOccupants} placeholder="e.g. 4" keyboardType="number-pad" />
      <FieldLabel label="Number of Windows (optional)" />
      <Field value={windows} onChange={setWindows} placeholder="e.g. 12" keyboardType="number-pad" />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label="Cooling Load" value={`${result.coolTons.toFixed(1)} tons`} sub={`${Math.round(result.coolBtu).toLocaleString()} BTU/hr`} color="blue" />
          <ResultCard label="Heating Load" value={`${Math.round(result.heatBtu).toLocaleString()} BTU/hr`} sub={`${(result.heatBtu / 1000).toFixed(1)} MBH`} color="yellow" />
          <InfoBox text="Round up to next available equipment size (1.5, 2, 2.5, 3, 3.5, 4, 5 ton). Oversizing causes short cycling and humidity problems." />
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

const DUCT_VELOCITIES = [
  { label: 'Main trunk', fpm: 900 },
  { label: 'Branch duct', fpm: 700 },
  { label: 'Final branch', fpm: 500 },
  { label: 'Return duct', fpm: 600 },
  { label: 'Custom', fpm: 0 },
]

function CalcDuctSizing({ onClose }: { onClose: () => void }) {
  const [cfm, setCfm] = useState('')
  const [velIdx, setVelIdx] = useState(0)
  const [customVel, setCustomVel] = useState('')
  const [ductType, setDuctType] = useState('Round')
  const [rectHeight, setRectHeight] = useState('10')
  const [result, setResult] = useState<{ roundDia: number; rectW: number; area: number; vel: number } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const q = parseFloat(cfm)
    if (isNaN(q) || q <= 0) { setError('Enter valid CFM.'); return }
    const selectedVel = DUCT_VELOCITIES[velIdx]
    const vel = selectedVel.fpm === 0 ? parseFloat(customVel) : selectedVel.fpm
    if (isNaN(vel) || vel <= 0) { setError('Enter valid velocity.'); return }

    const areaSqFt = q / vel
    const roundDia = Math.sqrt(4 * areaSqFt / Math.PI) * 12 // inches
    const h = parseFloat(rectHeight)
    const rectW = (areaSqFt * 144) / h // width in inches

    setResult({ roundDia, rectW, area: areaSqFt, vel })
  }

  return (
    <CalcModal visible onClose={onClose} title="Duct Sizing">
      <InfoBox text="Velocity method sizing. ASHRAE/SMACNA recommended velocities: main trunk 800-1000 fpm, branches 600-900 fpm, final branches 400-600 fpm." />
      <FieldLabel label="Airflow (CFM)" />
      <Field value={cfm} onChange={setCfm} placeholder="e.g. 800" />
      <FieldLabel label="Duct Application" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {DUCT_VELOCITIES.map((v, i) => (
            <Pressable
              key={v.label}
              onPress={() => setVelIdx(i)}
              style={{
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                backgroundColor: velIdx === i ? COLORS.navy : COLORS.card,
                borderWidth: 1, borderColor: velIdx === i ? COLORS.navy : COLORS.border,
              }}
            >
              <Text style={{ color: velIdx === i ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 12 }}>
                {v.label}{v.fpm > 0 ? ` (${v.fpm})` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {velIdx === DUCT_VELOCITIES.length - 1 && (
        <>
          <FieldLabel label="Custom Velocity (fpm)" />
          <Field value={customVel} onChange={setCustomVel} placeholder="e.g. 750" />
        </>
      )}
      <FieldLabel label="Duct Shape" />
      <SelectRow options={['Round', 'Rectangular']} value={ductType} onChange={setDuctType} />
      {ductType === 'Rectangular' && (
        <>
          <FieldLabel label="Duct Height (inches)" />
          <SelectRow options={['6', '8', '10', '12', '14', '16']} value={rectHeight} onChange={setRectHeight} />
        </>
      )}
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label="Round Duct Diameter" value={`${result.roundDia.toFixed(1)}"`} sub={`Round up to next standard size`} color="blue" />
          {ductType === 'Rectangular' && (
            <ResultCard label={`Rect. Duct Width (${rectHeight}" tall)`} value={`${result.rectW.toFixed(1)}"`} sub={`${result.rectW.toFixed(1)}" × ${rectHeight}" rect duct`} color="teal" />
          )}
          <ResultCard label="Duct Cross-Sectional Area" value={`${(result.area * 144).toFixed(1)} sq in`} sub={`Velocity: ${result.vel} fpm`} color="green" />
          <InfoBox text="Standard round sizes: 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24 inches. Always round up." />
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
  const [psig, setPsig] = useState('')
  const [refIdx, setRefIdx] = useState(0)
  const [result, setResult] = useState<{ satF: number; satC: number } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const p = parseFloat(psig)
    if (isNaN(p) || p < 0) { setError('Enter valid pressure (psig).'); return }
    const ref = REFRIGERANTS[refIdx]
    const satF = interpolatePT(ref.table, p)
    if (satF === null) {
      setError(`Pressure out of range for ${ref.label}. Max: ${ref.maxPsig} psig`)
      return
    }
    const satC = (satF - 32) * 5 / 9
    setResult({ satF, satC })
  }

  return (
    <CalcModal visible onClose={onClose} title="Refrigerant P-T Chart">
      <InfoBox text="Saturation temperature at given pressure. Use suction pressure for evaporator temp, discharge pressure for condenser temp. Superheat = actual suction temp - sat. suction temp." />
      <FieldLabel label="Refrigerant" />
      <SelectRow options={REFRIGERANTS.map((r) => r.label)} value={REFRIGERANTS[refIdx].label} onChange={(v) => setRefIdx(REFRIGERANTS.findIndex((r) => r.label === v))} />
      <FieldLabel label="Pressure (psig)" />
      <Field value={psig} onChange={setPsig} placeholder="e.g. 120" />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label={`${REFRIGERANTS[refIdx].label} Saturation Temp`} value={`${result.satF.toFixed(1)} °F`} sub={`${result.satC.toFixed(1)} °C`} color="blue" />
          <View style={{ backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ color: COLORS.navy, fontWeight: '800', marginBottom: 8 }}>Field Reference</Text>
            <Text style={{ color: COLORS.text, fontSize: 13, marginBottom: 4 }}>Superheat = Suction Temp (actual) - Sat. Suction Temp</Text>
            <Text style={{ color: COLORS.text, fontSize: 13, marginBottom: 4 }}>Target superheat (split AC): 10-18 F</Text>
            <Text style={{ color: COLORS.text, fontSize: 13, marginBottom: 4 }}>Subcooling = Sat. Discharge Temp - Liquid Line Temp</Text>
            <Text style={{ color: COLORS.text, fontSize: 13 }}>Target subcooling (TXV): 10-15 F</Text>
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

const SPACE_TYPES = [
  { label: 'Office',             Rp: 5,  Ra: 0.06 },
  { label: 'Conference Room',    Rp: 5,  Ra: 0.06 },
  { label: 'Classroom (K-12)',   Rp: 10, Ra: 0.12 },
  { label: 'Lobby / Reception',  Rp: 5,  Ra: 0.06 },
  { label: 'Retail',             Rp: 8,  Ra: 0.12 },
  { label: 'Gym / Fitness',      Rp: 20, Ra: 0.18 },
  { label: 'Restaurant Dining',  Rp: 18, Ra: 0.18 },
  { label: 'Kitchen (comm.)',    Rp: 7.5,Ra: 0.12 },
  { label: 'Break Room',         Rp: 5,  Ra: 0.06 },
  { label: 'Corridor',           Rp: 0,  Ra: 0.06 },
  { label: 'Warehouse',          Rp: 10, Ra: 0.06 },
  { label: 'Hospital Patient',   Rp: 25, Ra: 0.12 },
  { label: 'Residential',        Rp: 5,  Ra: 0.06 },
]

function CalcVentilation({ onClose }: { onClose: () => void }) {
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
    if (isNaN(Az) || Az <= 0) { setError('Enter valid floor area.'); return }
    if (isNaN(Pz) || Pz < 0) { setError('Enter valid occupant count.'); return }
    const sp = SPACE_TYPES[spaceIdx]
    const vbz = sp.Rp * Pz + sp.Ra * Az
    setResult({ vbz, perPerson: sp.Rp * Pz, perSqft: sp.Ra * Az })
  }

  return (
    <CalcModal visible onClose={onClose} title="Ventilation (ASHRAE 62.1)">
      <InfoBox text="ASHRAE 62.1-2022 Table 6-1. Vbz = Rp x Pz + Ra x Az. This is the breathing zone outdoor airflow — additional system corrections may apply." />
      <FieldLabel label="Space Type" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {SPACE_TYPES.map((s, i) => (
            <Pressable
              key={s.label}
              onPress={() => setSpaceIdx(i)}
              style={{
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                backgroundColor: spaceIdx === i ? COLORS.navy : COLORS.card,
                borderWidth: 1, borderColor: spaceIdx === i ? COLORS.navy : COLORS.border,
              }}
            >
              <Text style={{ color: spaceIdx === i ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 12 }}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {spaceIdx >= 0 && (
        <View style={{ backgroundColor: COLORS.blueSoft, borderRadius: 12, padding: 10, marginBottom: 10 }}>
          <Text style={{ color: COLORS.blue, fontSize: 12, fontWeight: '700' }}>
            {SPACE_TYPES[spaceIdx].label}: Rp = {SPACE_TYPES[spaceIdx].Rp} cfm/person  |  Ra = {SPACE_TYPES[spaceIdx].Ra} cfm/sqft
          </Text>
        </View>
      )}
      <FieldLabel label="Floor Area (sq ft)" />
      <Field value={sqft} onChange={setSqft} placeholder="e.g. 500" />
      <FieldLabel label="Occupant Count" />
      <Field value={occupants} onChange={setOccupants} placeholder="e.g. 20" keyboardType="number-pad" />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label="Required Outdoor Air (Vbz)" value={`${result.vbz.toFixed(0)} CFM`} color="blue" />
          <ResultCard label="People Component (Rp × Pz)" value={`${result.perPerson.toFixed(0)} CFM`} color="teal" />
          <ResultCard label="Area Component (Ra × Az)" value={`${result.perSqft.toFixed(0)} CFM`} color="green" />
          <InfoBox text="Add system ventilation efficiency (Ez) correction if needed: Voz = Vbz / Ez. Ez = 1.0 for ceiling diffusers, 0.8 for floor supply." />
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
  const [mode, setMode] = useState('CFM to Tons')
  const [value, setValue] = useState('')
  const [deltaT, setDeltaT] = useState('20')
  const [result, setResult] = useState<{ primary: number; secondary: number; btu: number } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const v = parseFloat(value)
    const dt = parseFloat(deltaT)
    if (isNaN(v) || v <= 0) { setError('Enter a valid value.'); return }
    if (isNaN(dt) || dt <= 0) { setError('Enter valid temperature difference.'); return }

    if (mode === 'CFM to Tons') {
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

  return (
    <CalcModal visible onClose={onClose} title="CFM / Tons Converter">
      <InfoBox text="Sensible heat equation: Q = 1.08 x CFM x delta_T. Rule of thumb: 400 CFM/ton for residential, 350-450 for commercial." />
      <FieldLabel label="Conversion Direction" />
      <SelectRow options={['CFM to Tons', 'Tons to CFM']} value={mode} onChange={setMode} />
      <FieldLabel label={mode === 'CFM to Tons' ? 'Airflow (CFM)' : 'Capacity (Tons)'} />
      <Field value={value} onChange={setValue} placeholder={mode === 'CFM to Tons' ? 'e.g. 1600' : 'e.g. 4'} />
      <FieldLabel label="Supply/Return Delta-T (F)" />
      <SelectRow options={['15', '18', '20', '22', '25']} value={deltaT} onChange={setDeltaT} />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          {mode === 'CFM to Tons' ? (
            <>
              <ResultCard label="Sensible Cooling Capacity" value={`${result.primary.toFixed(2)} tons`} sub={`${Math.round(result.btu).toLocaleString()} BTU/hr — based on 1.08 x CFM x dT`} color="blue" />
              <ResultCard label="Rule of Thumb (400 CFM/ton)" value={`${result.secondary.toFixed(2)} tons`} color="teal" />
            </>
          ) : (
            <>
              <ResultCard label="Required Airflow" value={`${result.primary.toFixed(0)} CFM`} sub={`Based on 1.08 x CFM x dT = ${Math.round(result.btu).toLocaleString()} BTU/hr`} color="blue" />
              <ResultCard label="Rule of Thumb (400 CFM/ton)" value={`${result.secondary.toFixed(0)} CFM`} color="teal" />
            </>
          )}
          <InfoBox text="Delta-T across coil: 15-25 F typical for A/C. High humidity or low airflow = higher delta-T. Always verify with equipment manufacturer data." />
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
  const [mode, setMode] = useState('Rect to Round')
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
    if (isNaN(a) || isNaN(b) || a <= 0 || b <= 0) { setError('Enter valid width and height.'); return }
    const De = 1.30 * Math.pow(a * b, 0.625) / Math.pow(a + b, 0.25)
    const area = (Math.PI / 4) * Math.pow(De / 12, 2) * 144
    const perimeter = Math.PI * De
    setResult({ value: De, area, perimeter })
  }

  function calcRoundToRect() {
    const D = parseFloat(roundD)
    const known = parseFloat(knownDim)
    if (isNaN(D) || D <= 0) { setError('Enter valid round diameter.'); return }
    if (isNaN(known) || known <= 0) { setError('Enter the known rect dimension.'); return }
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
    if (mode === 'Rect to Round') calcRectToRound()
    else calcRoundToRect()
  }

  return (
    <CalcModal visible onClose={onClose} title="Duct Shape Conversion">
      <InfoBox text="SMACNA equivalent diameter formula: De = 1.30 x (a x b)^0.625 / (a + b)^0.25. Preserves pressure drop characteristics." />
      <FieldLabel label="Conversion" />
      <SelectRow options={['Rect to Round', 'Round to Rect']} value={mode} onChange={(v) => { setMode(v); setResult(null); setError('') }} />
      {mode === 'Rect to Round' ? (
        <>
          <FieldLabel label="Rectangle Width (inches)" />
          <Field value={rectW} onChange={setRectW} placeholder="e.g. 20" />
          <FieldLabel label="Rectangle Height (inches)" />
          <Field value={rectH} onChange={setRectH} placeholder="e.g. 12" />
        </>
      ) : (
        <>
          <FieldLabel label="Round Duct Diameter (inches)" />
          <Field value={roundD} onChange={setRoundD} placeholder="e.g. 16" />
          <FieldLabel label="Known Rect Dimension (inches)" />
          <Field value={knownDim} onChange={setKnownDim} placeholder="e.g. 10" />
        </>
      )}
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          {mode === 'Rect to Round' ? (
            <ResultCard
              label="Equivalent Round Diameter"
              value={`${result.value.toFixed(1)}"`}
              sub={`Round up to standard size — area: ${result.area.toFixed(1)} sq in`}
              color="blue"
            />
          ) : (
            <ResultCard
              label="Required Rectangle Width"
              value={`${result.value.toFixed(1)}"`}
              sub={`${result.value.toFixed(1)}" x ${knownDim}" rect — area: ${(result.area * 144).toFixed(1)} sq in`}
              color="blue"
            />
          )}
          <InfoBox text="Standard round sizes: 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24 in. Always round up the equivalent diameter." />
        </>
      )}
    </CalcModal>
  )
}

// ─── Tool List ────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    id: 'hvacload',
    icon: 'thermometer',
    title: 'HVAC Load (Manual J)',
    desc: 'Cooling tons and heating BTU/hr by climate zone',
    color: '#C62828',
    bg: '#FFEBEE',
  },
  {
    id: 'ductsizing',
    icon: 'air-filter',
    title: 'Duct Sizing',
    desc: 'Size round or rectangular ducts by velocity method',
    color: '#2E7D32',
    bg: '#E8F5E9',
  },
  {
    id: 'refrigpt',
    icon: 'gauge',
    title: 'Refrigerant P-T Chart',
    desc: 'Saturation temperature for R-410A, R-22, R-32, R-134a',
    color: '#1565C0',
    bg: '#E3F2FD',
  },
  {
    id: 'ventilation',
    icon: 'weather-windy',
    title: 'Ventilation (ASHRAE 62.1)',
    desc: 'Outdoor air CFM by space type, occupants, and area',
    color: '#6A1B9A',
    bg: '#F3E5F5',
  },
  {
    id: 'cfmtons',
    icon: 'snowflake',
    title: 'CFM / Tons Converter',
    desc: 'Convert airflow to tons and vice versa',
    color: '#00838F',
    bg: '#E0F7FA',
  },
  {
    id: 'ductconv',
    icon: 'swap-horizontal',
    title: 'Duct Shape Conversion',
    desc: 'Round to rectangular and back — SMACNA De formula',
    color: '#EF6C00',
    bg: '#FFF3E0',
  },
]

export default function MechanicalScreen() {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '900', marginBottom: 4 }}>
            Mechanical Tools
          </Text>
          <Text style={{ color: COLORS.subtext, fontSize: 14 }}>
            HVAC / ASHRAE field calculators
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
