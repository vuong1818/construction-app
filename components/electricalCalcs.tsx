// New NEC electrical calculators (card → modal), built on CalcKit + necTables.
// Each component takes { onClose } and is opened from smart-tools/electrical.tsx.

import { useState } from 'react'
import { Text, View } from 'react-native'
import { useLanguage } from '../lib/i18n'
import { COLORS } from '../lib/theme'
import {
  BulletList, CalcButton, CalcModal, ChipPicker, InfoBox, NumberField, RefTable, ResultCard, SelectRow, lbl,
} from './CalcKit'
import {
  BURIAL_300_5, CONDUCTOR_AREA, CONDUIT_AREA_100, CONDUIT_BEND_CH9_T2,
  DC_RESISTANCE_CH9_T8, DWELLING_SERVICE_310_12, MOTOR_HP_1PH, MOTOR_HP_3PH,
  MOTOR_OCPD_PCT, SERVICE_SIZES, STANDARD_OCPD, adjustmentFactor, ambientCorrection,
  gecForService, lightingDemandVA, maxConductors, motorFLC, multifamilyDemandPct,
  nextStandardOcpd, prevStandardOcpd, rangeDemandColC, supplySideBondingJumper,
  transformerProtection, workingClearance,
} from '../lib/necTables'

// ── Table 250.66 — Grounding Electrode Conductor ─────────────────────────────
export function CalcGEC({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [mat, setMat] = useState<'CU' | 'AL'>('CU')
  const [size, setSize] = useState('2/0')
  const [res, setRes] = useState<{ cu: string; al: string } | null>(null)
  return (
    <CalcModal visible onClose={onClose} title={t('steGecTitle')} subtitle={t('steGecSubtitle')}>
      <SelectRow label={t('steServiceConductorMat')} options={['CU', 'AL']} value={mat} onChange={v => setMat(v as 'CU' | 'AL')} />
      <ChipPicker label={t('steServiceConductorSize')} options={SERVICE_SIZES} value={size} onChange={setSize} />
      <CalcButton onPress={() => setRes(gecForService(mat, size))} />
      {res && (
        <View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ResultCard label={t('steCopperGec')} value={res.cu} />
            <ResultCard label={t('steAluminumGec')} value={res.al} color="#1565C0" />
          </View>
          <InfoBox text={t('steGecInfo')} />
        </View>
      )}
    </CalcModal>
  )
}

// ── Table 250.102(C)(1) — Supply-Side Bonding Jumper ─────────────────────────
export function CalcBonding({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [mat, setMat] = useState<'CU' | 'AL'>('CU')
  const [size, setSize] = useState('2/0')
  const [res, setRes] = useState<{ cu: string; al: string; over: boolean } | null>(null)
  return (
    <CalcModal visible onClose={onClose} title={t('steBondingTitle')} subtitle={t('steBondingSubtitle')}>
      <SelectRow label={t('steSupplyConductorMat')} options={['CU', 'AL']} value={mat} onChange={v => setMat(v as 'CU' | 'AL')} />
      <ChipPicker label={t('steSupplyConductorSize')} options={SERVICE_SIZES} value={size} onChange={setSize} />
      <CalcButton onPress={() => setRes(supplySideBondingJumper(mat, size))} />
      {res && (
        <View>
          {res.over ? (
            <InfoBox text={t('steBondingOver')} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ResultCard label={t('steCopperJumper')} value={res.cu} />
              <ResultCard label={t('steAluminumJumper')} value={res.al} color="#1565C0" />
            </View>
          )}
          <InfoBox text={t('steBondingInfo')} />
        </View>
      )}
    </CalcModal>
  )
}

// ── Tables 430.248 / 430.250 — Motor Full-Load Current ───────────────────────
export function CalcMotorFLC({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [phase, setPhase] = useState<'1' | '3'>('3')
  const [volts, setVolts] = useState('460')
  const [hp, setHp] = useState('10')
  const [res, setRes] = useState<{ flc: number; cond: number; ocpd: number } | null>(null)
  const volt1 = ['115', '208', '230']
  const volt3 = ['208', '230', '460', '575']
  const hps = phase === '1' ? MOTOR_HP_1PH : MOTOR_HP_3PH
  function calc() {
    const flc = motorFLC(phase, volts, hp)
    if (flc == null) { setRes(null); return }
    setRes({ flc, cond: flc * 1.25, ocpd: nextStandardOcpd(flc * 2.5) })
  }
  return (
    <CalcModal visible onClose={onClose} title={t('steMotorFlcTitle')} subtitle={t('steMotorFlcSubtitle')}>
      <SelectRow label={t('stePhases')} options={['1', '3']} value={phase}
        onChange={v => { const p = v as '1' | '3'; setPhase(p); setVolts(p === '1' ? '230' : '460'); setRes(null) }} />
      <SelectRow label={t('steVoltage')} options={phase === '1' ? volt1 : volt3} value={volts} onChange={setVolts} />
      <ChipPicker label={t('steHorsepower')} options={hps} value={hp} onChange={setHp} />
      <CalcButton onPress={calc} />
      {res && (
        <View>
          <ResultCard label={t('steMotorFlcResult')} value={`${res.flc} A`} sub={t('steMotorFlcSub', { hp, volts, phase })} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ResultCard label={t('steMotorCond125')} value={`${res.cond.toFixed(1)} A`} color="#0891B2" />
            <ResultCard label={t('steMotorMaxOcpd')} value={`${res.ocpd} A`} color="#7C3AED" />
          </View>
          <InfoBox text={t('steMotorFlcInfo')} />
        </View>
      )}
    </CalcModal>
  )
}

// ── Table 430.52 — Motor branch OCPD sizing ──────────────────────────────────
export function CalcMotorBreaker({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [phase, setPhase] = useState<'1' | '3'>('3')
  const [volts, setVolts] = useState('460')
  const [hp, setHp] = useState('10')
  const [device, setDevice] = useState<keyof typeof MOTOR_OCPD_PCT>('inverseTime')
  const [res, setRes] = useState<{ flc: number; pct: number; maxA: number; size: number } | null>(null)
  const hps = phase === '1' ? MOTOR_HP_1PH : MOTOR_HP_3PH
  const deviceLabels: Record<string, string> = {
    inverseTime: t('steInverseTimeBreaker'), ntdFuse: t('steNtdFuse'),
    dualElementFuse: t('steDualElementFuse'), instTrip: t('steInstTripBreaker'),
  }
  function calc() {
    const flc = motorFLC(phase, volts, hp)
    if (flc == null) { setRes(null); return }
    const pct = MOTOR_OCPD_PCT[device]
    const maxA = flc * pct
    setRes({ flc, pct, maxA, size: nextStandardOcpd(maxA) })
  }
  return (
    <CalcModal visible onClose={onClose} title={t('steMotorBreakerTitle')} subtitle={t('steMotorBreakerSubtitle')}>
      <SelectRow label={t('stePhases')} options={['1', '3']} value={phase}
        onChange={v => { const p = v as '1' | '3'; setPhase(p); setVolts(p === '1' ? '230' : '460'); setRes(null) }} />
      <SelectRow label={t('steVoltage')} options={phase === '1' ? ['115', '208', '230'] : ['208', '230', '460', '575']} value={volts} onChange={setVolts} />
      <ChipPicker label={t('steHorsepower')} options={hps} value={hp} onChange={setHp} />
      <SelectRow label={t('steProtectiveDevice')}
        options={Object.values(deviceLabels)}
        value={deviceLabels[device]}
        onChange={v => { const key = (Object.keys(deviceLabels) as (keyof typeof MOTOR_OCPD_PCT)[]).find(k => deviceLabels[k] === v); if (key) setDevice(key) }} />
      <CalcButton onPress={calc} />
      {res && (
        <View>
          <ResultCard label={t('steMotorBreakerSize')} value={`${res.size} A`}
            sub={t('steMotorBreakerSub', { pct: (res.pct * 100).toFixed(0), max: res.maxA.toFixed(1), flc: res.flc })}
            color="#7C3AED" />
          <InfoBox text={t('steMotorBreakerInfo')} />
        </View>
      )}
    </CalcModal>
  )
}

// ── Annex C (computed) — max conductors that fit a conduit ────────────────────
export function CalcMaxFill({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [cType, setCType] = useState('EMT')
  const [cSize, setCSize] = useState('3/4"')
  const [wType, setWType] = useState('THHN/THWN')
  const [wSize, setWSize] = useState('12 AWG')
  const [res, setRes] = useState<{ count: number; fillFactor: number } | null>(null)
  const cSizes = Object.keys(CONDUIT_AREA_100[cType] || {})
  const wSizes = Object.keys(CONDUCTOR_AREA[wType] || {})
  return (
    <CalcModal visible onClose={onClose} title={t('steMaxFillTitle')} subtitle={t('steMaxFillSubtitle')}>
      <SelectRow label={t('steConduitType')} options={Object.keys(CONDUIT_AREA_100)} value={cType} onChange={v => { setCType(v); setCSize('3/4"') }} />
      <SelectRow label={t('steConduitSize')} options={cSizes} value={cSize} onChange={setCSize} />
      <SelectRow label={t('steWireInsulation')} options={Object.keys(CONDUCTOR_AREA)} value={wType} onChange={v => { setWType(v); setWSize('12 AWG') }} />
      <ChipPicker label={t('stcWireSize')} options={wSizes} value={wSize} onChange={setWSize} />
      <CalcButton onPress={() => { const r = maxConductors(cType, cSize, wType, wSize); setRes(r ? { count: r.count, fillFactor: r.fillFactor } : null) }} />
      {res && (
        <View>
          <ResultCard label={t('steMaxFillResult')} value={`${res.count}`}
            sub={t('steMaxFillSub', { size: wSize, wtype: wType, ctype: cType, csize: cSize })}
            color={res.count > 0 ? '#22C55E' : '#EF4444'} />
          <InfoBox text={t('steMaxFillInfo', { pct: (res.fillFactor * 100).toFixed(0) })} />
        </View>
      )}
    </CalcModal>
  )
}

// ── Table 300.5 — Minimum burial cover ───────────────────────────────────────
export function CalcBurial({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const locKeys = BURIAL_300_5.map(r => r.location)
  const methodKeys = ['directBurial', 'rmcImc', 'pvc', 'resBranch', 'lowVolt']
  const [loc, setLoc] = useState(locKeys[0])
  const [method, setMethod] = useState('directBurial')
  const [res, setRes] = useState<number | null>(null)
  const locLabels: Record<string, string> = {
    general: t('steBurialGeneral'), trenchConcrete: t('steBurialTrench'), underBuilding: t('steBurialBuilding'),
    underSlab: t('steBurialSlab'), streetRoad: t('steBurialStreet'), dwellingDrive: t('steBurialDwelling'), airport: t('steBurialAirport'),
  }
  const methodLabels: Record<string, string> = {
    directBurial: t('steBurialDirect'), rmcImc: 'RMC / IMC', pvc: t('steBurialPvc'),
    resBranch: t('steBurialResBranch'), lowVolt: t('steBurialLowVolt'),
  }
  function calc() {
    const row = BURIAL_300_5.find(r => r.location === loc)
    const idx = methodKeys.indexOf(method)
    setRes(row ? (row.cols[idx] ?? null) : null)
  }
  return (
    <CalcModal visible onClose={onClose} title={t('steBurialTitle')} subtitle={t('steBurialSubtitle')}>
      <SelectRow label={t('steBurialLocation')} options={locKeys.map(k => locLabels[k])} value={locLabels[loc]}
        onChange={v => { const k = locKeys.find(x => locLabels[x] === v); if (k) setLoc(k) }} />
      <SelectRow label={t('steBurialMethod')} options={methodKeys.map(k => methodLabels[k])} value={methodLabels[method]}
        onChange={v => { const k = methodKeys.find(x => methodLabels[x] === v); if (k) setMethod(k) }} />
      <CalcButton onPress={calc} />
      {res != null && (
        <View>
          <ResultCard label={t('steBurialResult')} value={res === 0 ? t('steBurialInRaceway') : `${res}"`}
            sub={res === 0 ? undefined : t('steBurialResultSub')} />
          <InfoBox text={t('steBurialInfo')} />
        </View>
      )}
    </CalcModal>
  )
}

// ── Table 110.26(A)(1) — Working clearance ───────────────────────────────────
export function CalcClearance({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [volts, setVolts] = useState('')
  const [res, setRes] = useState<{ c1: number; c2: number; c3: number } | null>(null)
  return (
    <CalcModal visible onClose={onClose} title={t('steClearanceTitle')} subtitle={t('steClearanceSubtitle')}>
      <NumberField label={t('steVoltageToGround')} value={volts} onChange={setVolts} placeholder={t('steClearancePlaceholder')} />
      <CalcButton onPress={() => { const v = parseFloat(volts); setRes(v ? workingClearance(v) : null) }} />
      {res && (
        <View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ResultCard label={t('steCondition1')} value={`${res.c1} ft`} color="#22C55E" />
            <ResultCard label={t('steCondition2')} value={`${res.c2} ft`} color="#F59E0B" />
            <ResultCard label={t('steCondition3')} value={`${res.c3} ft`} color="#EF4444" />
          </View>
          <InfoBox text={t('steClearanceInfo')} />
        </View>
      )}
    </CalcModal>
  )
}

// ── Table 450.3(B) — Transformer overcurrent protection ──────────────────────
export function CalcTransformer({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [method, setMethod] = useState<'primaryOnly' | 'primaryAndSecondary'>('primaryAndSecondary')
  const [priFla, setPriFla] = useState('')
  const [secFla, setSecFla] = useState('')
  const [res, setRes] = useState<{ pri: number; priSize: number; sec: number | null; secSize: number | null } | null>(null)
  const methodLabels = { primaryOnly: t('steXfmrPrimaryOnly'), primaryAndSecondary: t('steXfmrPriSec') }
  function calc() {
    const p = parseFloat(priFla), s = parseFloat(secFla) || 0
    if (!p) { setRes(null); return }
    const r = transformerProtection(method, p, s)
    const pri = p * r.primaryPct
    const sec = r.secondaryPct != null && s > 0 ? s * r.secondaryPct : null
    setRes({
      pri, priSize: r.roundUpPrimary ? nextStandardOcpd(pri) : prevStandardOcpd(pri),
      sec, secSize: sec == null ? null : (r.roundUpSecondary ? nextStandardOcpd(sec) : prevStandardOcpd(sec)),
    })
  }
  return (
    <CalcModal visible onClose={onClose} title={t('steXfmrTitle')} subtitle={t('steXfmrSubtitle')}>
      <SelectRow label={t('steXfmrMethod')} options={Object.values(methodLabels)} value={methodLabels[method]}
        onChange={v => setMethod(v === methodLabels.primaryOnly ? 'primaryOnly' : 'primaryAndSecondary')} />
      <NumberField label={t('steXfmrPrimaryFla')} value={priFla} onChange={setPriFla} placeholder={t('steXfmrPrimaryPlaceholder')} />
      {method === 'primaryAndSecondary' && (
        <NumberField label={t('steXfmrSecondaryFla')} value={secFla} onChange={setSecFla} placeholder={t('steXfmrSecondaryPlaceholder')} />
      )}
      <CalcButton onPress={calc} />
      {res && (
        <View>
          <ResultCard label={t('steXfmrPrimaryOcpd')} value={`${res.priSize} A`} sub={t('steXfmrMaxCalc', { max: res.pri.toFixed(1) })} />
          {res.secSize != null && (
            <ResultCard label={t('steXfmrSecondaryOcpd')} value={`${res.secSize} A`} sub={t('steXfmrMaxCalc', { max: (res.sec as number).toFixed(1) })} color="#0891B2" />
          )}
          <InfoBox text={t('steXfmrInfo')} />
        </View>
      )}
    </CalcModal>
  )
}

// ── Table 240.6(A) — Standard OCPD sizes ─────────────────────────────────────
export function CalcStdSizes({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [amps, setAmps] = useState('')
  const [res, setRes] = useState<{ next: number; prev: number } | null>(null)
  return (
    <CalcModal visible onClose={onClose} title={t('steStdSizesTitle')} subtitle={t('steStdSizesSubtitle')}>
      <NumberField label={t('steCalculatedAmps')} value={amps} onChange={setAmps} placeholder={t('steStdSizesPlaceholder')} />
      <CalcButton onPress={() => { const a = parseFloat(amps); setRes(a ? { next: nextStandardOcpd(a), prev: prevStandardOcpd(a) } : null) }} />
      {res && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <ResultCard label={t('steNextSizeUp')} value={`${res.next} A`} sub={t('steNextSizeUpSub')} color="#22C55E" />
          <ResultCard label={t('steNextSizeDown')} value={`${res.prev} A`} sub={t('steNextSizeDownSub')} color="#F59E0B" />
        </View>
      )}
      <Text style={[lbl, { marginTop: 16 }]}>{t('steStdSizesList')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {STANDARD_OCPD.map(s => (
          <View key={s} style={{ backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: COLORS.navy, fontWeight: '700', fontSize: 12 }}>{s}</Text>
          </View>
        ))}
      </View>
    </CalcModal>
  )
}

// ── Table 310.15(B)(1) — Ambient temperature correction ──────────────────────
export function CalcAmbient({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [ambient, setAmbient] = useState('')
  const [rating, setRating] = useState<'60' | '75' | '90'>('90')
  const [base, setBase] = useState('')
  const [res, setRes] = useState<{ factor: number | null; corrected: number | null } | null>(null)
  function calc() {
    const a = parseFloat(ambient)
    if (isNaN(a)) { setRes(null); return }
    const factor = ambientCorrection(a, rating)
    const b = parseFloat(base)
    setRes({ factor, corrected: factor != null && b ? b * factor : null })
  }
  return (
    <CalcModal visible onClose={onClose} title={t('steAmbientTitle')} subtitle={t('steAmbientSubtitle')}>
      <NumberField label={t('steAmbientTemp')} value={ambient} onChange={setAmbient} placeholder={t('steAmbientPlaceholder')} />
      <SelectRow label={t('steInsulationTempRating')} options={['60', '75', '90']} value={rating} onChange={v => setRating(v as '60' | '75' | '90')} />
      <NumberField label={t('steBaseAmpacityOpt')} value={base} onChange={setBase} placeholder={t('steBaseAmpacityPlaceholder')} />
      <CalcButton onPress={calc} />
      {res && (
        <View>
          {res.factor == null ? (
            <InfoBox text={t('steAmbientNotPermitted')} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ResultCard label={t('steCorrectionFactor')} value={`× ${res.factor}`} />
              {res.corrected != null && <ResultCard label={t('steCorrectedAmpacity')} value={`${res.corrected.toFixed(1)} A`} color="#0891B2" />}
            </View>
          )}
          <InfoBox text={t('steAmbientInfo')} />
        </View>
      )}
    </CalcModal>
  )
}

// ── Table 310.15(C)(1) — Adjustment for >3 current-carrying conductors ────────
export function CalcAdjustment({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [n, setN] = useState('')
  const [base, setBase] = useState('')
  const [res, setRes] = useState<{ factor: number; corrected: number | null } | null>(null)
  function calc() {
    const num = parseInt(n)
    if (!num) { setRes(null); return }
    const factor = adjustmentFactor(num)
    const b = parseFloat(base)
    setRes({ factor, corrected: b ? b * factor : null })
  }
  return (
    <CalcModal visible onClose={onClose} title={t('steAdjustTitle')} subtitle={t('steAdjustSubtitle')}>
      <NumberField label={t('steCurrentCarryingConductors')} value={n} onChange={setN} placeholder={t('steAdjustPlaceholder')} />
      <NumberField label={t('steBaseAmpacityOpt')} value={base} onChange={setBase} placeholder={t('steBaseAmpacityPlaceholder')} />
      <CalcButton onPress={calc} />
      {res && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <ResultCard label={t('steAdjustFactor')} value={`${(res.factor * 100).toFixed(0)}%`} color={res.factor < 1 ? '#EF4444' : '#22C55E'} />
          {res.corrected != null && <ResultCard label={t('steAdjustedAmpacity')} value={`${res.corrected.toFixed(1)} A`} color="#0891B2" />}
        </View>
      )}
    </CalcModal>
  )
}

// ── Table 220.42 — General lighting demand ───────────────────────────────────
export function CalcLightingDemand({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const occKeys = ['dwelling', 'hospital', 'hotelMotel', 'warehouse', 'other']
  const [occ, setOcc] = useState('dwelling')
  const [va, setVa] = useState('')
  const [res, setRes] = useState<{ demand: number; amps: number } | null>(null)
  const occLabels: Record<string, string> = {
    dwelling: t('steOccDwelling'), hospital: t('steOccHospital'), hotelMotel: t('steOccHotel'), warehouse: t('steOccWarehouse'), other: t('steOccOther'),
  }
  function calc() {
    const v = parseFloat(va)
    if (!v) { setRes(null); return }
    const demand = lightingDemandVA(occ, v)
    setRes({ demand, amps: demand / 240 })
  }
  return (
    <CalcModal visible onClose={onClose} title={t('steLightingTitle')} subtitle={t('steLightingSubtitle')}>
      <SelectRow label={t('steOccupancy')} options={occKeys.map(k => occLabels[k])} value={occLabels[occ]}
        onChange={v => { const k = occKeys.find(x => occLabels[x] === v); if (k) setOcc(k) }} />
      <NumberField label={t('steConnectedVA')} value={va} onChange={setVa} placeholder={t('steConnectedVAPlaceholder')} />
      <CalcButton onPress={calc} />
      {res && (
        <View>
          <ResultCard label={t('steDemandLoad')} value={`${Math.round(res.demand).toLocaleString()} VA`} sub={t('steDemandAmps', { amps: res.amps.toFixed(1) })} />
          <InfoBox text={t('steLightingInfo')} />
        </View>
      )}
    </CalcModal>
  )
}

// ── Table 220.55 — Household range demand ────────────────────────────────────
export function CalcRangeDemand({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [n, setN] = useState('')
  const [kw, setKw] = useState('12')
  const [res, setRes] = useState<{ demand: number; amps: number } | null>(null)
  function calc() {
    const num = parseInt(n), rating = parseFloat(kw) || 12
    const demand = rangeDemandColC(num, rating)
    if (demand == null) { setRes(null); return }
    setRes({ demand, amps: (demand * 1000) / 240 })
  }
  return (
    <CalcModal visible onClose={onClose} title={t('steRangeTitle')} subtitle={t('steRangeSubtitle')}>
      <NumberField label={t('steNumRanges')} value={n} onChange={setN} placeholder={t('steNumRangesPlaceholder')} />
      <NumberField label={t('steRangeRatingKw')} value={kw} onChange={setKw} placeholder={t('steRangeRatingPlaceholder')} />
      <CalcButton onPress={calc} />
      {res && (
        <View>
          <ResultCard label={t('steRangeDemand')} value={`${res.demand.toFixed(1)} kW`} sub={t('steDemandAmps', { amps: res.amps.toFixed(1) })} />
          <InfoBox text={t('steRangeInfo')} />
        </View>
      )}
    </CalcModal>
  )
}

// ── Table 220.84 — Optional multifamily demand ───────────────────────────────
export function CalcMultifamily({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [units, setUnits] = useState('')
  const [va, setVa] = useState('')
  const [res, setRes] = useState<{ pct: number; demand: number | null; amps: number | null } | null>(null)
  function calc() {
    const u = parseInt(units)
    const pct = multifamilyDemandPct(u)
    if (pct == null) { setRes(null); return }
    const connected = parseFloat(va)
    const demand = connected ? connected * (pct / 100) : null
    setRes({ pct, demand, amps: demand ? demand / 240 : null })
  }
  return (
    <CalcModal visible onClose={onClose} title={t('steMultifamilyTitle')} subtitle={t('steMultifamilySubtitle')}>
      <NumberField label={t('steNumUnits')} value={units} onChange={setUnits} placeholder={t('steNumUnitsPlaceholder')} />
      <NumberField label={t('steConnectedVAOpt')} value={va} onChange={setVa} placeholder={t('steConnectedVAPlaceholder')} />
      <CalcButton onPress={calc} />
      {res && (
        <View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ResultCard label={t('steDemandFactor')} value={`${res.pct}%`} />
            {res.demand != null && <ResultCard label={t('steDemandLoad')} value={`${Math.round(res.demand).toLocaleString()} VA`} sub={res.amps ? t('steDemandAmps', { amps: res.amps.toFixed(0) }) : undefined} color="#0891B2" />}
          </View>
          <InfoBox text={t('steMultifamilyInfo')} />
        </View>
      )}
    </CalcModal>
  )
}

// ── Reference cards (rules-based) ────────────────────────────────────────────
export function RefFeederTap({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  return (
    <CalcModal visible onClose={onClose} title={t('steTapTitle')} subtitle={t('steTapSubtitle')}>
      <BulletList items={[t('steTap10a'), t('steTap10b'), t('steTap25a'), t('steTap25b'), t('steTapXfmr'), t('steTapOutside')]} />
      <InfoBox text={t('steTapInfo')} />
    </CalcModal>
  )
}

export function RefClass2({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  return (
    <CalcModal visible onClose={onClose} title={t('steClass2Title')} subtitle={t('steClass2Subtitle')}>
      <BulletList items={[t('steClass2a'), t('steClass2b'), t('steClass2c'), t('steClass2d')]} />
      <InfoBox text={t('steClass2Info')} />
    </CalcModal>
  )
}

// ── Table 310.12 — Dwelling service / feeder conductors ──────────────────────
export function CalcDwellingService({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const [amps, setAmps] = useState<string>('')
  const row = DWELLING_SERVICE_310_12.find(r => String(r.amps) === amps)
  return (
    <CalcModal visible onClose={onClose} title={t('steDwellingTitle')} subtitle={t('steDwellingSubtitle')}>
      <ChipPicker label={t('steDwellingAmps')} options={DWELLING_SERVICE_310_12.map(r => String(r.amps))} value={amps} onChange={setAmps} />
      {row ? (
        <View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ResultCard label={t('steDwellingCopper')} value={row.cu} />
            <ResultCard label={t('steDwellingAluminum')} value={row.al} color="#1565C0" />
          </View>
          <InfoBox text={t('steDwellingInfo')} />
        </View>
      ) : null}
      <RefTable
        headers={[t('steAmps'), t('steCopperCol'), t('steAluminumCol')]}
        rows={DWELLING_SERVICE_310_12.map(r => [`${r.amps}A`, r.cu, r.al])}
        highlightRow={r => r[0] === (amps ? `${amps}A` : '')}
      />
    </CalcModal>
  )
}

// ── Chapter 9, Table 8 — Conductor DC resistance (reference) ─────────────────
export function CalcResistance({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  return (
    <CalcModal visible onClose={onClose} title={t('steResistanceTitle')} subtitle={t('steResistanceSubtitle')}>
      <InfoBox text={t('steResistanceInfo')} />
      <RefTable
        headers={[t('steWireSizeCol'), t('steCopperKft'), t('steAluminumKft')]}
        rows={DC_RESISTANCE_CH9_T8.map(r => [r.size, r.cu, r.al ?? '—'])}
      />
    </CalcModal>
  )
}

// ── Chapter 9, Table 2 — Minimum conduit bend radius (reference) ─────────────
export function CalcConduitBend({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  return (
    <CalcModal visible onClose={onClose} title={t('steBendTitle')} subtitle={t('steBendSubtitle')}>
      <InfoBox text={t('steBendInfo')} />
      <RefTable
        headers={[t('steTradeSize'), t('steBendOneShot'), t('steBendOther')]}
        rows={CONDUIT_BEND_CH9_T2.map(r => [r.size, `${r.oneShot}"`, `${r.other}"`])}
      />
    </CalcModal>
  )
}

export function RefPoolBonding({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  return (
    <CalcModal visible onClose={onClose} title={t('stePoolTitle')} subtitle={t('stePoolSubtitle')}>
      <BulletList items={[t('stePoolA'), t('stePoolB'), t('stePoolC'), t('stePoolD'), t('stePoolE')]} />
      <InfoBox text={t('stePoolInfo')} />
    </CalcModal>
  )
}
