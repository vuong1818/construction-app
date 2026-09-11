/**
 * Wage rules, kept in step with the web portal's lib/payrollWage.js.
 *
 * A worker can carry a second rate (oos_wage) that applies only on projects
 * outside the company's home state. Any screen that shows labor dollars has to
 * apply it — a phone that pays the flat rate and a web portal that pays the
 * out-of-state rate hand the same worker two different checks.
 */

export type WageProfile = { wage: number | null; oos_wage?: number | null }

/** One shift, as far as the rate is concerned: it may carry its own price. */
export type WageEntry = { wage_override?: number | string | null } | null | undefined

/** The hourly rate for one shift: the out-of-state rate when it applies, else the base. */
export function effectiveWage(
  profile: WageProfile | null | undefined,
  { projectState, companyState }: { projectState?: string | null; companyState?: string | null } = {}
): number {
  const ps = (projectState || '').trim().toUpperCase()
  const cs = (companyState || '').trim().toUpperCase()
  const oos = Number(profile?.oos_wage) || 0
  if (oos > 0 && ps && cs && ps !== cs) return oos
  return Number(profile?.wage) || 0
}

/**
 * The rate a single shift actually paid.
 *
 * A manager can price one shift by hand in Time & Payroll on the web
 * (time_entries.wage_override) — a helper who ran the crew that day, a premium
 * shift. That number beats both profile rates. Null, which is every entry the
 * clock writes, falls straight through to the rules above.
 *
 * Zero is a real override (an unpaid shift still on the timesheet), so the test
 * is "is it set", never "is it truthy".
 */
export function entryWage(
  entry: WageEntry,
  profile: WageProfile | null | undefined,
  states: { projectState?: string | null; companyState?: string | null } = {}
): number {
  const o = entry?.wage_override
  if (o !== null && o !== undefined && o !== '' && Number.isFinite(Number(o))) return Number(o)
  return effectiveWage(profile, states)
}

export type OvertimeRule = { enabled?: boolean | null; threshold?: number | null; multiplier?: number | null }

/**
 * Split a worker's week into regular and overtime and price it.
 *
 * `shifts` is the week's finished shifts in the order they were worked, each
 * { hours, rate }. Hours beyond the threshold pay rate × multiplier; a shift
 * that straddles the line is split. With overtime off every hour is regular.
 * Mirrors lib/payrollWage.js on the web — keep in sync.
 */
export function applyOvertime(shifts: { hours: number; rate: number }[], ot: OvertimeRule | null | undefined) {
  const on = !!ot?.enabled && Number(ot?.threshold) >= 0
  const threshold = on ? Number(ot!.threshold) : Infinity
  const mult = on ? (Number(ot!.multiplier) || 1.5) : 1
  let worked = 0, regularHours = 0, overtimeHours = 0, labor = 0, premium = 0
  for (const s of shifts || []) {
    const h = Number(s.hours) || 0
    if (!(h > 0)) continue
    const rate = Number(s.rate) || 0
    const reg = Math.max(0, Math.min(h, threshold - worked))
    const over = h - reg
    worked += h
    regularHours += reg
    overtimeHours += over
    labor += reg * rate + over * rate * mult
    premium += over * rate * (mult - 1)
  }
  return { regularHours, overtimeHours, labor, overtimePremium: premium }
}
