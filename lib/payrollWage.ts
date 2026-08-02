/**
 * Wage rules, kept in step with the web portal's lib/payrollWage.js.
 *
 * A worker can carry a second rate (oos_wage) that applies only on projects
 * outside the company's home state. Any screen that shows labor dollars has to
 * apply it — a phone that pays the flat rate and a web portal that pays the
 * out-of-state rate hand the same worker two different checks.
 */

export type WageProfile = { wage: number | null; oos_wage?: number | null }

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
