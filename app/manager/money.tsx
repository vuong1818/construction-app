// The money board on the phone: the strip, what is waiting to be sent,
// what is waiting to be paid, payroll this week, what is expiring. Same
// money_board() RPC as the web page. Finance roles only.
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Badge, Card, EmptyState, MoneyTile, WaitingRow } from '../../components/ui'
import { useRealtimeRefetch } from '../../hooks/useRealtimeRefetch'
import { useLanguage } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'

type Row = Record<string, any>
const money = (n: any) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtDate = (d: any) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')

export default function MoneyScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const [board, setBoard] = useState<Row | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setError('')
    const { data, error: err } = await supabase.rpc('money_board')
    if (err) { setError(err.message); return }
    setBoard(data as Row)
  }, [])
  useEffect(() => { load() }, [load])
  useRealtimeRefetch('project_expenses', load)
  useRealtimeRefetch('purchase_orders', load)

  async function onRefresh() { setRefreshing(true); try { await load() } finally { setRefreshing(false) } }

  const header = (
    <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
      <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Ionicons name="arrow-back" size={18} color="#D9F6FB" />
        <Text style={{ color: '#D9F6FB' }}>{t('back')}</Text>
      </Pressable>
      <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800', marginBottom: 6 }}>{t('moneyBoard')}</Text>
      <Text style={{ color: '#D9F6FB', lineHeight: 20, fontSize: 13 }}>{t('moneyBoardIntro')}</Text>
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
  const toPay: Row[] = board.to_pay || []
  const toSend: Row[] = board.to_send || []
  const payroll: Row[] = board.payroll?.rows || []
  const expiring: Row[] = board.expiring || []
  const cash = (s.cash_in_month || 0) - (s.cash_out_month || 0)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {header}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <MoneyTile label={t('owedToUs')} value={money(s.owed_to_us)} tone={s.owed_to_us_overdue > 0 ? 'danger' : undefined} sub={s.owed_to_us_overdue > 0 ? `${money(s.owed_to_us_overdue)} ${t('overdue')}` : undefined} onPress={() => router.push('/manager/finance' as any)} />
          <MoneyTile label={t('owedByUs')} value={money(s.owed_by_us)} tone={s.owed_by_us_overdue > 0 ? 'danger' : undefined} sub={s.owed_by_us_overdue > 0 ? `${money(s.owed_by_us_overdue)} ${t('overdue')}` : undefined} />
          <MoneyTile label={t('cashThisMonth')} value={money(cash)} tone={cash < 0 ? 'warn' : 'ok'} sub={`${t('in')} ${money(s.cash_in_month)} · ${t('out')} ${money(s.cash_out_month)}`} />
          <MoneyTile label={t('payrollThisWeek')} value={money(s.payroll_labor)} tone={s.payroll_flagged > 0 ? 'danger' : undefined} sub={`${s.payroll_hours ?? 0} ${t('hrs')} · ${s.payroll_people ?? 0} ${t('people')}${s.payroll_flagged > 0 ? ` · ${s.payroll_flagged} ${t('flaggedShifts')}` : ''}`} onPress={() => router.push('/manager/time-clock' as any)} />
        </View>

        <Card title={t('toSend')} subtitle={toSend.length > 0 ? `${toSend.length}` : undefined}>
          {toSend.length === 0 ? <Text style={{ color: COLORS.subtext }}>{t('nothingToSend')}</Text> : (
            <View style={{ marginHorizontal: -16 }}>
              {toSend.map(x => (
                <WaitingRow key={`${x.kind}:${x.id}`} title={x.title} job={x.project_name || undefined} age={fmtDate(x.on_date)} tone={x.kind === 'pay_app' ? 'ok' : 'warn'}
                  onPress={() => router.push((x.project_id ? `/project/${x.project_id}` : '/projects') as any)} />
              ))}
            </View>
          )}
          <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 8 }}>{t('sendFromWeb')}</Text>
        </Card>

        <Card title={t('toPay')} subtitle={toPay.length > 0 ? `${toPay.length}` : undefined}>
          {toPay.length === 0 ? <Text style={{ color: COLORS.subtext }}>{t('nothingUnpaid')}</Text> : toPay.slice(0, 25).map((r, i) => (
            <Pressable key={`${r.kind}:${r.id}`} onPress={() => r.project_id ? router.push(`/project/${r.project_id}/expenses` as any) : undefined} style={{ paddingVertical: 8, borderBottomWidth: i < Math.min(toPay.length, 25) - 1 ? 1 : 0, borderBottomColor: COLORS.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15, flex: 1 }}>{r.payee}</Text>
                <Text style={{ color: r.overdue ? COLORS.red : COLORS.text, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{money(r.amount)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                <Text style={{ color: r.overdue ? COLORS.red : COLORS.muted, fontSize: 12 }}>{r.project_name || t('company')} · {t('due')} {fmtDate(r.due_date)}{r.overdue ? ` · ${t('overdue')}` : ''}</Text>
                {r.compliance ? <Badge tone="danger" label={r.compliance} /> : null}
              </View>
            </Pressable>
          ))}
        </Card>

        <Card title={t('payrollThisWeek')} subtitle={`${t('workWeek')}: ${fmtDate(board.week_start)}`}>
          {payroll.length === 0 ? <Text style={{ color: COLORS.subtext }}>{t('noHoursYet')}</Text> : payroll.map((r, i) => (
            <View key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: i < payroll.length - 1 ? 1 : 0, borderBottomColor: COLORS.border, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>{r.name}</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12 }}>{r.hours} {t('hrs')}{r.ot_hours > 0 ? ` · ${r.ot_hours} ${t('overtimeShort')}` : ''}{r.miles > 0 ? ` · ${r.miles} mi` : ''}{r.receipts > 0 ? ` · ${money(r.receipts)} ${t('receipts').toLowerCase()}` : ''}</Text>
              </View>
              {r.flagged > 0 ? <Badge tone="danger" label={String(r.flagged)} /> : null}
              {r.open_now ? <Badge tone="ok" label={t('onTheClock')} /> : null}
              <Text style={{ color: COLORS.text, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{money(r.gross)}</Text>
            </View>
          ))}
          <Pressable onPress={() => router.push('/manager/time-clock' as any)} style={{ marginTop: 8 }}>
            <Text style={{ color: COLORS.teal, fontWeight: '700', fontSize: 13 }}>{t('reviewPayroll')}</Text>
          </Pressable>
        </Card>

        <Card title={t('expiringSoon')}>
          {expiring.length === 0 ? <Text style={{ color: COLORS.subtext }}>{t('nothingExpiring')}</Text> : (
            <View style={{ marginHorizontal: -16 }}>
              {expiring.map(e => (
                <WaitingRow key={`${e.kind}:${e.id}`} title={e.title} age={e.days_left < 0 ? t('expiredDaysAgo', { n: -e.days_left }) : e.days_left === 0 ? t('expiresToday') : t('daysLeft', { n: e.days_left })} tone={e.days_left <= 0 ? 'danger' : 'warn'} />
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}
