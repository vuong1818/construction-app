import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtimeRefetch } from './useRealtimeRefetch'

export type ProjectFinanceTotals = {
  contract: number
  changeOrders: number
  totalContract: number
  expenses: number
  net: number
  payAppCount: number
  billedToDate: number
  accountsReceivable: number
  accountsPayable: number
}

export function useProjectFinance(projectId: number | undefined) {
  const [totals, setTotals] = useState<ProjectFinanceTotals>({
    contract: 0,
    changeOrders: 0,
    totalContract: 0,
    expenses: 0,
    net: 0,
    payAppCount: 0,
    billedToDate: 0,
    accountsReceivable: 0,
    accountsPayable: 0,
  })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!projectId || !Number.isFinite(projectId)) { setLoading(false); return }
    const [{ data: proj }, { data: cos }, { data: exps }, { data: payApps }] = await Promise.all([
      supabase.from('projects').select('contract_amount').eq('id', projectId).single(),
      supabase.from('project_change_orders').select('amount').eq('project_id', projectId),
      supabase.from('project_expenses').select('amount, is_paid, payment_method').eq('project_id', projectId),
      supabase.from('project_pay_apps').select('id, retainage_pct, amount_paid').eq('project_id', projectId),
    ])
    const contract = Number(proj?.contract_amount) || 0
    const changeOrders = (cos || []).reduce((s, c) => s + (Number(c.amount) || 0), 0)
    const expenses     = (exps || []).reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const totalContract = contract + changeOrders

    // A/P = unpaid project expenses (is_paid = false OR method = account_payable)
    const accountsPayable = (exps || []).reduce((s, e) => {
      const unpaid = e.is_paid === false || e.payment_method === 'account_payable'
      return unpaid ? s + (Number(e.amount) || 0) : s
    }, 0)

    // Billed-to-date and A/R from pay apps
    let billedToDate = 0
    let accountsReceivable = 0
    const payAppIds = (payApps || []).map(p => p.id)
    if (payAppIds.length > 0) {
      const { data: lines } = await supabase
        .from('project_pay_app_lines')
        .select('pay_app_id, from_previous, this_period, materials_stored')
        .in('pay_app_id', payAppIds)
      const completedByApp = new Map<number, number>()
      ;(lines || []).forEach(l => {
        const v = (Number(l.from_previous) || 0) + (Number(l.this_period) || 0) + (Number(l.materials_stored) || 0)
        completedByApp.set(l.pay_app_id, (completedByApp.get(l.pay_app_id) || 0) + v)
        billedToDate += v
      })
      ;(payApps || []).forEach(a => {
        const completed = completedByApp.get(a.id) || 0
        const netBilled = completed * (1 - (Number(a.retainage_pct) || 0) / 100)
        const outstanding = Math.max(0, netBilled - (Number(a.amount_paid) || 0))
        accountsReceivable += outstanding
      })
    }

    setTotals({
      contract,
      changeOrders,
      totalContract,
      expenses,
      net: totalContract - expenses,
      payAppCount: payAppIds.length,
      billedToDate,
      accountsReceivable,
      accountsPayable,
    })
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch('project_change_orders', load, projectId ? `project_id=eq.${projectId}` : undefined, !loading && !!projectId)
  useRealtimeRefetch('project_expenses',      load, projectId ? `project_id=eq.${projectId}` : undefined, !loading && !!projectId)
  useRealtimeRefetch('project_pay_apps',      load, projectId ? `project_id=eq.${projectId}` : undefined, !loading && !!projectId)
  useRealtimeRefetch('projects',              load, projectId ? `id=eq.${projectId}`         : undefined, !loading && !!projectId)

  return { totals, loading, refresh: load }
}
