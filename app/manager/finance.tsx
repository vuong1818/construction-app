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
import { supabase } from '../../lib/supabase'

const COLORS = {
  background: '#D6E8FF',
  card: '#FFFFFF',
  navy: '#16356B',
  navySoft: '#EAF0F8',
  teal: '#19B6D2',
  tealSoft: '#E7F9FC',
  text: '#0F172A',
  subtext: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
  red: '#C62828',
  redSoft: '#FFEBEE',
  green: '#2E7D32',
  greenSoft: '#E8F5E9',
  orange: '#E65100',
  orangeSoft: '#FFF3E0',
  blue: '#1565C0',
  blueSoft: '#E3F2FD',
}

type Project = { id: number; name: string; status: string | null; contract_amount: number | null }
type ChangeOrder = { id: number; project_id: number; amount: number }
type Expense = { id: number; project_id: number; amount: number }

function fmtMoney(n: number): string {
  return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function ManagerFinanceScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])

  const load = useCallback(async () => {
    setErrorMessage('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { setErrorMessage('Sign in required.'); setLoading(false); return }

    const { data: me } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    if (me?.role !== 'manager') { setErrorMessage('Manager access required.'); setLoading(false); return }

    const [{ data: pr }, { data: co }, { data: ex }] = await Promise.all([
      supabase.from('projects').select('id, name, status, contract_amount').order('name'),
      supabase.from('project_change_orders').select('id, project_id, amount'),
      supabase.from('project_expenses').select('id, project_id, amount'),
    ])
    setProjects((pr as Project[]) || [])
    setChangeOrders((co as ChangeOrder[]) || [])
    setExpenses((ex as Expense[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch('project_change_orders', load, undefined, !loading)
  useRealtimeRefetch('project_expenses',      load, undefined, !loading)
  useRealtimeRefetch('projects',              load, undefined, !loading)

  const rows = projects.map(p => {
    const base = Number(p.contract_amount) || 0
    const co   = changeOrders.filter(c => c.project_id === p.id).reduce((s, c) => s + (Number(c.amount) || 0), 0)
    const exp  = expenses.filter(e => e.project_id === p.id).reduce((s, e) => s + (Number(e.amount) || 0), 0)
    return { project: p, contract: base, changeOrders: co, totalContract: base + co, expenses: exp, net: base + co - exp }
  })

  const totals = rows.reduce(
    (acc, r) => {
      acc.contract += r.contract
      acc.changeOrders += r.changeOrders
      acc.totalContract += r.totalContract
      acc.expenses += r.expenses
      acc.net += r.net
      return acc
    },
    { contract: 0, changeOrders: 0, totalContract: 0, expenses: 0, net: 0 },
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
          <Text style={{ color: COLORS.navy, fontWeight: '700' }}>Back</Text>
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
            <Text style={{ color: '#D9F6FB' }}>Back</Text>
          </Pressable>
          <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800', marginBottom: 6 }}>Finance</Text>
          <Text style={{ color: '#D9F6FB', lineHeight: 20, fontSize: 13 }}>
            Per-project totals across every project. Detailed expense list lives on the web portal.
          </Text>
        </View>

        {/* Top totals */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <Tile label="Contract"      value={fmtMoney(totals.contract)}      bg={COLORS.blueSoft}   color={COLORS.blue} />
          <Tile label="Change Orders" value={fmtMoney(totals.changeOrders)}  bg={COLORS.orangeSoft} color={COLORS.orange} />
          <Tile label="Total Contract" value={fmtMoney(totals.totalContract)} bg={COLORS.greenSoft}  color={COLORS.green} />
          <Tile label="Expenses"      value={fmtMoney(totals.expenses)}      bg={COLORS.redSoft}    color={COLORS.red} />
          <Tile label="Net"           value={fmtMoney(totals.net)}           bg={totals.net >= 0 ? COLORS.greenSoft : COLORS.redSoft} color={totals.net >= 0 ? COLORS.green : COLORS.red} />
        </View>

        {rows.length === 0 ? (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, padding: 24, alignItems: 'center' }}>
            <Text style={{ color: COLORS.subtext }}>No projects yet.</Text>
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
                    <Text style={{ color: COLORS.green, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 }}>COMPLETED</Text>
                  </View>
                )}
                <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.subtext} style={{ marginLeft: 'auto' }} />
              </View>

              <Row label="Contract"       value={fmtMoney(r.contract)}      color={COLORS.blue} />
              <Row label="Change Orders"  value={fmtMoney(r.changeOrders)}  color={COLORS.orange} />
              <Row label="Total Contract" value={fmtMoney(r.totalContract)} color={COLORS.green} bold />
              <Row label="Expenses"       value={fmtMoney(r.expenses)}      color={COLORS.red} />
              <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 6 }} />
              <Row label="Net" value={fmtMoney(r.net)} color={r.net >= 0 ? COLORS.green : COLORS.red} bold />
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
