// The first ten seconds on a job, on the phone: phase, % complete, who is
// here now, the next inspection, what is waiting. Money only for those who
// can see it. Same project_header() as the web page.
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'
import { Badge, MoneyTile } from './ui'

type Row = Record<string, any>
const money = (n: any) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const timeOf = (ts: string) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const fmt = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')

export function ProjectHeaderCard({ projectId, onOpenWaiting }: { projectId: number; onOpenWaiting?: () => void }) {
  const { t } = useLanguage()
  const [h, setH] = useState<Row | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('project_header', { p_project_id: projectId })
    if (!error && data) setH(data as Row)
  }, [projectId])
  useEffect(() => { load() }, [load])
  useRealtimeRefetch('time_entries', load)
  useRealtimeRefetch('rfis', load)

  if (!h) return null
  const x = h.health || {}
  const td = h.today || {}
  const waiting: Row[] = h.waiting || []
  const ni = td.next_inspection
  const canMoney = !!h.can_money

  return (
    <View style={{ backgroundColor: COLORS.card, borderRadius: 24, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {x.phase ? <Badge tone="navy" label={x.phase} /> : null}
        {x.cost_flag ? <Badge tone="danger" label={`${t('cost')} ${x.cost_pct}%`} /> : null}
        {x.rfis_open > 0 ? <Badge tone="warn" label={`${x.rfis_open} RFI`} /> : null}
        {x.inspections_bad > 0 ? <Badge tone="danger" label={`${x.inspections_bad} ${t('inspection')}`} /> : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <MoneyTile label={t('complete')} value={x.pct_complete != null ? `${x.pct_complete}%` : '—'} sub={x.pct_ticked != null ? `${x.pct_ticked}% ${t('tasksTicked')}` : undefined} />
        {canMoney ? (
          <MoneyTile label={t('cost')} value={money(x.cost)} tone={x.cost_flag ? 'danger' : x.cost_pct != null && x.cost_pct >= 70 ? 'warn' : 'ok'}
            sub={x.cost_pct != null ? `${x.cost_pct}% ${t('ofContract')}` : x.is_tm ? 'T&M' : t('noContractYet')} />
        ) : (
          <MoneyTile label={t('hoursThisWeek')} value={String(h.hours?.this_week ?? 0)} sub={`${h.hours?.total ?? 0} ${t('total')}`} />
        )}
      </View>

      <View style={{ marginTop: 12, gap: 4 }}>
        {(td.clocked_in || []).length === 0 && (td.on_the_way || []).length === 0 ? (
          <Text style={{ color: COLORS.subtext, fontSize: 13 }}>{t('nobodyHereNow')}</Text>
        ) : (
          <>
            {(td.clocked_in || []).map((c: Row) => <Text key={`c${c.id}`} style={{ color: COLORS.text, fontSize: 13 }}><Text style={{ color: COLORS.green }}>● </Text>{c.name} <Text style={{ color: COLORS.muted }}>{timeOf(c.since)}</Text></Text>)}
            {(td.on_the_way || []).map((c: Row) => <Text key={`w${c.id}`} style={{ color: COLORS.text, fontSize: 13 }}><Text style={{ color: COLORS.amber }}>➜ </Text>{c.name} <Text style={{ color: COLORS.muted }}>{t('onTheWay')} {timeOf(c.since)}</Text></Text>)}
          </>
        )}
        {ni ? (
          <Text style={{ color: ni.status === 'failed' ? COLORS.red : COLORS.text, fontSize: 13 }}>
            <Text style={{ fontWeight: '800' }}>{t('nextInspection')}: </Text>{ni.label}{ni.requested ? ` · ${fmt(ni.requested)}` : ni.earliest ? ` · ${t('earliest')} ${fmt(ni.earliest)}` : ''}{ni.status === 'failed' ? ` · ${t('reInspection')}` : ''}
          </Text>
        ) : null}
      </View>

      {waiting.length > 0 ? (
        <Pressable onPress={onOpenWaiting} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF8F0', borderRadius: 12, padding: 10 }}>
          <MaterialCommunityIcons name="bell-alert-outline" size={18} color={COLORS.amber} />
          <Text style={{ color: COLORS.amber, fontWeight: '800', fontSize: 13, flex: 1 }}>{t('waitingOnYou')}: {waiting.length}</Text>
          <Text style={{ color: COLORS.muted, fontSize: 12 }} numberOfLines={1}>{waiting[0].title}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
