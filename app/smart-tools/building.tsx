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
import type { TranslationKey } from '../../lib/locales/en'

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

// ─── 1. Concrete Volume ───────────────────────────────────────────────────────
// Volume in cubic yards. 1 CY = 27 CF.
// Slab: L × W × T / 27
// Footing: L × W × D / 27
// Column: pi/4 × D^2 × H / 27 (round) or W × W × H / 27 (square)
// Wall: L × H × T / 27

type ConcreteKey = 'slab' | 'footing' | 'wall' | 'roundColumn' | 'squareColumn'
const CONCRETE_KEYS: { key: ConcreteKey; labelKey: TranslationKey }[] = [
  { key: 'slab',         labelKey: 'stbPourSlab' },
  { key: 'footing',      labelKey: 'stbPourFooting' },
  { key: 'wall',         labelKey: 'stbPourWall' },
  { key: 'roundColumn',  labelKey: 'stbPourRoundColumn' },
  { key: 'squareColumn', labelKey: 'stbPourSquareColumn' },
]

function CalcConcrete({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [type, setType] = useState<ConcreteKey>('slab')
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
    if (isNaN(d) || d <= 0) { setError(t('stbEnterValidDepth')); return }

    let cf = 0
    if (type === 'slab' || type === 'footing') {
      if (isNaN(l) || l <= 0 || isNaN(w) || w <= 0) { setError(t('stbEnterValidLW')); return }
      // D is in inches for slab thickness, convert
      cf = l * w * (d / 12)
    } else if (type === 'roundColumn') {
      if (isNaN(l) || l <= 0) { setError(t('stbEnterValidDiameter')); return }
      // L = diameter in inches, D = height in feet
      cf = (Math.PI / 4) * Math.pow(l / 12, 2) * d
    } else if (type === 'squareColumn') {
      if (isNaN(l) || l <= 0) { setError(t('stbEnterValidSide')); return }
      // L = side in inches, D = height in feet
      cf = Math.pow(l / 12, 2) * d
    } else if (type === 'wall') {
      if (isNaN(l) || l <= 0 || isNaN(w) || w <= 0) { setError(t('stbEnterValidLH')); return }
      // L = length (ft), W = height (ft), D = thickness (inches)
      cf = l * w * (d / 12)
    }

    cf *= q
    const cy = cf / 27
    // 80lb bag = 0.6 CF, so bags needed
    const bags80 = Math.ceil(cf / 0.6)

    setResult({ cy, cf, bags80 })
  }

  const dimLabels: Record<ConcreteKey, { l: TranslationKey; w: TranslationKey | null; d: TranslationKey }> = {
    'slab':         { l: 'stbDimLengthFt',   w: 'stbDimWidthFt',  d: 'stbDimThicknessIn' },
    'footing':      { l: 'stbDimLengthFt',   w: 'stbDimWidthIn',  d: 'stbDimDepthIn' },
    'roundColumn':  { l: 'stbDimDiameterIn', w: null,             d: 'stbDimHeightFt' },
    'squareColumn': { l: 'stbDimSideIn',     w: null,             d: 'stbDimHeightFt' },
    'wall':         { l: 'stbDimLengthFt',   w: 'stbDimHeightFt', d: 'stbDimThicknessIn' },
  }
  const labels = dimLabels[type]

  const optionLabels = CONCRETE_KEYS.map(c => t(c.labelKey))
  const currentLabel = t(CONCRETE_KEYS.find(c => c.key === type)!.labelKey)

  return (
    <CalcModal visible onClose={onClose} title={t('stbConcreteTitle')}>
      <InfoBox text={t('stbConcreteInfo')} />
      <FieldLabel label={t('stbPourType')} />
      <SelectRow
        options={optionLabels}
        value={currentLabel}
        onChange={(v) => {
          const found = CONCRETE_KEYS.find(c => t(c.labelKey) === v)
          if (found) { setType(found.key); setResult(null); setError('') }
        }}
      />
      <FieldLabel label={t(labels.l)} />
      <Field value={L} onChange={setL} placeholder={t('stbDimPlaceholder20')} />
      {labels.w ? (
        <>
          <FieldLabel label={t(labels.w)} />
          <Field value={W} onChange={setW} placeholder="e.g. 12" />
        </>
      ) : null}
      <FieldLabel label={t(labels.d)} />
      <Field value={D} onChange={setD} placeholder="e.g. 4" />
      <FieldLabel label={t('stbNumIdenticalPours')} />
      <SelectRow options={['1', '2', '4', '6', '8', '10', '12']} value={qty} onChange={setQty} />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label={t('stbVolumeCy')} value={`${result.cy.toFixed(2)} CY`} sub={t('stbVolumeCfSub', { cf: result.cf.toFixed(1) })} color="blue" />
          <ResultCard label={t('stbOrderQtyWaste')} value={`${(result.cy * 1.07).toFixed(2)} CY`} color="green" />
          <ResultCard label={t('stbBagsEquivalent')} value={t('stbBags', { n: result.bags80 })} sub={t('stbBagsSub')} color="yellow" />
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
  const { t } = useLanguage()
  // memberType is a stable internal key so language toggle doesn't break comparisons.
  const [memberType, setMemberType] = useState<'floor' | 'ceiling'>('floor')
  const floorJoistLabel = t('stbFloorJoist')
  const ceilingJoistLabel = t('stbCeilingJoist')
  const labelToKey = (label: string): 'floor' | 'ceiling' =>
    label === ceilingJoistLabel ? 'ceiling' : 'floor'
  const memberLabel = memberType === 'floor' ? floorJoistLabel : ceilingJoistLabel
  const [size, setSize] = useState('2x8')
  const [species, setSpecies] = useState('Hem-Fir #2')
  const [spacing, setSpacing] = useState('16" OC')

  const table = memberType === 'floor' ? FLOOR_SPANS : CEILING_SPANS
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
    <CalcModal visible onClose={onClose} title={t('stbSpanTableTitle')}>
      <InfoBox text={t('stbSpanInfo')} />
      <FieldLabel label={t('stbMemberType')} />
      <SelectRow options={[floorJoistLabel, ceilingJoistLabel]} value={memberLabel} onChange={(label) => { const next = labelToKey(label); setMemberType(next); setSize(next === 'floor' ? '2x6' : '2x4') }} />
      <FieldLabel label={t('stbJoistSize')} />
      <SelectRow options={sizes} value={validSize} onChange={setSize} />
      <FieldLabel label={t('stbWoodSpeciesGrade')} />
      <SelectRow options={['Hem-Fir #2', 'SPF #2']} value={species} onChange={setSpecies} />
      <FieldLabel label={t('stbSpacing')} />
      <SelectRow options={['16" OC', '24" OC']} value={spacing} onChange={setSpacing} />

      <View style={{ backgroundColor: COLORS.blueSoft, borderRadius: 18, padding: 20, marginTop: 8, alignItems: 'center' }}>
        <Text style={{ color: COLORS.subtext, fontSize: 13, marginBottom: 6 }}>{t('stbMaxAllowableSpan')}</Text>
        <Text style={{ color: COLORS.blue, fontSize: 40, fontWeight: '900' }}>{getSpan()}</Text>
        <Text style={{ color: COLORS.subtext, fontSize: 13, marginTop: 6 }}>
          {t('stbSpanMemberInfo', { size: validSize, species, spacing })}
        </Text>
      </View>

      <View style={{ marginTop: 16 }}>
        <Text style={{ color: COLORS.navy, fontWeight: '800', marginBottom: 10 }}>{t('stbFullTable', { member: memberLabel })}</Text>
        <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border }}>
          <View style={{ flexDirection: 'row', backgroundColor: COLORS.navy, padding: 10 }}>
            <Text style={{ flex: 1, color: COLORS.white, fontWeight: '700', fontSize: 12 }}>{t('stbColSize')}</Text>
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

const SOIL_TYPES: { labelKey: 'stbSoilSandy' | 'stbSoilSandySilt' | 'stbSoilClay' | 'stbSoilSoftClay'; psf: number }[] = [
  { labelKey: 'stbSoilSandy',     psf: 2000 },
  { labelKey: 'stbSoilSandySilt', psf: 1500 },
  { labelKey: 'stbSoilClay',      psf: 1000 },
  { labelKey: 'stbSoilSoftClay',  psf: 500 },
]

function CalcFooting({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
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
    if (isNaN(trib) || trib <= 0) { setError(t('stbEnterValidTrib')); return }
    if (isNaN(wl) || wl <= 0) { setError(t('stbEnterValidWallLen')); return }

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
    <CalcModal visible onClose={onClose} title={t('stbFootingTitle')}>
      <InfoBox text={t('stbFootingInfo')} />
      <FieldLabel label={t('stbStoriesSupported')} />
      <SelectRow options={['1', '2', '3']} value={stories} onChange={setStories} />
      <FieldLabel label={t('stbTribWidth')} />
      <Field value={tribWidth} onChange={setTribWidth} placeholder={t('stbTribWidthPlaceholder')} />
      <FieldLabel label={t('stbWallLength')} />
      <Field value={wallLength} onChange={setWallLength} placeholder={t('stbWallLengthPlaceholder')} />
      <FieldLabel label={t('stbLoadPerFloor')} />
      <SelectRow options={['40', '50', '60', '70']} value={loadPerFloor} onChange={setLoadPerFloor} />
      <FieldLabel label={t('stbSoilBearing')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {SOIL_TYPES.map((s, i) => (
            <Pressable
              key={s.labelKey}
              onPress={() => setSoilIdx(i)}
              style={{
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                backgroundColor: soilIdx === i ? COLORS.navy : COLORS.card,
                borderWidth: 1, borderColor: soilIdx === i ? COLORS.navy : COLORS.border,
              }}
            >
              <Text style={{ color: soilIdx === i ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 12 }}>
                {t(s.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label={t('stbRequiredFootingWidth')} value={`${result.footingWidth.toFixed(1)}"`} sub={t('stbFootingWidthSub')} color="blue" />
          <ResultCard label={t('stbTotalWallLoad')} value={t('stbWallLoadLbs', { lbs: Math.round(result.totalLoad).toLocaleString() })} color="yellow" />
          <ResultCard label={t('stbRequiredFootingArea')} value={t('stbFootingAreaSqft', { area: result.footingArea.toFixed(1) })} color="green" />
          <InfoBox text={t('stbFootingFooter')} />
        </>
      )}
    </CalcModal>
  )
}

// ─── 4. Material Estimator ────────────────────────────────────────────────────

type MatKey = 'drywall' | 'lumber' | 'flooring' | 'roofing' | 'paint' | 'block'
const MAT_DEFS: { key: MatKey; labelKey: TranslationKey }[] = [
  { key: 'drywall',  labelKey: 'stbMatDrywall' },
  { key: 'lumber',   labelKey: 'stbMatLumber' },
  { key: 'flooring', labelKey: 'stbMatFlooring' },
  { key: 'roofing',  labelKey: 'stbMatRoofing' },
  { key: 'paint',    labelKey: 'stbMatPaint' },
  { key: 'block',    labelKey: 'stbMatBlock' },
]

function CalcMaterials({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [matType, setMatType] = useState<MatKey>('drywall')
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

    if (isNaN(d1) || d1 <= 0) { setError(t('stbEnterValidPrimary')); return }

    let qty = 0, unit = '', detail = ''

    if (matType === 'drywall') {
      // d1 = area sqft, or d1 = length, d2 = height
      if (!isNaN(d2) && d2 > 0) {
        const area = d1 * d2
        qty = Math.ceil(area / 32) // standard 4x8 = 32 sqft
        unit = t('stbUnitSheets')
        detail = t('stbDetailDrywallArea', { area: area.toFixed(0) })
      } else {
        qty = Math.ceil(d1 / 32)
        unit = t('stbUnitSheets')
        detail = t('stbDetailDrywallArea', { area: d1.toFixed(0) })
      }
    } else if (matType === 'lumber') {
      // d1 = piece length, d2 = quantity/count
      const count = !isNaN(d2) && d2 > 0 ? d2 : 1
      qty = d1 * count
      unit = t('stbUnitLinearFeet')
      detail = t('stbDetailLumber', { count, len: d1 })
    } else if (matType === 'flooring') {
      // d1 = length, d2 = width in ft
      if (isNaN(d2) || d2 <= 0) { setError(t('stbEnterRoomLW')); return }
      const area = d1 * d2
      qty = area
      unit = t('stbUnitSqFt')
      detail = t('stbDetailFlooringRoom', { l: d1, w: d2 })
    } else if (matType === 'roofing') {
      // d1 = length, d2 = width (in ft). Roofing sold in squares = 100 sqft
      if (isNaN(d2) || d2 <= 0) { setError(t('stbEnterRoofLW')); return }
      const area = d1 * d2
      qty = area / 100 // squares
      unit = t('stbUnitSquares')
      detail = t('stbDetailRoofArea', { area: area.toFixed(0) })
    } else if (matType === 'paint') {
      // d1 = area sqft. Coverage: 350 sqft/gal (1 coat)
      if (!isNaN(d2) && d2 > 0) {
        const area = d1 * d2
        qty = area / 350
        unit = t('stbUnitGallons')
        detail = t('stbDetailPaintArea', { area: area.toFixed(0) })
      } else {
        qty = d1 / 350
        unit = t('stbUnitGallons')
        detail = t('stbDetailPaintArea', { area: d1.toFixed(0) })
      }
    } else if (matType === 'block') {
      // d1 = wall length, d2 = wall height (ft). 8x8x16 block = 1 sqft face
      if (isNaN(d2) || d2 <= 0) { setError(t('stbEnterWallLH')); return }
      const area = d1 * d2
      qty = Math.ceil(area * 1.125) // 1.125 blocks per sqft (standard 8x16 with mortar)
      unit = t('stbUnitBlocks')
      detail = t('stbDetailBlockArea', { area: area.toFixed(0) })
    }

    const withWaste = matType === 'lumber' ? qty * (1 + waste) : (matType === 'roofing' ? qty * (1 + waste) : (matType === 'paint' ? Math.ceil(qty * (1 + waste)) : Math.ceil(qty * (1 + waste))))

    setResult({ qty, unit, withWaste: Math.ceil(withWaste * 100) / 100, detail })
  }

  const matDimLabels: Record<MatKey, { d1: TranslationKey; d2: TranslationKey; d2optional: boolean }> = {
    'drywall':  { d1: 'stbDrywallD1',  d2: 'stbDrywallD2',  d2optional: true },
    'lumber':   { d1: 'stbLumberD1',   d2: 'stbLumberD2',   d2optional: false },
    'flooring': { d1: 'stbFlooringD1', d2: 'stbFlooringD2', d2optional: false },
    'roofing':  { d1: 'stbRoofingD1',  d2: 'stbRoofingD2',  d2optional: false },
    'paint':    { d1: 'stbPaintD1',    d2: 'stbPaintD2',    d2optional: true },
    'block':    { d1: 'stbBlockD1',    d2: 'stbBlockD2',    d2optional: false },
  }

  const labels = matDimLabels[matType]
  const matLabel = t(MAT_DEFS.find(m => m.key === matType)!.labelKey)

  return (
    <CalcModal visible onClose={onClose} title={t('stbMaterialsTitle')}>
      <InfoBox text={t('stbMaterialsInfo')} />
      <FieldLabel label={t('stbMaterial')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {MAT_DEFS.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => { setMatType(m.key); setResult(null); setError('') }}
              style={{
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                backgroundColor: matType === m.key ? COLORS.navy : COLORS.card,
                borderWidth: 1, borderColor: matType === m.key ? COLORS.navy : COLORS.border,
              }}
            >
              <Text style={{ color: matType === m.key ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 12 }}>
                {t(m.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <FieldLabel label={t(labels.d1)} />
      <Field value={dim1} onChange={setDim1} placeholder={t('stbDimPlaceholder20')} />
      <FieldLabel label={t(labels.d2)} />
      <Field value={dim2} onChange={setDim2} placeholder={labels.d2optional ? t('stbOptional') : t('stbDimPlaceholder10')} />
      <FieldLabel label={t('stbWasteFactor')} />
      <SelectRow options={['5', '10', '15', '20']} value={wasteStr} onChange={setWasteStr} />
      <CalcButton onPress={calc} />
      {error ? <Text style={{ color: COLORS.red, marginBottom: 8 }}>{error}</Text> : null}
      {result && (
        <>
          <ResultCard label={t('stbMatNetQty', { mat: matLabel })} value={`${Number.isInteger(result.qty) ? result.qty : result.qty.toFixed(2)} ${result.unit}`} sub={result.detail} color="blue" />
          <ResultCard label={t('stbMatOrderQty', { waste: wasteStr })} value={`${result.withWaste} ${result.unit}`} color="green" />
          <InfoBox text={t('stbMatFooter')} />
        </>
      )}
    </CalcModal>
  )
}

// ─── Tool List ────────────────────────────────────────────────────────────────

export default function BuildingScreen() {
  const { t } = useLanguage()
  const [open, setOpen] = useState<string | null>(null)

  const TOOLS = [
    { id: 'concrete',  icon: 'cube-outline',          title: t('stbConcreteTitle'),  desc: t('stbConcreteDesc'),  color: '#6A1B9A', bg: '#F3E5F5' },
    { id: 'spantable', icon: 'floor-plan',            title: t('stbSpanTableTitle'), desc: t('stbSpanTableDesc'), color: '#1565C0', bg: '#E3F2FD' },
    { id: 'footing',   icon: 'terrain',               title: t('stbFootingTitle'),   desc: t('stbFootingDesc'),   color: '#4E342E', bg: '#EFEBE9' },
    { id: 'materials', icon: 'format-list-bulleted',  title: t('stbMaterialsTitle'), desc: t('stbMaterialsDesc'), color: '#2E7D32', bg: '#E8F5E9' },
  ]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '900', marginBottom: 4 }}>
            {t('stbTitle')}
          </Text>
          <Text style={{ color: COLORS.subtext, fontSize: 14 }}>
            {t('stbSubtitle')}
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
