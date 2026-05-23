// Compute the start date of the current work week using
// company_settings.work_week_start_day (0=Sun … 5=Fri … 6=Sat, default 5).
// Mirror of the SQL function public.work_week_start() — keep in sync.

import { supabase } from './supabase'

const DEFAULT_START_DAY = 5 // Friday

let cachedStartDay: number | null = null
let inflight: Promise<number> | null = null

export async function getWorkWeekStartDay(): Promise<number> {
  if (cachedStartDay != null) return cachedStartDay
  if (inflight) return inflight
  inflight = (async () => {
    const { data } = await supabase
      .from('company_settings')
      .select('work_week_start_day')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    cachedStartDay = Number.isInteger(data?.work_week_start_day) ? (data!.work_week_start_day as number) : DEFAULT_START_DAY
    inflight = null
    return cachedStartDay
  })()
  return inflight
}

export function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function workWeekStartDate(refDate: Date, startDay: number): Date {
  const d = new Date(refDate)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const back = (dow - startDay + 7) % 7
  d.setDate(d.getDate() - back)
  return d
}

export async function currentWorkWeekStart(refDate: Date = new Date()): Promise<Date> {
  const startDay = await getWorkWeekStartDay()
  return workWeekStartDate(refDate, startDay)
}

export async function currentWorkWeekBounds(refDate: Date = new Date()) {
  const start = await currentWorkWeekStart(refDate)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start, end, startStr: fmtLocalDate(start), endStr: fmtLocalDate(end) }
}
