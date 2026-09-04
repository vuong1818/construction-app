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
