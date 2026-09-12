// The owner's view on the phone: the five numbers stacked, then what needs
// a decision. Owners only. Same owner_board() RPC as the web page.
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Badge, Card, EmptyState, MoneyTile, WaitingRow } from '../components/ui'
import { useLanguage } from '../lib/i18n'
import { isOwner } from '../lib/roles'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

type Row = Record<string, any>
type Board = {
  terms_days: number
  cost_flag_pct: number
  owed_to_us: { total: number; overdue: number; rows: Row[] }
  owed_by_us: { total: number; overdue: number; payroll_week: number; payroll_hours: number; rows: Row[] }
  projects: Row[]
  bids: Row[]
  pnl: { month?: Row; ytd?: Row }
  decisions: Row[]
  people: Row
  subscription: Row
}

const money = (n: any) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtDate = (d: any) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')

export default function OwnerScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const [board, setBoard] = useState<Board | null>(null)
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [open, setOpen] = useState<'ar' | 'ap' | 'projects' | 'bids' | 'pnl' | null>(null)

  const load = useCallback(async () => {
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setAllowed(false); return }
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle()
    if (!isOwner(String(prof?.role))) { setAllowed(false); return }
    setAllowed(true)
    const { data, error: err } = await supabase.rpc('owner_board')
    if (err) { setError(err.message); return }
    setBoard(data as Board)
  }, [])

  useEffect(() => { load() }, [load])

  async function onRefresh() { setRefreshing(true); try { await load() } finally { setRefreshing(false) } }

  const header = (
    <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
      <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Ionicons name="arrow-back" size={18} color="#D9F6FB" />
        <Text style={{ color: '#D9F6FB' }}>{t('back')}</Text>
      </Pressable>
      <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800', marginBottom: 6 }}>{t('ownerView')}</Text>
      <Text style={{ color: '#D9F6FB', lineHeight: 20, fontSize: 13 }}>{t('ownerViewIntro')}</Text>
    </View>
  )

  if (allowed === false) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {header}
          <EmptyState icon="lock-outline" title={t('ownersOnly')} />
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (!board) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {header}
          {error ? (
            <EmptyState icon="alert-circle-outline" title={t('error')} hint={error} />
          ) : (
            <ActivityIndicator color={COLORS.navy} style={{ marginTop: 30 }} />
          )}
        </ScrollView>
      </SafeAreaView>
    )
  }

  const ar = board.owed_to_us, ap = board.owed_by_us
  const projects = board.projects || []
  const flagged = projects.filter(p => p.flags > 0)
  const bids = board.bids || []
  const bidsSoon = bids.filter(b => b.days_left != null && b.days_left <= 14)
  const m = board.pnl?.month || {}, y = board.pnl?.ytd || {}
  const decisions = board.decisions || []
  const toggle = (k: typeof open) => setOpen(o => (o === k ? null : k))

  const rowsCard = (title: string, rows: Row[], render: (r: Row) => { title: string; meta?: string; danger?: boolean; onPress?: () => void }, empty: string) => (
    <Card title={title}>
      {rows.length === 0 ? <Text style={{ color: COLORS.subtext }}>{empty}</Text> : rows.map((r, i) => {
        const x = render(r)
        return (
          <Pressable key={i} onPress={x.onPress} style={{ paddingVertical: 8, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: COLORS.border }}>
            <Text style={{ color: x.danger ? COLORS.red : COLORS.text, fontWeight: '700', fontSize: 15 }}>{x.title}</Text>
            {x.meta ? <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>{x.meta}</Text> : null}
          </Pressable>
        )
      })}
    </Card>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {header}

        {/* The five numbers, stacked. */}
        <View style={{ gap: 10, marginBottom: 14 }}>
          <MoneyTile label={t('owedToUs')} value={money(ar.total)} tone={ar.overdue > 0 ? 'danger' : undefined}
            sub={ar.overdue > 0 ? `${money(ar.overdue)} ${t('overdue')}` : `${ar.rows.length} ${t('open')}`} onPress={() => toggle('ar')} />
          <MoneyTile label={t('owedByUs')} value={money(ap.total)} tone={ap.overdue > 0 ? 'danger' : undefined}
            sub={ap.overdue > 0 ? `${money(ap.overdue)} ${t('overdue')}` : `${t('payrollThisWeek')}: ${money(ap.payroll_week)}`} onPress={() => toggle('ap')} />
          <MoneyTile label={t('projects')} value={String(projects.length)} tone={flagged.length > 0 ? 'warn' : 'ok'}
            sub={flagged.length > 0 ? `${flagged.length} ${t('withRedFlags')}` : t('noRedFlags')} onPress={() => toggle('projects')} />
          <MoneyTile label={t('bidsDue')} value={String(bidsSoon.length)} tone={bidsSoon.some(b => b.days_left < 0) ? 'danger' : bidsSoon.length > 0 ? 'warn' : undefined}
            sub={`${bids.length} ${t('bidding')}`} onPress={() => toggle('bids')} />
          <MoneyTile label={t('pnlThisMonth')} value={money(m.margin)} tone={(m.margin || 0) < 0 ? 'danger' : 'ok'}
            sub={`${t('yearToDate')} ${money(y.margin)}${y.margin_pct != null ? ` · ${y.margin_pct}%` : ''}`} onPress={() => toggle('pnl')} />
        </View>

        {open === 'ar' && rowsCard(t('owedToUs'), ar.rows, r => ({
          title: `${money(r.amount)} · ${r.customer}`,
          meta: `${r.project_name} · ${r.kind === 'tm' ? 'T&M' : 'Draw'} ${r.number ?? ''} · ${t('due')} ${fmtDate(r.due_date)}${r.overdue ? ` · ${t('overdue')}` : ''}`,
          danger: !!r.overdue,
          onPress: r.project_id ? () => router.push(`/project/${r.project_id}` as any) : undefined,
        }), t('nobodyOwesYou'))}

        {open === 'ap' && rowsCard(t('owedByUs'), ap.rows, r => ({
          title: `${money(r.amount)} · ${r.payee}`,
          meta: `${r.project_name || t('company')} · ${t('due')} ${fmtDate(r.due_date)}${r.overdue ? ` · ${t('overdue')}` : ''}`,
          danger: !!r.overdue,
          onPress: r.project_id ? () => router.push(`/project/${r.project_id}/expenses` as any) : undefined,
        }), t('nothingUnpaid'))}

        {open === 'projects' && (
          <Card title={t('projects')} subtitle={t('costFlagHint', { pct: board.cost_flag_pct })}>
            {projects.map((p, i) => (
              <Pressable key={p.id} onPress={() => router.push(`/project/${p.id}` as any)} style={{ paddingVertical: 8, borderBottomWidth: i < projects.length - 1 ? 1 : 0, borderBottomColor: COLORS.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15, flexShrink: 1 }}>{p.name}</Text>
                  {p.is_tm ? <Badge tone="neutral" label="T&M" /> : null}
                  {p.cost_flag ? <Badge tone="danger" label={t('cost')} /> : null}
                  {p.rfis_open > 0 ? <Badge tone="warn" label={`${p.rfis_open} RFI`} /> : null}
                  {p.inspections_bad > 0 ? <Badge tone="danger" label={`${p.inspections_bad} ${t('inspection')}`} /> : null}
                  {p.shifts_flagged > 0 ? <Badge tone="warn" label={`${p.shifts_flagged} ${t('shift')}`} /> : null}
                </View>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                  {[p.phase, p.is_tm ? `${t('billed')} ${money(p.billed)}` : `${t('contract')} ${money(p.contract)}`, `${t('cost')} ${money(p.cost)}${p.cost_pct != null ? ` (${p.cost_pct}%)` : ''}`, p.pct_complete != null ? `${p.pct_complete}% ${t('complete')}` : null].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>
            ))}
            {projects.length === 0 ? <Text style={{ color: COLORS.subtext }}>{t('noActiveProjects')}</Text> : null}
          </Card>
        )}

        {open === 'bids' && rowsCard(t('bidsDue'), bids, r => ({
          title: r.name,
          meta: r.bid_due_date
            ? `${t('due')} ${fmtDate(r.bid_due_date)} · ${r.days_left < 0 ? t('daysLate', { n: -r.days_left }) : r.days_left === 0 ? t('today') : t('daysLeft', { n: r.days_left })}${r.estimate_total != null ? ` · ${money(r.estimate_total)}` : ''}`
            : t('noBidDate'),
          danger: r.days_left != null && r.days_left < 0,
          onPress: () => router.push(`/project/${r.id}` as any),
        }), t('nothingBidding'))}

        {open === 'pnl' && (
          <Card title={t('companyPnl')}>
            {[{ k: t('thisMonth'), v: m }, { k: t('yearToDate'), v: y }].map(({ k, v }) => (
              <View key={k} style={{ marginBottom: 10 }}>
                <Text style={{ color: COLORS.navy, fontWeight: '800', marginBottom: 4 }}>{k}</Text>
                {[[t('billed'), v.billed], [t('collected'), v.collected], [t('jobCost'), v.cost], [t('overheads'), v.overheads]].map(([l, n]) => (
                  <View key={String(l)} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                    <Text style={{ color: COLORS.subtext }}>{l}</Text>
                    <Text style={{ color: COLORS.text, fontVariant: ['tabular-nums'] }}>{money(n)}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 2 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '800' }}>{t('margin')}</Text>
                  <Text style={{ color: (v.margin || 0) < 0 ? COLORS.red : COLORS.green, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{money(v.margin)}{v.margin_pct != null ? ` (${v.margin_pct}%)` : ''}</Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        <Card title={t('needsYourDecision')}>
          {decisions.length === 0 ? <Text style={{ color: COLORS.subtext }}>{t('nothingWaiting')}</Text> : (
            <View style={{ marginHorizontal: -16 }}>
              {decisions.map((d, i) => (
                <WaitingRow key={i} title={d.title} job={d.project_name || undefined} age={fmtDate(d.on_date)}
                  tone={d.kind === 'sub_compliance' || d.kind === 'estimate_expired' ? 'danger' : 'warn'}
                  onPress={() => router.push((d.kind === 'invite_pending' ? '/manager/workers' : d.project_id ? `/project/${d.project_id}` : '/projects') as any)} />
              ))}
            </View>
          )}
        </Card>

        <Card title={t('peopleAndAccess')}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {[[t('active'), board.people?.active], [t('invited'), board.people?.invited], [t('terminated'), board.people?.terminated]].map(([l, v]) => (
              <View key={String(l)} style={{ alignItems: 'center' }}>
                <Text style={{ color: COLORS.navy, fontWeight: '900', fontSize: 22 }}>{v ?? 0}</Text>
                <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '800' }}>{String(l).toUpperCase()}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card title={t('subscription')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Badge tone={board.subscription?.billing_exempt ? 'neutral' : board.subscription?.status === 'active' ? 'ok' : board.subscription?.status === 'trialing' ? 'warn' : 'danger'}
              label={board.subscription?.billing_exempt ? 'exempt' : String(board.subscription?.status || '—')} />
            {board.subscription?.current_period_end ? <Text style={{ color: COLORS.subtext, fontSize: 13 }}>{t('renews')} {fmtDate(board.subscription.current_period_end)}</Text> : null}
          </View>
          <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 6 }}>{t('manageOnWeb')}</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}
