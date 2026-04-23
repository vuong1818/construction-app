import { supabase } from '../lib/supabase'

export type CreateDailyReportInput = {
  projectId: number
  reportDate: string
  workCompleted: string
  issues: string
  materialsUsed: string
  weather: string
}

async function requireSessionUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    throw new Error('You must be signed in.')
  }

  return session.user
}

export function validateReportInput(input: CreateDailyReportInput) {
  if (!input.projectId || Number.isNaN(input.projectId)) {
    throw new Error('Invalid project.')
  }

  if (!input.reportDate.trim()) {
    throw new Error('Report date is required.')
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate.trim())) {
    throw new Error('Report date must be in YYYY-MM-DD format.')
  }

  if (!input.workCompleted.trim()) {
    throw new Error('Work completed is required.')
  }

  if (input.workCompleted.trim().length > 4000) {
    throw new Error('Work completed is too long.')
  }

  if (input.issues.trim().length > 4000) {
    throw new Error('Issues / Delays is too long.')
  }

  if (input.materialsUsed.trim().length > 4000) {
    throw new Error('Materials Used is too long.')
  }

  if (input.weather.trim().length > 1000) {
    throw new Error('Weather is too long.')
  }
}

export async function getCurrentUserFullName(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data?.full_name || null
}

export async function createDailyReport(input: CreateDailyReportInput) {
  validateReportInput(input)

  const user = await requireSessionUser()
  const fullName = await getCurrentUserFullName(user.id)

  const payload = {
    project_id: input.projectId,
    report_date: input.reportDate.trim(),
    created_by: user.id,
    created_by_name: fullName,
    work_completed: input.workCompleted.trim(),
    issues: input.issues.trim() || null,
    materials_used: input.materialsUsed.trim() || null,
    weather: input.weather.trim() || null,
  }

  const { data, error } = await supabase
    .from('daily_reports')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}