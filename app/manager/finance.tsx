import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRealtimeRefetch } from '../../hooks/useRealtimeRefetch'
import { useLanguage } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'

type Project = { id: number; name: string; status: string | null; contract_amount: number | null }
type ChangeOrder = { id: number; project_id: number; amount: number }
type Expense = { id: number; project_id: number; amount: number; is_paid: boolean | null; payment_method: string | null }
type PayApp = { id: number; project_id: number; retainage_pct: number | null; amount_paid: number | null }
type PayAppLine = { pay_app_id: number; from_previous: number; this_period: number; materials_stored: number }

function fmtMoney(n: number): string {
  return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function ManagerFinanceScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [payApps, setPayApps] = useState<PayApp[]>([])
  const [payAppLines, setPayAppLines] = useState<PayAppLine[]>([])

  const load = useCallback(async () => {
    setErrorMessage('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { setErrorMessage(t('signInRequired')); setLoading(false); return }

    const { data: me } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    if (me?.role !== 'manager') { setErrorMessage(t('managerAccessRequired')); setLoading(false); return }

    const [{ data: pr }, { data: co }, { data: ex }, { data: ap }] = await Promise.all([
      supabase.from('projects').select('id, name, status, contract_amount').order('name'),
      supabase.from('project_change_orders').select('id, project_id, amount'),
      supabase.from('project_expenses').select('id, project_id, amount, is_paid, payment_method'),
      supabase.from('project_pay_apps').select('id, project_id, retainage_pct, amount_paid'),
    ])
    setProjects((pr as Project[]) || [])
    setChangeOrders((co as ChangeOrder[]) || [])
    setExpenses((ex as Expense[]) || [])
    setPayApps((ap as PayApp[]) || [])

    const ids = (ap || []).map(a => a.id)
    if (ids.length > 0) {
      const { data: lns } = await supabase
        .from('project_pay_app_lines')
        .select('pay_app_id, from_previous, this_period, materials_stored')
        .in('pay_app_id', ids)
      setPayAppLines((lns as PayAppLine[]) || [])
    } else {
      setPayAppLines([])
    }

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch('project_change_orders', load, undefined, !loading)
  useRealtimeRefetch('project_expenses',      load, undefined, !loading)
  useRealtimeRefetch('project_pay_apps',      load, undefined, !loading)
  useRealtimeRefetch('projects',              load, undefined, !loading)

  // Per-app billed (sum of D+E+F) and outstanding (netBilled - amount_paid)
  const completedByApp = new Map<number, number>()
  payAppLines.forEach(l => {
    const v = (Number(l.from_previous) || 0) + (Number(l.this_period) || 0) + (Number(l.materials_stored) || 0)
    completedByApp.set(l.pay_app_id, (completedByApp.get(l.pay_app_id) || 0) + v)
  })

  const billedByProject = new Map<number, number>()
  const arByProject     = new Map<number, number>()
  payApps.forEach(a => {
    const completed = completedByApp.get(a.id) || 0
    const netBilled = completed * (1 - (Number(a.retainage_pct) || 0) / 100)
    const outstanding = Math.max(0, netBilled - (Number(a.amount_paid) || 0))
    billedByProject.set(a.project_id, (billedByProject.get(a.project_id) || 0) + completed)
    arByProject.set(a.project_id,     (arByProject.get(a.project_id)     || 0) + outstanding)
  })

  const payAppCountByProject = payApps.reduce<Record<number, number>>((acc, a) => {
    acc[a.project_id] = (acc[a.project_id] || 0) + 1
    return acc
  }, {})

  function isExpUnpaid(e: Expense): boolean {
    return e.is_paid === false || e.payment_method === 'account_payable'
  }

  const rows = projects.map(p => {
    const base = Number(p.contract_amount) || 0
    const co   = changeOrders.filter(c => c.project_id === p.id).reduce((s, c) => s + (Number(c.amount) || 0), 0)
    const projExps = expenses.filter(e => e.project_id === p.id)
    const exp  = projExps.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const ap   = projExps.filter(isExpUnpaid).reduce((s, e) => s + (Number(e.amount) || 0), 0)
    return {
      project: p,
      contract: base,
      changeOrders: co,
      totalContract: base + co,
      expenses: exp,
      net: base + co - exp,
      payAppCount: payAppCountByProject[p.id] || 0,
      billedToDate: billedByProject.get(p.id) || 0,
      accountsReceivable: arByProject.get(p.id) || 0,
      accountsPayable: ap,
    }
  })

  const totals = rows.reduce(
    (acc, r) => {
      acc.contract += r.contract
      acc.changeOrders += r.changeOrders
      acc.totalContract += r.totalContract
      acc.expenses += r.expenses
      acc.net += r.net
      acc.accountsReceivable += r.accountsReceivable
      acc.accountsPayable    += r.accountsPayable
      return acc
    },
    { contract: 0, changeOrders: 0, totalContract: 0, expenses: 0, net: 0, accountsReceivable: 0, accountsPayable: 0 },
  )

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.teal} />
      </SafeAreaView>
    )
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, padding: 20 }}>
        <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '700' }}>{errorMessage}</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16, backgroundColor: COLORS.navySoft, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 }}>
          <Text style={{ color: COLORS.navy, fontWeight: '700' }}>{t('back')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false) }} />}
      >
        <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
          <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="chevron-back" size={18} color="#D9F6FB" />
            <Text style={{ color: '#D9F6FB' }}>{t('back')}</Text>
          </Pressable>
          <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800', marginBottom: 6 }}>{t('finance')}</Text>
          <Text style={{ color: '#D9F6FB', lineHeight: 20, fontSize: 13 }}>
            {t('managerFinanceIntro')}
          </Text>
        </View>

        {/* Top totals */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <Tile label={t('contract')}       value={fmtMoney(totals.contract)}      bg={COLORS.blueSoft}   color={COLORS.blue} />
          <Tile label={t('changeOrders')}   value={fmtMoney(totals.changeOrders)}  bg={COLORS.orangeSoft} color={COLORS.orange} />
          <Tile label={t('totalContract')}  value={fmtMoney(totals.totalContract)} bg={COLORS.greenSoft}  color={COLORS.green} />
          <Tile label={t('expenses')}       value={fmtMoney(totals.expenses)}      bg={COLORS.redSoft}    color={COLORS.red} />
          <Tile label={t('arShort')}        value={fmtMoney(totals.accountsReceivable)} bg={COLORS.orangeSoft} color={COLORS.orange} />
          <Tile label={t('apShort')}        value={fmtMoney(totals.accountsPayable)}    bg={COLORS.redSoft}    color={COLORS.red} />
          <Tile label={t('net')}            value={fmtMoney(totals.net)}           bg={totals.net >= 0 ? COLORS.greenSoft : COLORS.redSoft} color={totals.net >= 0 ? COLORS.green : COLORS.red} />
        </View>

        {rows.length === 0 ? (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, padding: 24, alignItems: 'center' }}>
            <Text style={{ color: COLORS.subtext }}>{t('noProjectsYet')}</Text>
          </View>
        ) : (
          rows.map(r => (
            <Pressable
              key={r.project.id}
              onPress={() => router.push(`/project/${r.project.id}`)}
              style={{
                backgroundColor: COLORS.card,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: COLORS.border,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <Text style={{ color: COLORS.navy, fontSize: 17, fontWeight: '800' }}>{r.project.name}</Text>
                {r.project.status === 'completed' && (
                  <View style={{ backgroundColor: COLORS.greenSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 }}>
                    <Text style={{ color: COLORS.green, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 }}>{t('completedBadge')}</Text>
                  </View>
                )}
                <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.subtext} style={{ marginLeft: 'auto' }} />
              </View>

              <Row label={t('contract')}       value={fmtMoney(r.contract)}      color={COLORS.blue} />
              <Row label={t('changeOrders')}   value={fmtMoney(r.changeOrders)}  color={COLORS.orange} />
              <Row label={t('totalContract')}  value={fmtMoney(r.totalContract)} color={COLORS.green} bold />
              <Row label={t('expenses')}       value={fmtMoney(r.expenses)}      color={COLORS.red} />
              <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 6 }} />
              <Row label={t('net')} value={fmtMoney(r.net)} color={r.net >= 0 ? COLORS.green : COLORS.red} bold />
              {r.payAppCount > 0 && (
                <Row label={t('payAppsBilledShort', { count: r.payAppCount })} value={fmtMoney(r.billedToDate)} color={COLORS.blue} />
              )}
              {r.accountsReceivable > 0 && (
                <Row label={t('arOutstanding')} value={fmtMoney(r.accountsReceivable)} color={COLORS.orange} />
              )}
              {r.accountsPayable > 0 && (
                <Row label={t('apUnpaidBills')} value={fmtMoney(r.accountsPayable)} color={COLORS.red} />
              )}
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function Tile({ label, value, bg, color }: { label: string; value: string; bg: string; color: string }) {
  return (
    <View style={{ flexBasis: '31%', flexGrow: 1, backgroundColor: bg, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Text style={{ color, fontSize: 15, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color, fontSize: 9, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 }}>{label.toUpperCase()}</Text>
    </View>
  )
}

function Row({ label, value, color, bold = false }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 }}>
      <Text style={{ color: COLORS.subtext, fontSize: 13, fontWeight: bold ? '700' : '500' }}>{label}</Text>
      <Text style={{ color, fontSize: 14, fontWeight: bold ? '900' : '700' }}>{value}</Text>
    </View>
  )
}
