// The today board on the phone: who is where, what is happening today,
// what is waiting on you, one row per job. Same today_board() RPC as the
// web dashboard; a supervisor sees only the jobs they supervise.
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { InboxCard } from '../../components/InboxCard'
import { Badge, Card, EmptyState, MoneyTile, WaitingRow } from '../../components/ui'
import { useRealtimeRefetch } from '../../hooks/useRealtimeRefetch'
import { useLanguage } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'
import { getWorkWeekStartDay, workWeekStartDate } from '../../lib/workWeek'

type Row = Record<string, any>
const money = (n: any) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const timeOf = (ts: string) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const ageOf = (d: string) => {
  const days = Math.floor((Date.now() - new Date(d.slice(0, 10) + 'T12:00:00').getTime()) / 86400000)
  return days <= 0 ? 'today' : days === 1 ? '1 day' : days < 14 ? `${days} days` : `${Math.floor(days / 7)} weeks`
}

function waitingRoute(w: Row): string {
  const p = w.project_id ? `/project/${w.project_id}` : '/projects'
  switch (w.kind) {
    case 'rfi': return `${p}/rfis`
    case 'request': return `${p}/material-requests`
    case 'shift': return '/manager/time-clock'
    case 'inspection': return `${p}/inspections`
    case 'invite': return '/manager/workers'
    case 'time_off': return '/manager/time-clock'
    default: return p
  }
}

export default function TodayScreen() {
  const router = useRouter()
  const { t, language } = useLanguage()
  const [board, setBoard] = useState<Row | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [weekStart, setWeekStart] = useState<Date>(() => workWeekStartDate(new Date(), 5))

  const load = useCallback(async () => {
    setError('')
    const { data, error: err } = await supabase.rpc('today_board')
    if (err) { setError(err.message); return }
    setBoard(data as Row)
  }, [])
  useEffect(() => { load(); getWorkWeekStartDay().then(d => setWeekStart(workWeekStartDate(new Date(), d))).catch(() => {}) }, [load])
  useRealtimeRefetch('time_entries', load)
  useRealtimeRefetch('rfis', load)
  useRealtimeRefetch('material_requests', load)

  async function onRefresh() { setRefreshing(true); try { await load() } finally { setRefreshing(false) } }

  const header = (
    <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
      <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Ionicons name="arrow-back" size={18} color="#D9F6FB" />
        <Text style={{ color: '#D9F6FB' }}>{t('back')}</Text>
      </Pressable>
      <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800', marginBottom: 6 }}>{t('todayBoard')}</Text>
      <Text style={{ color: '#D9F6FB', lineHeight: 20, fontSize: 13 }}>{board?.scoped ? t('todayBoardIntroScoped') : t('todayBoardIntro')}</Text>
    </View>
  )

  if (!board) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {header}
          {error ? <EmptyState icon="alert-circle-outline" title={t('error')} hint={error} /> : <ActivityIndicator color={COLORS.navy} style={{ marginTop: 30 }} />}
        </ScrollView>
      </SafeAreaView>
    )
  }

  const s = board.strip || {}
  const td = board.today || {}
  const pay = td.payroll || {}
  const waiting: Row[] = board.waiting || []
  const projects: Row[] = board.projects || []
  const canMoney = !!board.can_finance
  const m = board.money

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {header}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <MoneyTile label={t('onTheClockNow')} value={String((s.clocked_in || []).length)} tone={(s.clocked_in || []).length > 0 ? 'ok' : undefined}
            sub={(s.on_the_way || []).length > 0 ? `${s.on_the_way.length} ${t('onTheWay')}` : undefined} onPress={() => router.push('/manager/crew-status' as any)} />
          <MoneyTile label={t('hoursThisWeek')} value={String(s.hours_this_week ?? 0)} sub={`${t('lastWeek')} ${s.hours_last_week ?? 0}`} />
          {canMoney && m ? (
            <>
              <MoneyTile label={t('owedToUs')} value={money(m.owed_to_us)} tone={m.owed_to_us_overdue > 0 ? 'danger' : undefined} sub={m.owed_to_us_overdue > 0 ? `${money(m.owed_to_us_overdue)} ${t('overdue')}` : undefined} onPress={() => router.push('/manager/money' as any)} />
              <MoneyTile label={t('owedByUs')} value={money(m.owed_by_us)} tone={m.owed_by_us_overdue > 0 ? 'danger' : undefined} sub={m.owed_by_us_overdue > 0 ? `${money(m.owed_by_us_overdue)} ${t('overdue')}` : undefined} onPress={() => router.push('/manager/money' as any)} />
            </>
          ) : null}
        </View>

        <Card title={t('whoIsWhere')}>
          {(s.clocked_in || []).length === 0 && (s.on_the_way || []).length === 0 ? (
            <Text style={{ color: COLORS.subtext }}>{t('nobodyOnTheClock')}</Text>
          ) : (
            <>
              {(s.clocked_in || []).map((c: Row) => (
                <Text key={`c${c.id}`} style={{ color: COLORS.text, fontSize: 14, paddingVertical: 2 }}>
                  <Text style={{ color: COLORS.green }}>● </Text>{c.name} <Text style={{ color: COLORS.muted }}>· {c.project_name || '—'} · {timeOf(c.since)}</Text>
                </Text>
              ))}
              {(s.on_the_way || []).map((c: Row) => (
                <Text key={`w${c.id}`} style={{ color: COLORS.text, fontSize: 14, paddingVertical: 2 }}>
                  <Text style={{ color: COLORS.amber }}>➜ </Text>{c.name} <Text style={{ color: COLORS.muted }}>· {t('onTheWay')}{c.project_name ? ` · ${c.project_name}` : ''} · {timeOf(c.since)}</Text>
                </Text>
              ))}
            </>
          )}
        </Card>

        <Card title={t('todayAcrossJobs')}>
          {(td.bars || []).map((b: Row) => (
            <Pressable key={`b${b.id}`} onPress={() => router.push(`/project/${b.project_id}/tasks` as any)} style={{ paddingVertical: 4 }}>
              <Text style={{ color: COLORS.text, fontSize: 14 }}><Text style={{ fontWeight: '800', color: b.what.startsWith('starts') ? COLORS.green : COLORS.amber }}>{b.what}</Text> · {b.title} <Text style={{ color: COLORS.muted }}>· {b.project_name}{b.who ? ` · ${b.who}` : ''}</Text></Text>
            </Pressable>
          ))}
          {(td.inspections || []).map((i: Row) => (
            <Pressable key={`i${i.id}`} onPress={() => router.push(`/project/${i.project_id}/inspections` as any)} style={{ paddingVertical: 4 }}>
              <Text style={{ color: COLORS.text, fontSize: 14 }}><Text style={{ fontWeight: '800', color: COLORS.navy }}>{t('inspection')}</Text> · {i.title} <Text style={{ color: COLORS.muted }}>· {i.project_name} · {i.date}</Text></Text>
            </Pressable>
          ))}
          {(td.bids || []).map((b: Row) => (
            <Pressable key={`bid${b.id}`} onPress={() => router.push(`/project/${b.id}` as any)} style={{ paddingVertical: 4 }}>
              <Text style={{ color: b.days_left < 0 ? COLORS.red : COLORS.text, fontSize: 14 }}><Text style={{ fontWeight: '800' }}>{t('bidDue')}</Text> · {b.name} <Text style={{ color: COLORS.muted }}>· {b.days_left < 0 ? t('daysLate', { n: -b.days_left }) : b.days_left === 0 ? t('today') : t('daysLeft', { n: b.days_left })}</Text></Text>
            </Pressable>
          ))}
          {(td.bars || []).length + (td.inspections || []).length + (td.bids || []).length === 0 ? <Text style={{ color: COLORS.subtext }}>{t('nothingScheduledToday')}</Text> : null}
          <Text style={{ color: pay.flagged > 0 ? COLORS.red : COLORS.muted, fontSize: 13, marginTop: 8 }}>
            {t('payrollThisWeek')}: {pay.hours ?? 0} {t('hrs')}{pay.ot_hours > 0 ? ` · ${pay.ot_hours} ${t('overtimeShort')}` : ''}{pay.flagged > 0 ? ` · ${pay.flagged} ${t('flaggedShifts')}` : ''}
          </Text>
        </Card>

        <Card title={t('waitingOnYou')} subtitle={waiting.length > 0 ? `${waiting.length}` : undefined}>
          {waiting.length === 0 ? <Text style={{ color: COLORS.subtext }}>{t('nothingWaiting')}</Text> : (
            <View style={{ marginHorizontal: -16 }}>
              {waiting.slice(0, 20).map((w, i) => (
                <WaitingRow key={`${w.kind}:${w.id ?? i}`} title={w.title} job={w.project_name || undefined} age={ageOf(w.on_date)} tone={w.tone} onPress={() => router.push(waitingRoute(w) as any)} />
              ))}
            </View>
          )}
        </Card>

        <InboxCard language={language} weekStart={weekStart} />

        <Card title={t('projects')}>
          {projects.length === 0 ? <Text style={{ color: COLORS.subtext }}>{t('noActiveProjects')}</Text> : projects.map((p, i) => (
            <Pressable key={p.id} onPress={() => router.push(`/project/${p.id}` as any)} style={{ paddingVertical: 8, borderBottomWidth: i < projects.length - 1 ? 1 : 0, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>{p.name}</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                  {[p.phase, p.pct_complete != null ? `${p.pct_complete}% ${t('complete')}` : null, canMoney && p.cost_pct != null ? `${t('cost')} ${p.cost_pct}%` : null].filter(Boolean).join(' · ') || '—'}
                </Text>
              </View>
              {p.cost_flag ? <Badge tone="danger" label={t('cost')} /> : null}
              {p.flags > 0 && !p.cost_flag ? <Badge tone="warn" label={String(p.flags)} /> : null}
              <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.muted} />
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}
