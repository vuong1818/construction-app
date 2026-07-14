// Shared role → capability helpers (client-side gating). Supabase RLS is the real
// security boundary; these mirror it so the UI shows the right things. Kept in sync
// with the web portal's lib/roles.js.
//
// Roles: owner, manager, office, worker, warehouse, supervisor, contractor, customer.
// Owner always outranks manager and must have every manager access.

export const isManagerRole = (r?: string | null): boolean => r === 'owner' || r === 'manager'
export const isOwner       = (r?: string | null): boolean => r === 'owner'
// Manager dashboard / crew visibility also allows supervisor.
export const isSupervisorPlus = (r?: string | null): boolean => isManagerRole(r) || r === 'supervisor'
export const canStock      = (r?: string | null): boolean => r === 'owner' || r === 'manager' || r === 'warehouse'
export const canFinance    = (r?: string | null): boolean => r === 'owner' || r === 'manager' || r === 'office'
