import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtimeRefetch } from './useRealtimeRefetch'

export type ProjectFinanceTotals = {
  contract: number
  changeOrders: number
  totalContract: number
  expenses: number
  net: number
}

export function useProjectFinance(projectId: number | undefined) {
  const [totals, setTotals] = useState<ProjectFinanceTotals>({
    contract: 0,
    changeOrders: 0,
    totalContract: 0,
    expenses: 0,
    net: 0,
  })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!projectId || !Number.isFinite(projectId)) { setLoading(false); return }
    const [{ data: proj }, { data: cos }, { data: exps }] = await Promise.all([
      supabase.from('projects').select('contract_amount').eq('id', projectId).single(),
      supabase.from('project_change_orders').select('amount').eq('project_id', projectId),
      supabase.from('project_expenses').select('amount').eq('project_id', projectId),
    ])
    const contract = Number(proj?.contract_amount) || 0
    const changeOrders = (cos || []).reduce((s, c) => s + (Number(c.amount) || 0), 0)
    const expenses     = (exps || []).reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const totalContract = contract + changeOrders
    setTotals({ contract, changeOrders, totalContract, expenses, net: totalContract - expenses })
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch('project_change_orders', load, projectId ? `project_id=eq.${projectId}` : undefined, !loading && !!projectId)
  useRealtimeRefetch('project_expenses',      load, projectId ? `project_id=eq.${projectId}` : undefined, !loading && !!projectId)
  useRealtimeRefetch('projects',              load, projectId ? `id=eq.${projectId}`         : undefined, !loading && !!projectId)

  return { totals, loading, refresh: load }
}
