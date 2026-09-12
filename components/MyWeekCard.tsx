// "My week" on the worker's Home: hours, overtime, out-of-state hours,
// mileage, receipts and the gross earned this work week — before taxes and
// deductions — computed by the same code as the office's payroll (my_week()).
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch'
import { t, type Language } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'
import { Badge, SectionTitle } from './ui'

type Shift = { id: number; project_name: string | null; in: string; out: string | null; hours: number; flagged: boolean; auto_closed: boolean; corrected_by: string | null; offsite: boolean }
type Week = {
  week_start: string; week_end: string; status: 'in_progress' | 'office_review' | 'paid'
  hours: number; ot_hours: number; oos_hours: number; miles: number; mileage: number; receipts: number; labor: number; gross: number
  flagged: number; shifts: Shift[]
}

const money = (n: any) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const day = (d: string) => new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function MyWeekCard({ language }: { language: Language }) {
  const router = useRouter()
  const [week, setWeek] = useState<Week | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('my_week')
      if (data) setWeek(data as Week)
    } catch { /* keep the last figures */ }
  }, [])
  useEffect(() => { load() }, [load])
  useRealtimeRefetch('time_entries', load)
  useRealtimeRefetch('travel_segments', load)

  if (!week) return null
  const flaggedShifts = week.shifts.filter(s => s.flagged || s.corrected_by || s.auto_closed)
  const statusLabel = week.status === 'paid' ? t(language, 'weekPaid') : week.status === 'office_review' ? t(language, 'weekOfficeReview') : t(language, 'weekInProgress')
  const statusTone = week.status === 'paid' ? 'ok' : week.status === 'office_review' ? 'info' : 'warn'

  const line = (label: string, value: string, strong = false) => (
    <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ color: strong ? COLORS.text : COLORS.subtext, fontSize: 14, fontWeight: strong ? '800' : '500' }}>{label}</Text>
      <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: strong ? '800' : '600', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  )

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle icon="calendar-week" title={t(language, 'myWeek')} />
        <View style={{ marginTop: 6 }}><Badge tone={statusTone as any} label={statusLabel} /></View>
      </View>
      <Pressable onPress={() => setOpen(o => !o)} style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border }}>
        <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>{day(week.week_start)} – {day(week.week_end)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>{t(language, 'grossThisWeek').toUpperCase()}</Text>
            <Text style={{ color: COLORS.navy, fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{money(week.gross)}</Text>
            <Text style={{ color: COLORS.muted, fontSize: 11 }}>{t(language, 'beforeTaxes')}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{week.hours.toFixed(1)} {t(language, 'hrs')}</Text>
            {week.ot_hours > 0 ? <Text style={{ color: COLORS.amber, fontSize: 12, fontWeight: '700' }}>{week.ot_hours.toFixed(1)} {t(language, 'overtimeShort')}</Text> : null}
            <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.muted} />
          </View>
        </View>

        {open && (
          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 6 }}>
            {line(t(language, 'regularHours'), `${(week.hours - week.ot_hours).toFixed(2)} h`)}
            {week.ot_hours > 0 ? line(t(language, 'overtimeHours'), `${week.ot_hours.toFixed(2)} h`) : null}
            {week.oos_hours > 0 ? line(t(language, 'outOfStateHours'), `${week.oos_hours.toFixed(2)} h`) : null}
            {line(t(language, 'wages'), money(week.labor))}
            {week.miles > 0 ? line(`${t(language, 'mileageLabel')} · ${week.miles.toFixed(1)} mi`, money(week.mileage)) : null}
            {week.receipts > 0 ? line(t(language, 'receipts'), money(week.receipts)) : null}
            {line(t(language, 'grossThisWeek'), money(week.gross), true)}

            {flaggedShifts.length > 0 && (
              <View style={{ marginTop: 8, backgroundColor: '#FFF8F0', borderRadius: 12, padding: 10 }}>
                <Text style={{ color: COLORS.amber, fontWeight: '800', fontSize: 13, marginBottom: 4 }}>{t(language, 'shiftsToKnowAbout')}</Text>
                {flaggedShifts.map(s => (
                  <Text key={s.id} style={{ color: COLORS.text, fontSize: 13, paddingVertical: 2 }}>
                    {day(s.in)} · {s.hours.toFixed(2)} h{s.project_name ? ` · ${s.project_name}` : ''}
                    {s.auto_closed ? ` — ${t(language, 'shiftAutoClosed')}` : s.corrected_by ? ` — ${t(language, 'shiftCorrectedBy', { name: s.corrected_by })}` : s.flagged ? ` — ${t(language, 'shiftFlagged')}` : ''}
                  </Text>
                ))}
              </View>
            )}
            <Pressable onPress={() => router.push('/timesheet' as any)} style={{ marginTop: 8 }}>
              <Text style={{ color: COLORS.teal, fontWeight: '700', fontSize: 13 }}>{t(language, 'seeAllShifts')}</Text>
            </Pressable>
          </View>
        )}
      </Pressable>
    </View>
  )
}
