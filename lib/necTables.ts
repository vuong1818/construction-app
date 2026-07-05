// ─────────────────────────────────────────────────────────────────────────────
// NEC reference tables + pure lookup helpers for the electrical Smart Tools.
//
// Values transcribed from NEC (2023/2026 editions). Motor, conduit, and wire-
// area tables are stable across recent editions; demand-factor and grounding
// tables follow the 2023 renumbering. These are field aids — ALWAYS verify the
// final design against the adopted code book and the AHJ. No warranty.
//
// Everything here is pure data + pure functions (no React, no I/O) so it can be
// unit-reasoned and reused by any screen.
// ─────────────────────────────────────────────────────────────────────────────

// Ordered standard conductor sizes, smallest → largest, with circular-mil area
// (kcmil) used for threshold comparisons in the grounding tables.
export const CONDUCTOR_KCMIL: Record<string, number> = {
  '14 AWG': 4.107, '12 AWG': 6.53, '10 AWG': 10.38, '8 AWG': 16.51,
  '6 AWG': 26.24, '4 AWG': 41.74, '3 AWG': 52.62, '2 AWG': 66.36,
  '1 AWG': 83.69, '1/0': 105.6, '2/0': 133.1, '3/0': 167.8, '4/0': 211.6,
  '250': 250, '300': 300, '350': 350, '400': 400, '500': 500, '600': 600,
  '700': 700, '750': 750, '800': 800, '900': 900, '1000': 1000, '1100': 1100,
  '1250': 1250, '1500': 1500, '1750': 1750, '2000': 2000,
}

// Common service / feeder conductor sizes a user would pick from.
export const SERVICE_SIZES = [
  '8 AWG', '6 AWG', '4 AWG', '3 AWG', '2 AWG', '1 AWG', '1/0', '2/0', '3/0',
  '4/0', '250', '300', '350', '400', '500', '600', '700', '750', '800', '900',
  '1000', '1250', '1500', '1750', '2000',
]

// ─── Table 250.66 — Grounding Electrode Conductor (GEC) ──────────────────────
// Keyed on the largest ungrounded service-entrance conductor (or equivalent
// area for parallel sets). Thresholds differ by the SERVICE conductor material.
// Each row gives the GEC in both copper and aluminum.
type GecRow = { maxKcmil: number; cu: string; al: string }

const GEC_250_66_CU: GecRow[] = [
  { maxKcmil: 66.36,  cu: '8 AWG', al: '6 AWG' },  // 2 AWG or smaller
  { maxKcmil: 105.6,  cu: '6 AWG', al: '4 AWG' },  // 1 or 1/0
  { maxKcmil: 167.8,  cu: '4 AWG', al: '2 AWG' },  // 2/0 or 3/0
  { maxKcmil: 350,    cu: '2 AWG', al: '1/0'   },  // over 3/0 thru 350
  { maxKcmil: 600,    cu: '1/0',   al: '3/0'   },  // over 350 thru 600
  { maxKcmil: 1100,   cu: '2/0',   al: '4/0'   },  // over 600 thru 1100
  { maxKcmil: Infinity, cu: '3/0', al: '250'   },  // over 1100
]

const GEC_250_66_AL: GecRow[] = [
  { maxKcmil: 105.6,  cu: '8 AWG', al: '6 AWG' },  // 1/0 or smaller
  { maxKcmil: 167.8,  cu: '6 AWG', al: '4 AWG' },  // 2/0 or 3/0
  { maxKcmil: 250,    cu: '4 AWG', al: '2 AWG' },  // 4/0 or 250
  { maxKcmil: 500,    cu: '2 AWG', al: '1/0'   },  // over 250 thru 500
  { maxKcmil: 900,    cu: '1/0',   al: '3/0'   },  // over 500 thru 900
  { maxKcmil: 1750,   cu: '2/0',   al: '4/0'   },  // over 900 thru 1750
  { maxKcmil: Infinity, cu: '3/0', al: '250'   },  // over 1750
]

/** GEC per Table 250.66. serviceMat = material of the ungrounded service conductor. */
export function gecForService(serviceMat: 'CU' | 'AL', serviceSize: string): { cu: string; al: string } | null {
  const kcmil = CONDUCTOR_KCMIL[serviceSize]
  if (kcmil == null) return null
  const rows = serviceMat === 'CU' ? GEC_250_66_CU : GEC_250_66_AL
  const row = rows.find(r => kcmil <= r.maxKcmil) ?? rows[rows.length - 1]
  return { cu: row.cu, al: row.al }
}

// ─── Table 250.102(C)(1) — Supply-Side Bonding Jumper ────────────────────────
// The tabulated portion mirrors 250.66. Above the table (Cu > 1100 kcmil /
// Al > 1750 kcmil) the jumper is 12.5% of the largest ungrounded conductor area.
export function supplySideBondingJumper(
  supplyMat: 'CU' | 'AL',
  supplySize: string,
): { cu: string; al: string; over: boolean } | null {
  const kcmil = CONDUCTOR_KCMIL[supplySize]
  if (kcmil == null) return null
  const overTable = supplyMat === 'CU' ? kcmil > 1100 : kcmil > 1750
  const base = gecForService(supplyMat, supplySize)
  if (!base) return null
  return { ...base, over: overTable }
}

// ─── Table 240.6(A) — Standard ampere ratings (fuses & inverse-time breakers) ─
export const STANDARD_OCPD = [
  15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200,
  225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000,
  2500, 3000, 4000, 5000, 6000,
]

/** Smallest standard OCPD that is >= amps (240.6 "next size up"). */
export function nextStandardOcpd(amps: number): number {
  return STANDARD_OCPD.find(s => s >= amps) ?? STANDARD_OCPD[STANDARD_OCPD.length - 1]
}
/** Largest standard OCPD that is <= amps (240.4 "do not exceed"). */
export function prevStandardOcpd(amps: number): number {
  let best = STANDARD_OCPD[0]
  for (const s of STANDARD_OCPD) { if (s <= amps) best = s; else break }
  return best
}

// ─── Tables 430.248 / 430.250 — Motor Full-Load Current (A) ──────────────────
// Use these NEC values (NOT the nameplate) for conductor & OCPD sizing where
// the NEC requires it (430.6(A)(1)).
export const MOTOR_HP_1PH = ['1/6', '1/4', '1/3', '1/2', '3/4', '1', '1-1/2', '2', '3', '5', '7-1/2', '10']
export const MOTOR_1PH_FLC: Record<string, Record<string, number>> = {
  // volts → hp → amps
  '115': { '1/6': 4.4, '1/4': 5.8, '1/3': 7.2, '1/2': 9.8, '3/4': 13.8, '1': 16, '1-1/2': 20, '2': 24, '3': 34, '5': 56, '7-1/2': 80, '10': 100 },
  '208': { '1/6': 2.4, '1/4': 3.2, '1/3': 4.0, '1/2': 5.4, '3/4': 7.6, '1': 8.8, '1-1/2': 11, '2': 13.2, '3': 18.7, '5': 30.8, '7-1/2': 44, '10': 55 },
  '230': { '1/6': 2.2, '1/4': 2.9, '1/3': 3.6, '1/2': 4.9, '3/4': 6.9, '1': 8.0, '1-1/2': 10, '2': 12, '3': 17, '5': 28, '7-1/2': 40, '10': 50 },
}

export const MOTOR_HP_3PH = ['1/2', '3/4', '1', '1-1/2', '2', '3', '5', '7-1/2', '10', '15', '20', '25', '30', '40', '50', '60', '75', '100', '125', '150', '200']
export const MOTOR_3PH_FLC: Record<string, Record<string, number>> = {
  '208': { '1/2': 2.4, '3/4': 3.5, '1': 4.6, '1-1/2': 6.6, '2': 7.5, '3': 10.6, '5': 16.7, '7-1/2': 24.2, '10': 30.8, '15': 46.2, '20': 59.4, '25': 74.8, '30': 88, '40': 114, '50': 143, '60': 169, '75': 211, '100': 273, '125': 343, '150': 396, '200': 528 },
  '230': { '1/2': 2.2, '3/4': 3.2, '1': 4.2, '1-1/2': 6.0, '2': 6.8, '3': 9.6, '5': 15.2, '7-1/2': 22, '10': 28, '15': 42, '20': 54, '25': 68, '30': 80, '40': 104, '50': 130, '60': 154, '75': 192, '100': 248, '125': 312, '150': 360, '200': 480 },
  '460': { '1/2': 1.1, '3/4': 1.6, '1': 2.1, '1-1/2': 3.0, '2': 3.4, '3': 4.8, '5': 7.6, '7-1/2': 11, '10': 14, '15': 21, '20': 27, '25': 34, '30': 40, '40': 52, '50': 65, '60': 77, '75': 96, '100': 124, '125': 156, '150': 180, '200': 240 },
  '575': { '1/2': 0.9, '3/4': 1.3, '1': 1.7, '1-1/2': 2.4, '2': 2.7, '3': 3.9, '5': 6.1, '7-1/2': 9, '10': 11, '15': 17, '20': 22, '25': 27, '30': 32, '40': 41, '50': 52, '60': 62, '75': 77, '100': 99, '125': 125, '150': 144, '200': 192 },
}

export function motorFLC(phase: '1' | '3', volts: string, hp: string): number | null {
  const table = phase === '1' ? MOTOR_1PH_FLC : MOTOR_3PH_FLC
  return table[volts]?.[hp] ?? null
}

// ─── Table 430.52 — Motor branch-circuit short-circuit / ground-fault OCPD ────
// Max % of FLC by device type (general AC motors other than wound-rotor/DC).
export const MOTOR_OCPD_PCT = {
  ntdFuse: 3.00,        // Non-time-delay fuse — 300%
  dualElementFuse: 1.75,// Dual-element (time-delay) fuse — 175%
  instTrip: 8.00,       // Instantaneous-trip breaker — 800%
  inverseTime: 2.50,    // Inverse-time breaker — 250%
} as const

// ─── Table 300.5 — Minimum cover for direct-burial / raceway (inches) ────────
// Columns: 1 Direct burial · 2 RMC/IMC · 3 Nonmetallic raceway (PVC) ·
//          4 Res. branch ≤120V/20A GFCI · 5 Landscape/irrigation ≤30V
export const BURIAL_300_5: { location: string; cols: (number | null)[] }[] = [
  { location: 'general',        cols: [24, 6, 18, 12, 6] },
  { location: 'trenchConcrete', cols: [18, 6, 12, 6, 6] },   // below 2" concrete/equiv in trench
  { location: 'underBuilding',  cols: [0, 0, 0, 0, 0] },      // in raceway only
  { location: 'underSlab',      cols: [18, 4, 4, 6, 6] },     // ≥4" concrete slab, no vehicles
  { location: 'streetRoad',     cols: [24, 24, 24, 24, 24] }, // streets/roads/parking (commercial)
  { location: 'dwellingDrive',  cols: [18, 18, 18, 12, 18] }, // 1-/2-family driveway & parking
  { location: 'airport',        cols: [18, 18, 18, 18, 18] },
]
export const BURIAL_COL_KEYS = ['directBurial', 'rmcImc', 'pvc', 'resBranch', 'lowVolt'] as const

// ─── Table 110.26(A)(1) — Working clearance in front of equipment (feet) ─────
// Conditions 1/2/3. Covers ≤600V nominal to ground (see 110.34 for over 600V).
export const WORKING_CLEARANCE_110_26 = [
  { maxV: 150,  c1: 3, c2: 3,   c3: 3 },
  { maxV: 600,  c1: 3, c2: 3.5, c3: 4 },
  { maxV: 1000, c1: 3, c2: 4,   c3: 5 },
]
export function workingClearance(voltageToGround: number): { c1: number; c2: number; c3: number } | null {
  const row = WORKING_CLEARANCE_110_26.find(r => voltageToGround <= r.maxV)
  return row ? { c1: row.c1, c2: row.c2, c3: row.c3 } : null
}

// ─── Table 450.3(B) — Transformer OCPD (1000V or less), max % of rated current ─
// Returns the max multipliers; caller applies 240.6 rounding where noted.
export function transformerProtection(
  method: 'primaryOnly' | 'primaryAndSecondary',
  primaryFLA: number,
  secondaryFLA: number,
): { primaryPct: number; secondaryPct: number | null; roundUpPrimary: boolean; roundUpSecondary: boolean } {
  if (method === 'primaryOnly') {
    let primaryPct = 1.25, roundUpPrimary = true
    if (primaryFLA < 2) { primaryPct = 3.00; roundUpPrimary = false }
    else if (primaryFLA < 9) { primaryPct = 1.67; roundUpPrimary = false }
    return { primaryPct, secondaryPct: null, roundUpPrimary, roundUpSecondary: false }
  }
  // Primary AND secondary protection: primary up to 250%; secondary 125% (≥9A) or 167% (<9A).
  const secondaryPct = secondaryFLA >= 9 ? 1.25 : 1.67
  return { primaryPct: 2.50, secondaryPct, roundUpPrimary: false, roundUpSecondary: secondaryFLA >= 9 }
}

// ─── Table 310.15(B)(1) — Ambient temperature correction factors (30°C base) ──
// factor keyed by insulation rating (60/75/90 °C). null = not permitted.
export const AMBIENT_310_15: { maxC: number; f60: number | null; f75: number | null; f90: number | null }[] = [
  { maxC: 10, f60: 1.29, f75: 1.20, f90: 1.15 },
  { maxC: 15, f60: 1.22, f75: 1.15, f90: 1.12 },
  { maxC: 20, f60: 1.15, f75: 1.11, f90: 1.08 },
  { maxC: 25, f60: 1.08, f75: 1.05, f90: 1.04 },
  { maxC: 30, f60: 1.00, f75: 1.00, f90: 1.00 },
  { maxC: 35, f60: 0.91, f75: 0.94, f90: 0.96 },
  { maxC: 40, f60: 0.82, f75: 0.88, f90: 0.91 },
  { maxC: 45, f60: 0.71, f75: 0.82, f90: 0.87 },
  { maxC: 50, f60: 0.58, f75: 0.75, f90: 0.82 },
  { maxC: 55, f60: 0.41, f75: 0.67, f90: 0.76 },
  { maxC: 60, f60: null, f75: 0.58, f90: 0.71 },
  { maxC: 65, f60: null, f75: 0.47, f90: 0.65 },
  { maxC: 70, f60: null, f75: 0.33, f90: 0.58 },
  { maxC: 75, f60: null, f75: null, f90: 0.50 },
  { maxC: 80, f60: null, f75: null, f90: 0.41 },
  { maxC: 85, f60: null, f75: null, f90: 0.29 },
]
export function ambientCorrection(ambientC: number, tempRating: '60' | '75' | '90'): number | null {
  const row = AMBIENT_310_15.find(r => ambientC <= r.maxC) ?? AMBIENT_310_15[AMBIENT_310_15.length - 1]
  return tempRating === '60' ? row.f60 : tempRating === '75' ? row.f75 : row.f90
}

// ─── Table 310.15(C)(1) — Adjustment factors for >3 current-carrying conductors ─
export function adjustmentFactor(conductors: number): number {
  if (conductors <= 3) return 1.0
  if (conductors <= 6) return 0.80
  if (conductors <= 9) return 0.70
  if (conductors <= 20) return 0.50
  if (conductors <= 30) return 0.45
  if (conductors <= 40) return 0.40
  return 0.35
}

// ─── Table 220.42 — General lighting demand factors, by occupancy ────────────
// Each occupancy = ordered VA tiers with a demand %.
export const LIGHTING_DEMAND_220_42: Record<string, { upTo: number; pct: number }[]> = {
  dwelling:  [{ upTo: 3000, pct: 100 }, { upTo: 120000, pct: 35 }, { upTo: Infinity, pct: 25 }],
  hospital:  [{ upTo: 50000, pct: 40 }, { upTo: Infinity, pct: 20 }],
  hotelMotel:[{ upTo: 20000, pct: 50 }, { upTo: 100000, pct: 40 }, { upTo: Infinity, pct: 30 }],
  warehouse: [{ upTo: 12500, pct: 100 }, { upTo: Infinity, pct: 50 }],
  other:     [{ upTo: Infinity, pct: 100 }],
}
export function lightingDemandVA(occupancy: string, connectedVA: number): number {
  const tiers = LIGHTING_DEMAND_220_42[occupancy] ?? LIGHTING_DEMAND_220_42.other
  let remaining = connectedVA, prev = 0, demand = 0
  for (const tier of tiers) {
    const band = Math.min(remaining, tier.upTo - prev)
    if (band <= 0) break
    demand += band * (tier.pct / 100)
    remaining -= band
    prev = tier.upTo
    if (remaining <= 0) break
  }
  return demand
}

// ─── Table 220.55 Column C — Household cooking appliance demand (kW) ──────────
// Column C applies to ranges/appliances individually rated over 1.75 kW.
export const RANGE_DEMAND_COL_C: Record<number, number> = {
  1: 8, 2: 11, 3: 14, 4: 17, 5: 20, 6: 21, 7: 22, 8: 23, 9: 24, 10: 25,
  11: 26, 12: 27, 13: 28, 14: 29, 15: 30, 16: 31, 17: 32, 18: 33, 19: 34,
  20: 35, 21: 36, 22: 37, 23: 38, 24: 39, 25: 40,
}
/**
 * Column C demand for n ranges each not over 12 kW. Note 1: for ranges rated
 * 12–27 kW, increase the Col C value 5% for each kW (or major fraction) the
 * rating exceeds 12 kW. rating = per-appliance nameplate kW (assumes uniform).
 */
export function rangeDemandColC(n: number, ratingKW: number): number | null {
  if (n < 1) return null
  let base: number
  if (n <= 25) base = RANGE_DEMAND_COL_C[n]
  else if (n <= 30) base = 15 + n              // 26–30 ranges: 15 kW + 1 kW/range
  else if (n <= 40) base = 25 + Math.round(0.75 * n)
  else base = 25 + Math.round(0.75 * n)
  if (ratingKW > 12) {
    const over = Math.ceil(ratingKW - 12)
    base = base * (1 + 0.05 * over)
  }
  return base
}

// ─── Table 220.84(B) — Optional multifamily demand factors (3+ units) ────────
export const MULTIFAMILY_220_84: { maxUnits: number; pct: number }[] = [
  { maxUnits: 5, pct: 45 }, { maxUnits: 7, pct: 44 }, { maxUnits: 10, pct: 43 },
  { maxUnits: 11, pct: 42 }, { maxUnits: 13, pct: 41 }, { maxUnits: 15, pct: 40 },
  { maxUnits: 17, pct: 39 }, { maxUnits: 20, pct: 38 }, { maxUnits: 21, pct: 37 },
  { maxUnits: 23, pct: 36 }, { maxUnits: 25, pct: 35 }, { maxUnits: 27, pct: 34 },
  { maxUnits: 30, pct: 33 }, { maxUnits: 35, pct: 31 }, { maxUnits: 40, pct: 30 },
  { maxUnits: 60, pct: 28 }, { maxUnits: Infinity, pct: 23 },
]
export function multifamilyDemandPct(units: number): number | null {
  if (units < 3) return null
  return (MULTIFAMILY_220_84.find(r => units <= r.maxUnits) ?? MULTIFAMILY_220_84[MULTIFAMILY_220_84.length - 1]).pct
}

// ─── Chapter 9 Table 4 — Conduit internal area (sq in, 100%) ──────────────────
export const CONDUIT_AREA_100: Record<string, Record<string, number>> = {
  EMT:    { '1/2"': 0.304, '3/4"': 0.533, '1"': 0.864, '1-1/4"': 1.496, '1-1/2"': 1.963, '2"': 3.356, '2-1/2"': 5.858, '3"': 8.846, '3-1/2"': 11.545, '4"': 14.753 },
  IMC:    { '1/2"': 0.342, '3/4"': 0.586, '1"': 0.959, '1-1/4"': 1.647, '1-1/2"': 2.225, '2"': 3.630, '2-1/2"': 5.135, '3"': 7.922, '3-1/2"': 10.584, '4"': 13.631 },
  RMC:    { '1/2"': 0.314, '3/4"': 0.549, '1"': 0.887, '1-1/4"': 1.526, '1-1/2"': 2.071, '2"': 3.408, '2-1/2"': 4.866, '3"': 7.499, '3-1/2"': 10.010, '4"': 12.882 },
  'PVC-40': { '1/2"': 0.285, '3/4"': 0.508, '1"': 0.832, '1-1/4"': 1.453, '1-1/2"': 1.986, '2"': 3.291, '2-1/2"': 4.695, '3"': 7.268, '3-1/2"': 9.737, '4"': 12.554 },
  'PVC-80': { '1/2"': 0.217, '3/4"': 0.409, '1"': 0.688, '1-1/4"': 1.237, '1-1/2"': 1.711, '2"': 2.874, '2-1/2"': 4.119, '3"': 6.442, '3-1/2"': 8.688, '4"': 11.258 },
}

// ─── Chapter 9 Table 5 — Insulated conductor area (sq in) ─────────────────────
export const CONDUCTOR_AREA: Record<string, Record<string, number>> = {
  'THHN/THWN': {
    '14 AWG': 0.0097, '12 AWG': 0.0133, '10 AWG': 0.0211, '8 AWG': 0.0366,
    '6 AWG': 0.0507, '4 AWG': 0.0824, '3 AWG': 0.0973, '2 AWG': 0.1158,
    '1 AWG': 0.1562, '1/0': 0.1855, '2/0': 0.2223, '3/0': 0.2679, '4/0': 0.3237,
    '250': 0.3970, '300': 0.4608, '350': 0.5242, '400': 0.5863, '500': 0.7073,
    '600': 0.8676, '750': 1.0496,
  },
  'XHHW': {
    '14 AWG': 0.0139, '12 AWG': 0.0181, '10 AWG': 0.0243, '8 AWG': 0.0437,
    '6 AWG': 0.0590, '4 AWG': 0.0814, '3 AWG': 0.0962, '2 AWG': 0.1146,
    '1 AWG': 0.1534, '1/0': 0.1825, '2/0': 0.2190, '3/0': 0.2642, '4/0': 0.3197,
    '250': 0.3904, '300': 0.4536, '350': 0.5166, '400': 0.5782, '500': 0.6984,
    '600': 0.8709, '750': 1.0532,
  },
  'RHH/RHW': {
    '14 AWG': 0.0209, '12 AWG': 0.0260, '10 AWG': 0.0333, '8 AWG': 0.0556,
    '6 AWG': 0.0726, '4 AWG': 0.0973, '3 AWG': 0.1134, '2 AWG': 0.1333,
    '1 AWG': 0.1901, '1/0': 0.2223, '2/0': 0.2624, '3/0': 0.3117, '4/0': 0.3718,
    '250': 0.4596, '300': 0.5281, '350': 0.5958, '400': 0.6619, '500': 0.7901,
  },
}

// NEC Ch.9 Table 1 max fill: 1 conductor 53%, 2 conductors 31%, over 2 = 40%.
export function maxFillFactor(n: number): number {
  return n === 1 ? 0.53 : n === 2 ? 0.31 : 0.40
}

/**
 * Annex C style answer, computed from Ch.9 Table 4/5 + Table 1 fill rules:
 * how many identical conductors of a given type/size fit in a conduit.
 */
export function maxConductors(conduitType: string, conduitSize: string, wireType: string, wireSize: string): {
  count: number; conduitArea: number; wireArea: number; fillFactor: number
} | null {
  const conduitArea = CONDUIT_AREA_100[conduitType]?.[conduitSize]
  const wireArea = CONDUCTOR_AREA[wireType]?.[wireSize]
  if (conduitArea == null || wireArea == null) return null
  // The allowed fill % depends on the final count (1→53%, 2→31%, >2→40%), so
  // evaluate the largest bracket down: if >2 fit at 40% use that; else fall to
  // the exact 2- or 1-conductor limit.
  const nOver2 = Math.floor((conduitArea * 0.40) / wireArea)
  let count: number
  if (nOver2 >= 3) count = nOver2
  else if (Math.floor((conduitArea * 0.31) / wireArea) >= 2) count = 2
  else if (Math.floor((conduitArea * 0.53) / wireArea) >= 1) count = 1
  else count = 0
  return { count, conduitArea, wireArea, fillFactor: maxFillFactor(count) }
}
