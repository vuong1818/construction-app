// Every column of public.profiles EXCEPT wage and oos_wage.
//
// Since 2026-10-31 the two pay columns are not selectable by signed-in users
// (column privilege, web migration 20261031000001), so `select('*')` on
// profiles fails with "permission denied". Name the columns with this list and
// read pay through the RPCs: my_pay_rate() for yourself, pay_rates() for the
// company (owners / general managers / office managers only).
export const PROFILE_COLS =
  'id, created_at, role, first_name, last_name, phone, email, street, city, state, zip, status, ' +
  'hire_date, terminate_date, wage_effective_date, full_name, pay_type, address, org_id, ' +
  'home_state, home_zip, subcontractor_id, owner_id, gc_id, employment_type'

export type PayRate = { id: string; wage: number | null; oos_wage: number | null }
