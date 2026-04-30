import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Subscribe to Postgres changes on a Supabase table and refetch on any event.
 *
 * Requires the table to be in the `supabase_realtime` publication
 * (see migration 0006_realtime_publication.sql).
 */
export function useRealtimeRefetch(
  table: string,
  refetch: () => void | Promise<void>,
  filter?: string,
  enabled: boolean = true,
) {
  const refetchRef = useRef(refetch)
  useEffect(() => { refetchRef.current = refetch }, [refetch])

  useEffect(() => {
    if (!enabled || !table) return

    const config: { event: '*'; schema: string; table: string; filter?: string } = {
      event: '*',
      schema: 'public',
      table,
    }
    if (filter) config.filter = filter

    const channel = supabase
      .channel(`rt:${table}:${filter || 'all'}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes' as any, config, () => {
        try {
          const result = refetchRef.current?.()
          if (result && typeof (result as Promise<void>).then === 'function') {
            ;(result as Promise<void>).catch((e) => console.error('realtime refetch error', e))
          }
        } catch (e) {
          console.error('realtime refetch error', e)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [table, filter, enabled])
}
