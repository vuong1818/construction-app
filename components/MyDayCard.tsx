// "My day" on the worker's Home: today's job with navigation, today's kit
// tasks tickable right here, and the five verbs a worker does on a job.
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Linking, Platform, Pressable, Text, View } from 'react-native'
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch'
import { t, type Language } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'
import { SectionTitle } from './ui'

type Task = { kind: 'check' | 'bar'; id: number; project_id: number; project_name: string; title: string; step: string | null; status: string | null }
type Day = { job: { id: number; name: string; address: string; lat: number | null; lng: number | null } | null; tasks: Task[] }

export function MyDayCard({ language, activeProjectId }: { language: Language; activeProjectId?: number | null }) {
  const router = useRouter()
  const [day, setDay] = useState<Day | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('my_day')
      if (data) setDay(data as Day)
    } catch { /* stays as it was */ }
  }, [])
  useEffect(() => { load() }, [load])
  useRealtimeRefetch('project_playbook_step_checks', load)
  useRealtimeRefetch('project_tasks', load)

  const jobId = activeProjectId ?? day?.job?.id ?? null
  const job = day?.job && (!activeProjectId || day.job.id === activeProjectId) ? day.job : null
  const tasks = (day?.tasks || []).filter(x => !jobId || x.project_id === jobId).slice(0, 6)

  async function tick(task: Task) {
    const key = `${task.kind}:${task.id}`
    setBusy(key)
    try {
      await supabase.rpc('my_day_tick', { p_kind: task.kind, p_id: task.id, p_done: true })
      setDay(d => d ? { ...d, tasks: d.tasks.filter(x => !(x.kind === task.kind && x.id === task.id)) } : d)
    } finally {
      setBusy(null)
    }
  }

  function navigate() {
    if (!job) return
    const q = job.lat && job.lng ? `${job.lat},${job.lng}` : encodeURIComponent(job.address || job.name)
    const url = Platform.OS === 'ios' ? `maps:?daddr=${q}` : `geo:0,0?q=${q}`
    Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?daddr=${q}`))
  }

  const go = (path: string) => () => router.push((jobId ? `/project/${jobId}${path}` : '/projects') as any)
  const verbs: { icon: string; label: string; onPress: () => void }[] = [
    { icon: 'clipboard-text-outline', label: t(language, 'verbReport'), onPress: go('/new-report') },
    { icon: 'help-circle-outline', label: t(language, 'verbAsk'), onPress: go('/rfis') },
    { icon: 'package-variant', label: t(language, 'verbRequest'), onPress: go('/material-requests') },
    { icon: 'receipt', label: t(language, 'verbReceipt'), onPress: go('/expenses') },
    { icon: 'camera-outline', label: t(language, 'verbPhoto'), onPress: go('') },
  ]

  return (
    <View>
      <SectionTitle icon="calendar-today" title={t(language, 'myDay')} />
      <View style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border }}>
        {job ? (
          <Pressable onPress={() => router.push(`/project/${job.id}` as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 17 }}>{job.name}</Text>
              {job.address?.trim() ? <Text style={{ color: COLORS.subtext, fontSize: 13, marginTop: 2 }}>{job.address.trim()}</Text> : null}
            </View>
            <Pressable onPress={navigate} hitSlop={8} style={{ backgroundColor: COLORS.tealSoft, borderRadius: 12, padding: 10 }}>
              <MaterialCommunityIcons name="navigation-variant-outline" size={22} color={COLORS.teal} />
            </Pressable>
          </Pressable>
        ) : (
          <Text style={{ color: COLORS.subtext, fontSize: 14 }}>{t(language, 'noJobToday')}</Text>
        )}

        {tasks.length > 0 && (
          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 6 }}>
            {tasks.map(task => {
              const key = `${task.kind}:${task.id}`
              return (
                <Pressable key={key} onPress={() => tick(task)} disabled={busy === key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                  <MaterialCommunityIcons name={busy === key ? 'checkbox-marked-circle-outline' : 'checkbox-blank-circle-outline'} size={24} color={busy === key ? COLORS.green : COLORS.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '600' }}>{task.title}</Text>
                    {task.step || (!jobId && task.project_name) ? <Text style={{ color: COLORS.muted, fontSize: 12 }}>{[task.step, !jobId ? task.project_name : null].filter(Boolean).join(' · ')}</Text> : null}
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {verbs.map(v => (
            <Pressable key={v.label} onPress={v.onPress} style={{ flexBasis: '30%', flexGrow: 1, alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border }}>
              <MaterialCommunityIcons name={v.icon as any} size={26} color={COLORS.navy} />
              <Text style={{ color: COLORS.navy, fontWeight: '700', fontSize: 13, marginTop: 4 }}>{v.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  )
}
