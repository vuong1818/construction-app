export function getWorkWeekRange(baseDate = new Date()) {
  const now = new Date(baseDate)
  const currentDay = now.getDay()
  const daysSinceFriday = (currentDay - 5 + 7) % 7

  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - daysSinceFriday)
  weekStart.setHours(0, 0, 0, 0)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  return { weekStart, weekEnd }
}

export function getTodayRange(baseDate = new Date()) {
  const start = new Date(baseDate)
  start.setHours(0, 0, 0, 0)

  const end = new Date(baseDate)
  end.setHours(23, 59, 59, 999)

  return { start, end }
}

export function calculateHours(
  clockInTime: string | null,
  clockOutTime: string | null
) {
  if (!clockInTime) return 0

  const start = new Date(clockInTime).getTime()
  const end = clockOutTime ? new Date(clockOutTime).getTime() : Date.now()
  const diffMs = end - start
  const diffHours = diffMs / (1000 * 60 * 60)

  return diffHours > 0 ? diffHours : 0
}

export function formatHours(hours: number) {
  return hours.toFixed(2)
}

export function formatTimeOnly(value: string | null) {
  if (!value) return '—'

  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}