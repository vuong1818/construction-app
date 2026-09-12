// Roles, in one place. Mirrors lib/roles.js on the web — keep in sync.
//
//   owner · general_manager · project_manager · office_manager · supervisor
//   worker · warehouse · contractor · contractor_manager
//
// "manager" and "office" were the names before 2026-09-12; the database
// migrated every row, and these accept the old names so a phone that has not
// reloaded keeps working. There is no customer login any more.

export const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  general_manager: 'General Manager',
  project_manager: 'Project Manager',
  office_manager: 'Office Manager',
  supervisor: 'Supervisor',
  worker: 'Worker',
  warehouse: 'Warehouse',
  contractor: 'Contractor',
  contractor_manager: 'Contractor Manager',
  manager: 'General Manager',
  office: 'Office Manager',
}
export const roleLabel = (r?: string | null): string => (r && ROLE_LABEL[r]) || (r ? r.replace(/_/g, ' ') : '—')

const MANAGER_ROLES = ['owner', 'general_manager', 'project_manager', 'office_manager', 'manager', 'office']
const FINANCE_ROLES = ['owner', 'general_manager', 'office_manager', 'manager', 'office']
const SCOPE_ROLES   = ['owner', 'general_manager', 'project_manager', 'manager']

/** Office staff: owner or any of the three managers. */
export const isManagerRole    = (r?: string | null): boolean => !!r && MANAGER_ROLES.includes(r)
export const isOwner          = (r?: string | null): boolean => r === 'owner'
export const isGeneralManager = (r?: string | null): boolean => r === 'general_manager' || r === 'manager'
export const isProjectManager = (r?: string | null): boolean => r === 'project_manager'
export const isOfficeManager  = (r?: string | null): boolean => r === 'office_manager' || r === 'office'
export const isSupervisorPlus = (r?: string | null): boolean => isManagerRole(r) || r === 'supervisor'
/** Money: payroll, wages, billing, payments. */
export const canFinance       = (r?: string | null): boolean => !!r && FINANCE_ROLES.includes(r)
export const canSeeWages      = canFinance
/** Scope: kits, estimates, schedule. */
export const canEditScope     = (r?: string | null): boolean => !!r && SCOPE_ROLES.includes(r)
/** Inventory and tools. */
export const canStock         = (r?: string | null): boolean => isManagerRole(r) || r === 'warehouse'
