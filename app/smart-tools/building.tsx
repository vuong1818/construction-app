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

// ─── 1. Concrete Volume ───────────────────────────────────────────────────────
// Volume in cubic yards. 1 CY = 27 CF.
// Slab: L × W × T / 27
// Footing: L × W × D / 27
// Column: pi/4 × D^2 × H / 27 (round) or W × W × H / 27 (square)
// Wall: L × H × T / 27

type ConcreteType = 'Slab' | 'Footing' | 'Round Column' | 'Square Column' | 'Wall'

function CalcConcrete({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<ConcreteType>('Slab')
  const [L, setL] = useState('')  // length / diameter
  const [W, setW] = useState('')  // width / side
  const [D, setD] = useState('')  // depth / height / thickness
  const [qty, setQty] = useState('1')
  const [result, setResult] = useState<{ cy: number; cf: number; bags80: number } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const l = parseFloat(L)
    const w = parseFloat(W)
    const d = parseFloat(D)
    const q = parseInt(qty) || 1
    if (isNaN(d) || d <= 0) { setError('Enter valid depth/height.'); return }

    let cf = 0
    if (type === 'Slab' || type === 'Footing') {
      if (isNaN(l) || l <= 0 || isNaN(w) || w <= 0) { setError('Enter valid length and width.'); return }
      // D is in inches for slab thickness, convert
      cf = l * w * (d / 12)
    } else if (type === 'Round Column') {
      if (isNaN(l) || l <= 0) { setError('Enter valid diameter.'); return }
      // L = diameter in inches, D = height in feet
      cf = (Math.PI / 4) * Math.pow(l / 12, 2) * d
    } else if (type === 'Square Column') {
      if (isNaN(l) || l <= 0) { setError('Enter valid side dimension.'); return }
      // L = side in inches, D = height in feet
      cf = Math.pow(l / 12, 2) * d
    } else if (type === 'Wall') {
      if (isNaN(l) || l <= 0 || isNaN(w) || w <= 0) { setError('Enter valid length and height.'); return }
      // L = length (ft), W = height (ft), D = thickness (inches)
      cf = l * w * (d / 12)
    }

    cf *= q
    const cy = cf / 27
    // 80lb bag = 0.6 CF, so bags needed
    const bags80 = Math.ceil(cf / 0.6)

    setResult({ cy, cf, bags80 })
  }

  const dimLabels: Record<ConcreteType, { l: string; w: string; d: string }> = {
    'Slab':         { l: 'Length (ft)', w: 'Width (ft)',    d: 'Thickness (in)' },
    'Footing':      { l: 'Length (ft)', w: 'Width (in)',    d: 'Depth (in)' },
    'Round Column': { l: 'Diameter (in)', w: '',             d: 'Height (ft)' },
    'Square Column':{ l: 'Side (in)',     w: '',             d: 'Height (ft)' },
    'Wall':         { l: 'Length (ft)', w: 'Height (ft)',   d: 'Thickness (in)' },
  }
  const labels = dimLabels[type]

  return (
    <CalcModal visible onClose={onClose} title="Concrete Volume">
      <InfoBox text="Calculates concrete volume in cubic yards. Add 5-10% waste factor for ordering. 1 CY = 27 CF. 80-lb bag = 0.6 CF." />
      <FieldLabel label="Pour Type" />
      <SelectRow
        options={['Slab', 'Footing', 'Wall', 'Round Column', 'Square Column']}
        value={type}
        onChange={(v) => { setType(v as ConcreteType); setResult(null); setError('') }}
      />
      <FieldLabel label={labels.l} />
      <Field value={L} onChange={setL} placeholder="e.g. 20" />
      {labels.w ? (
        <>
          <FieldLabel label={labels.w} />
          <Field value={W} onChange={setW} placeholder="e.g. 12" />
        </>
      ) : null}
      <FieldLabel label={labels.d} />
      <Field value={D} onChange={setD} placeholder="e.g. 4" />
      <FieldLabel label="Number of Identical Pours" />
      <SelectRow options={['1', '2', '4', '6', '8', '10', '12']} value={qty} onChange={setQty} />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label="Volume (Cubic Yards)" value={`${result.cy.toFixed(2)} CY`} sub={`${result.cf.toFixed(1)} cubic feet`} color="blue" />
          <ResultCard label="Order Quantity (with 7% waste)" value={`${(result.cy * 1.07).toFixed(2)} CY`} color="green" />
          <ResultCard label="80-lb Bags Equivalent" value={`${result.bags80} bags`} sub="Only practical for small pours — order ready-mix for >1 CY" color="yellow" />
        </>
      )}
    </CalcModal>
  )
}

// ─── 2. Span Table Reference (Floor Joists) ────────────────────────────────────
// IRC Table R802.4.1 / R802.4.2 — simplified floor joist spans
// Maximum span for common sizes, 16" and 24" OC, Hem-Fir #2 and SPF #2 (common)
// Values in feet-inches

type SpanEntry = {
  size: string
  hf_16: string
  hf_24: string
  spf_16: string
  spf_24: string
}

const FLOOR_SPANS: SpanEntry[] = [
  { size: '2x6',  hf_16: "9'-8\"",  hf_24: "8'-3\"",  spf_16: "9'-1\"",  spf_24: "7'-9\"" },
  { size: '2x8',  hf_16: "12'-9\"", hf_24: "10'-11\"", spf_16: "11'-10\"", spf_24: "10'-3\"" },
  { size: '2x10', hf_16: "16'-1\"", hf_24: "13'-9\"",  spf_16: "14'-11\"", spf_24: "12'-11\"" },
  { size: '2x12', hf_16: "19'-1\"", hf_24: "16'-1\"",  spf_16: "17'-7\"", spf_24: "15'-3\"" },
]

// Ceiling joist spans (IRC Table R802.4.1 — 10 psf live, 5 psf dead)
const CEILING_SPANS: SpanEntry[] = [
  { size: '2x4',  hf_16: "13'-2\"",  hf_24: "10'-9\"",  spf_16: "12'-5\"",  spf_24: "10'-2\"" },
  { size: '2x6',  hf_16: "20'-8\"",  hf_24: "16'-10\"", spf_16: "19'-5\"",  spf_24: "15'-10\"" },
  { size: '2x8',  hf_16: "27'-2\"",  hf_24: "22'-2\"",  spf_16: "25'-7\"",  spf_24: "20'-10\"" },
  { size: '2x10', hf_16: "34'-7\"",  hf_24: "28'-3\"",  spf_16: "32'-7\"",  spf_24: "26'-7\"" },
]

function CalcSpanTable({ onClose }: { onClose: () => void }) {
  const [memberType, setMemberType] = useState('Floor Joist')
  const [size, setSize] = useState('2x8')
  const [species, setSpecies] = useState('Hem-Fir #2')
  const [spacing, setSpacing] = useState('16" OC')

  const table = memberType === 'Floor Joist' ? FLOOR_SPANS : CEILING_SPANS
  const sizes = table.map((r) => r.size)
  const validSize = sizes.includes(size) ? size : sizes[0]
  const row = table.find((r) => r.size === validSize)

  function getSpan(): string {
    if (!row) return '—'
    if (species === 'Hem-Fir #2' && spacing === '16" OC') return row.hf_16
    if (species === 'Hem-Fir #2' && spacing === '24" OC') return row.hf_24
    if (species === 'SPF #2' && spacing === '16" OC') return row.spf_16
    return row.spf_24
  }

  return (
    <CalcModal visible onClose={onClose} title="Span Table Reference">
      <InfoBox text="IRC 2021 Table R802.4.1 — simplified spans for Hem-Fir #2 and SPF #2 at 30 psf live / 10 psf dead (floor). Verify with your local code and engineer for specific projects." />
      <FieldLabel label="Member Type" />
      <SelectRow options={['Floor Joist', 'Ceiling Joist']} value={memberType} onChange={(v) => { setMemberType(v); setSize(memberType === 'Floor Joist' ? '2x6' : '2x4') }} />
      <FieldLabel label="Joist Size" />
      <SelectRow options={sizes} value={validSize} onChange={setSize} />
      <FieldLabel label="Wood Species / Grade" />
      <SelectRow options={['Hem-Fir #2', 'SPF #2']} value={species} onChange={setSpecies} />
      <FieldLabel label="Spacing" />
      <SelectRow options={['16" OC', '24" OC']} value={spacing} onChange={setSpacing} />

      <View style={{ backgroundColor: COLORS.blueSoft, borderRadius: 18, padding: 20, marginTop: 8, alignItems: 'center' }}>
        <Text style={{ color: COLORS.subtext, fontSize: 13, marginBottom: 6 }}>Maximum Allowable Span</Text>
        <Text style={{ color: COLORS.blue, fontSize: 40, fontWeight: '900' }}>{getSpan()}</Text>
        <Text style={{ color: COLORS.subtext, fontSize: 13, marginTop: 6 }}>
          {validSize} {species} @ {spacing}
        </Text>
      </View>

      <View style={{ marginTop: 16 }}>
        <Text style={{ color: COLORS.navy, fontWeight: '800', marginBottom: 10 }}>Full Table — {memberType}</Text>
        <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border }}>
          <View style={{ flexDirection: 'row', backgroundColor: COLORS.navy, padding: 10 }}>
            <Text style={{ flex: 1, color: COLORS.white, fontWeight: '700', fontSize: 12 }}>Size</Text>
            <Text style={{ width: 70, color: COLORS.white, fontWeight: '700', fontSize: 12, textAlign: 'center' }}>HF@16"</Text>
            <Text style={{ width: 70, color: COLORS.white, fontWeight: '700', fontSize: 12, textAlign: 'center' }}>HF@24"</Text>
            <Text style={{ width: 70, color: COLORS.white, fontWeight: '700', fontSize: 12, textAlign: 'center' }}>SPF@16"</Text>
            <Text style={{ width: 70, color: COLORS.white, fontWeight: '700', fontSize: 12, textAlign: 'center' }}>SPF@24"</Text>
          </View>
          {table.map((r, i) => (
            <View
              key={r.size}
              style={{
                flexDirection: 'row',
                padding: 10,
                backgroundColor: r.size === validSize ? COLORS.tealSoft : i % 2 === 0 ? COLORS.card : '#F8FAFC',
              }}
            >
              <Text style={{ flex: 1, color: COLORS.navy, fontWeight: '800', fontSize: 12 }}>{r.size}</Text>
              <Text style={{ width: 70, color: COLORS.text, fontSize: 12, textAlign: 'center' }}>{r.hf_16}</Text>
              <Text style={{ width: 70, color: COLORS.text, fontSize: 12, textAlign: 'center' }}>{r.hf_24}</Text>
              <Text style={{ width: 70, color: COLORS.text, fontSize: 12, textAlign: 'center' }}>{r.spf_16}</Text>
              <Text style={{ width: 70, color: COLORS.text, fontSize: 12, textAlign: 'center' }}>{r.spf_24}</Text>
            </View>
          ))}
        </View>
      </View>
    </CalcModal>
  )
}

// ─── 3. Footing Size Reference ────────────────────────────────────────────────
// Per IRC Table R403.1 — minimum footing width based on load-bearing value of soil
// Footing area = total load / soil bearing pressure
// Load = floors × load per floor × tributary area

const SOIL_TYPES = [
  { label: 'Sandy / Gravelly (2000 psf)', psf: 2000 },
  { label: 'Sandy Silt / Loam (1500 psf)', psf: 1500 },
  { label: 'Clay / Silt (1000 psf)', psf: 1000 },
  { label: 'Soft Clay (500 psf)', psf: 500 },
]

function CalcFooting({ onClose }: { onClose: () => void }) {
  const [stories, setStories] = useState('1')
  const [tribWidth, setTribWidth] = useState('')
  const [wallLength, setWallLength] = useState('')
  const [soilIdx, setSoilIdx] = useState(0)
  const [loadPerFloor, setLoadPerFloor] = useState('50')
  const [result, setResult] = useState<{
    totalLoad: number; footingWidth: number; footingArea: number
  } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const numStories = parseInt(stories)
    const trib = parseFloat(tribWidth)
    const wl = parseFloat(wallLength)
    const lpf = parseFloat(loadPerFloor) || 50
    if (isNaN(trib) || trib <= 0) { setError('Enter valid tributary width.'); return }
    if (isNaN(wl) || wl <= 0) { setError('Enter valid wall length.'); return }

    const soil = SOIL_TYPES[soilIdx]
    // Load per linear foot of wall = stories x load/floor x trib width
    const loadPerLinFt = numStories * lpf * trib
    const totalLoad = loadPerLinFt * wl
    // Footing area needed
    const footingArea = totalLoad / soil.psf
    // Footing width = area / wall length
    const footingWidth = (footingArea / wl) * 12 // in inches

    setResult({ totalLoad, footingWidth, footingArea })
  }

  return (
    <CalcModal visible onClose={onClose} title="Footing Size Reference">
      <InfoBox text="Estimates continuous footing width. Always verify with structural engineer. IRC Table R403.1 minimums apply regardless of calculation." />
      <FieldLabel label="Number of Stories Supported" />
      <SelectRow options={['1', '2', '3']} value={stories} onChange={setStories} />
      <FieldLabel label="Tributary Width (ft) — half span each side" />
      <Field value={tribWidth} onChange={setTribWidth} placeholder="e.g. 8" />
      <FieldLabel label="Wall Length (ft)" />
      <Field value={wallLength} onChange={setWallLength} placeholder="e.g. 40" />
      <FieldLabel label="Load per Floor (psf)" />
      <SelectRow options={['40', '50', '60', '70']} value={loadPerFloor} onChange={setLoadPerFloor} />
      <FieldLabel label="Soil Bearing Capacity" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {SOIL_TYPES.map((s, i) => (
            <Pressable
              key={s.label}
              onPress={() => setSoilIdx(i)}
              style={{
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                backgroundColor: soilIdx === i ? COLORS.navy : COLORS.card,
                borderWidth: 1, borderColor: soilIdx === i ? COLORS.navy : COLORS.border,
              }}
            >
              <Text style={{ color: soilIdx === i ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 12 }}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label="Required Footing Width" value={`${result.footingWidth.toFixed(1)}"`} sub={`Round up to nearest 2" — min. per IRC: 12" for 1-story, 15" for 2-story`} color="blue" />
          <ResultCard label="Total Wall Load" value={`${Math.round(result.totalLoad).toLocaleString()} lbs`} color="yellow" />
          <ResultCard label="Required Footing Area" value={`${result.footingArea.toFixed(1)} sq ft`} color="green" />
          <InfoBox text={"IRC R403.1 minimums: 1-story = 12\" wide x 6\" deep, 2-story = 15\" wide x 7\" deep, 3-story = 18\" wide x 8\" deep. Footing must be below frost depth — varies by region."} />
        </>
      )}
    </CalcModal>
  )
}

// ─── 4. Material Estimator ────────────────────────────────────────────────────

type MatType = 'Drywall' | 'Lumber (LF)' | 'Flooring' | 'Roofing' | 'Paint' | 'Concrete Block'

function CalcMaterials({ onClose }: { onClose: () => void }) {
  const [matType, setMatType] = useState<MatType>('Drywall')
  const [dim1, setDim1] = useState('')
  const [dim2, setDim2] = useState('')
  const [wasteStr, setWasteStr] = useState('10')
  const [result, setResult] = useState<{ qty: number; unit: string; withWaste: number; detail: string } | null>(null)
  const [error, setError] = useState('')

  function calc() {
    setError('')
    setResult(null)
    const d1 = parseFloat(dim1)
    const d2 = parseFloat(dim2)
    const waste = (parseFloat(wasteStr) || 10) / 100

    if (isNaN(d1) || d1 <= 0) { setError('Enter valid primary dimension.'); return }

    let qty = 0, unit = '', detail = ''

    if (matType === 'Drywall') {
      // d1 = area sqft, or d1 = length, d2 = height
      if (!isNaN(d2) && d2 > 0) {
        const area = d1 * d2
        qty = Math.ceil(area / 32) // standard 4x8 = 32 sqft
        unit = 'sheets (4x8)'
        detail = `${area.toFixed(0)} sq ft area`
      } else {
        qty = Math.ceil(d1 / 32)
        unit = 'sheets (4x8)'
        detail = `${d1.toFixed(0)} sq ft area`
      }
    } else if (matType === 'Lumber (LF)') {
      // d1 = piece length, d2 = quantity/count
      const count = !isNaN(d2) && d2 > 0 ? d2 : 1
      qty = d1 * count
      unit = 'linear feet'
      detail = `${count} pieces x ${d1} ft`
    } else if (matType === 'Flooring') {
      // d1 = length, d2 = width in ft
      if (isNaN(d2) || d2 <= 0) { setError('Enter room length and width.'); return }
      const area = d1 * d2
      qty = area
      unit = 'sq ft'
      detail = `${d1} x ${d2} ft room`
    } else if (matType === 'Roofing') {
      // d1 = length, d2 = width (in ft). Roofing sold in squares = 100 sqft
      if (isNaN(d2) || d2 <= 0) { setError('Enter roof length and width.'); return }
      const area = d1 * d2
      qty = area / 100 // squares
      unit = 'squares (100 sqft)'
      detail = `${area.toFixed(0)} sq ft roof area`
    } else if (matType === 'Paint') {
      // d1 = area sqft. Coverage: 350 sqft/gal (1 coat)
      if (!isNaN(d2) && d2 > 0) {
        const area = d1 * d2
        qty = area / 350
        unit = 'gallons (1 coat)'
        detail = `${area.toFixed(0)} sq ft — 350 sqft/gal`
      } else {
        qty = d1 / 350
        unit = 'gallons (1 coat)'
        detail = `${d1.toFixed(0)} sq ft — 350 sqft/gal`
      }
    } else if (matType === 'Concrete Block') {
      // d1 = wall length, d2 = wall height (ft). 8x8x16 block = 1 sqft face
      if (isNaN(d2) || d2 <= 0) { setError('Enter wall length and height.'); return }
      const area = d1 * d2
      qty = Math.ceil(area * 1.125) // 1.125 blocks per sqft (standard 8x16 with mortar)
      unit = 'blocks (8x8x16)'
      detail = `${area.toFixed(0)} sq ft wall face`
    }

    const withWaste = matType === 'Lumber (LF)' ? qty * (1 + waste) : (matType === 'Roofing' ? qty * (1 + waste) : (matType === 'Paint' ? Math.ceil(qty * (1 + waste)) : Math.ceil(qty * (1 + waste))))

    setResult({ qty, unit, withWaste: Math.ceil(withWaste * 100) / 100, detail })
  }

  const matDimLabels: Record<MatType, { d1: string; d2: string; d2optional: boolean }> = {
    'Drywall':        { d1: 'Length (ft)', d2: 'Height (ft) — or enter sq ft alone in field 1', d2optional: true },
    'Lumber (LF)':    { d1: 'Piece Length (ft)', d2: 'Number of Pieces', d2optional: false },
    'Flooring':       { d1: 'Room Length (ft)', d2: 'Room Width (ft)', d2optional: false },
    'Roofing':        { d1: 'Roof Length (ft)', d2: 'Roof Width (ft)', d2optional: false },
    'Paint':          { d1: 'Surface Length (ft)', d2: 'Surface Height (ft) — or sq ft alone in field 1', d2optional: true },
    'Concrete Block': { d1: 'Wall Length (ft)', d2: 'Wall Height (ft)', d2optional: false },
  }

  const labels = matDimLabels[matType]

  return (
    <CalcModal visible onClose={onClose} title="Material Estimator">
      <InfoBox text="Quick material takeoff for common construction items. Always add a waste factor — 10% is standard for most materials." />
      <FieldLabel label="Material" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['Drywall', 'Lumber (LF)', 'Flooring', 'Roofing', 'Paint', 'Concrete Block'] as MatType[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => { setMatType(m); setResult(null); setError('') }}
              style={{
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                backgroundColor: matType === m ? COLORS.navy : COLORS.card,
                borderWidth: 1, borderColor: matType === m ? COLORS.navy : COLORS.border,
              }}
            >
              <Text style={{ color: matType === m ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 12 }}>
                {m}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <FieldLabel label={labels.d1} />
      <Field value={dim1} onChange={setDim1} placeholder="e.g. 20" />
      <FieldLabel label={labels.d2} />
      <Field value={dim2} onChange={setDim2} placeholder={labels.d2optional ? 'optional' : 'e.g. 10'} />
      <FieldLabel label="Waste Factor (%)" />
      <SelectRow options={['5', '10', '15', '20']} value={wasteStr} onChange={setWasteStr} />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label={`${matType} — Net Quantity`} value={`${Number.isInteger(result.qty) ? result.qty : result.qty.toFixed(2)} ${result.unit}`} sub={result.detail} color="blue" />
          <ResultCard label={`Order Quantity (with ${wasteStr}% waste)`} value={`${result.withWaste} ${result.unit}`} color="green" />
          <InfoBox text="Tip: For drywall, also count separate ceilings and walls. For flooring, add extra for closets. For roofing, account for ridges, hips, and valleys separately." />
        </>
      )}
    </CalcModal>
  )
}

// ─── Tool List ────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    id: 'concrete',
    icon: 'cube-outline',
    title: 'Concrete Volume',
    desc: 'Slab, footing, wall, column — cubic yards and bag count',
    color: '#6A1B9A',
    bg: '#F3E5F5',
  },
  {
    id: 'spantable',
    icon: 'floor-plan',
    title: 'Span Table Reference',
    desc: 'Floor and ceiling joist max spans — IRC 2021, Hem-Fir / SPF',
    color: '#1565C0',
    bg: '#E3F2FD',
  },
  {
    id: 'footing',
    icon: 'terrain',
    title: 'Footing Size',
    desc: 'Continuous footing width based on load and soil bearing',
    color: '#4E342E',
    bg: '#EFEBE9',
  },
  {
    id: 'materials',
    icon: 'format-list-bulleted',
    title: 'Material Estimator',
    desc: 'Quick takeoff for drywall, lumber, flooring, roofing, paint, block',
    color: '#2E7D32',
    bg: '#E8F5E9',
  },
]

export default function BuildingScreen() {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '900', marginBottom: 4 }}>
            Building Tools
          </Text>
          <Text style={{ color: COLORS.subtext, fontSize: 14 }}>
            Concrete, framing, and material estimating
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

      {open === 'concrete'  && <CalcConcrete onClose={() => setOpen(null)} />}
      {open === 'spantable' && <CalcSpanTable onClose={() => setOpen(null)} />}
      {open === 'footing'   && <CalcFooting onClose={() => setOpen(null)} />}
      {open === 'materials' && <CalcMaterials onClose={() => setOpen(null)} />}
    </SafeAreaView>
  )
}
