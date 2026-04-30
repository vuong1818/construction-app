// Mirrors web E:\Websites\GitHub\nguyenmep-website\lib\financeConstants.js for
// the project-expense type list. Keep these in sync — the DB constraint pins
// the values.

export type ProjectExpenseType =
  | 'materials'
  | 'labor'
  | 'equipment_rental'
  | 'permits_and_fees'
  | 'fuel'
  | 'subcontractor'
  | 'travel'
  | 'entertainment_meals'
  | 'auto_maintenance'
  | 'other'

export const PROJECT_EXPENSE_TYPES: { value: ProjectExpenseType; label: string }[] = [
  { value: 'materials',          label: 'Materials' },
  { value: 'labor',              label: 'Labor' },
  { value: 'equipment_rental',   label: 'Equipment Rental' },
  { value: 'permits_and_fees',   label: 'Permits & Fees' },
  { value: 'fuel',               label: 'Fuel' },
  { value: 'subcontractor',      label: 'Subcontractor' },
  { value: 'travel',             label: 'Travel' },
  { value: 'entertainment_meals',label: 'Entertainment / Meals' },
  { value: 'auto_maintenance',   label: 'Auto Maintenance' },
  { value: 'other',              label: 'Other' },
]

export function projectExpenseTypeLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return PROJECT_EXPENSE_TYPES.find(t => t.value === value)?.label || value
}
