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
    const [{ data: ests }, { data: cos }, { data: exps }, { data: draws }] = await Promise.all([
      // Contract value is DERIVED, not stored: accepted, non-archived estimates
      // plus change orders. projects.contract_amount was dropped when the web
      // portal stopped surfacing it (components/FinanceTab.js), and mobile kept
      // asking for it — a 400 on every launch, swallowed into a contract of $0.
      supabase.from('project_estimates').select('total_amount')
        .eq('project_id', projectId).eq('status', 'accepted').is('archived_at', null),
      // Change orders are SOV lines flagged is_change_order, the same place the
      // web reads them (app/portal/finance/page.js). This used to query
      // project_change_orders, a table that no longer exists — the error was
      // swallowed by `|| []`, so Total Contract silently omitted every change
      // order. See audit 2026-08-09, P4.
      supabase.from('project_pay_app_items').select('scheduled_value')
        .eq('project_id', projectId).eq('is_change_order', true),
      supabase.from('project_expenses').select('amount, is_paid, payment_method').eq('project_id', projectId),
      // A DRAW is the billing event and the thing that carries amount_paid.
      // project_pay_apps is the container above it and has no such column, so
      // this query 400'd every time and left payApps null — which meant the
      // lines fetch below never ran and billed-to-date and A/R sat at zero
      // regardless of what had been billed or received.
      supabase.from('project_draws').select('id, retainage_pct, amount_paid').eq('project_id', projectId),
    ])
    const contract = (ests || []).reduce((s, e) => s + (Number(e.total_amount) || 0), 0)
    const changeOrders = (cos || []).reduce((s, c) => s + (Number(c.scheduled_value) || 0), 0)
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
    const payAppIds = (draws || []).map(d => d.id)
    if (payAppIds.length > 0) {
      const { data: lines } = await supabase
        .from('project_draw_lines')
        .select('draw_id, from_previous, this_period, materials_stored')
        .in('draw_id', payAppIds)
      const completedByApp = new Map<number, number>()
      ;(lines || []).forEach(l => {
        const v = (Number(l.from_previous) || 0) + (Number(l.this_period) || 0) + (Number(l.materials_stored) || 0)
        completedByApp.set(l.draw_id, (completedByApp.get(l.draw_id) || 0) + v)
        billedToDate += v
      })
      ;(draws || []).forEach(a => {
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
  // Subscribe to what the numbers are actually made of. 'projects' was here for
  // contract_amount, which no longer exists; accepted estimates and draws are
  // what move these totals now.
  useRealtimeRefetch('project_estimates',     load, projectId ? `project_id=eq.${projectId}` : undefined, !loading && !!projectId)
  useRealtimeRefetch('project_pay_app_items', load, projectId ? `project_id=eq.${projectId}` : undefined, !loading && !!projectId)
  useRealtimeRefetch('project_expenses',      load, projectId ? `project_id=eq.${projectId}` : undefined, !loading && !!projectId)
  useRealtimeRefetch('project_draws',         load, projectId ? `project_id=eq.${projectId}` : undefined, !loading && !!projectId)

  return { totals, loading, refresh: load }
}
