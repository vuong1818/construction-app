import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'
import { SkeletonList } from '../components/SkeletonCard'

// My Tasks = the step-check tasks assigned to me across every job kit. Check-off writes to
// project_playbook_checks (stamps me + now); un-check removes it. Mirrors the web Tasks tab.
// Scheduled work lives in project_tasks — the Gantt / Master Schedule system.
// Job-kit checklist tasks live in project_playbook_step_checks. They are two
// different tables and this screen only ever read the second, so anything a
// manager scheduled and assigned was invisible on the phone.
type Scheduled = {
  id: number
  title: string
  status: string | null
  projectName: string
  when: string | null
}

type Task = {
  id: number
  kitId: number
  title: string
  kitTitle: string
  stepTitle: string
  projectName: string
  done: boolean
  notes: string
}

export default function MyTasksScreen() {
  const router = useRouter()
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [uid, setUid] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [scheduled, setScheduled] = useState<Scheduled[]>([])
  const [tab, setTab] = useState<'open' | 'done'>('open')
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setErrorMessage(t('mustBeSignedIn')); setLoading(false); return }
      const me = session.user.id
      setUid(me)

      // Scheduled work, assigned the old way — one owner per row. Matches the
      // web's My Schedule page exactly (assigned_to = me).
      const { data: sched } = await supabase.from('project_tasks')
        .select('id, project_id, title, status, task_date, start_date, end_date')
        .eq('assigned_to', me)
        .order('start_date', { ascending: true })
      const schedProjIds = [...new Set((sched || []).map((r: any) => r.project_id).filter(Boolean))]
      const { data: schedProjs } = schedProjIds.length
        ? await supabase.from('projects').select('id, name').in('id', schedProjIds)
        : { data: [] as any[] }
      const schedProjMap: Record<number, string> = Object.fromEntries((schedProjs || []).map((p: any) => [p.id, p.name]))
      setScheduled((sched || []).map((r: any) => ({
        id: r.id,
        title: r.title || 'Task',
        status: r.status,
        projectName: schedProjMap[r.project_id] || '—',
        when: r.start_date || r.task_date || null,
      })))

      // Tasks are crewed, not owned: read the assignee join table rather than
      // the single assigned_to column, or a worker only sees the jobs where
      // they happen to be listed first.
      const { data: mine } = await supabase.from('project_task_assignees')
        .select('task_id').eq('user_id', me)
      const myTaskIds = [...new Set((mine || []).map((a: any) => a.task_id))]
      if (myTaskIds.length === 0) { setTasks([]); setLoading(false); return }
      // NOTE: returning here is fine — scheduled work is already in state.

      const { data: raw } = await supabase.from('project_playbook_step_checks')
        .select('id, step_id, label, description, notes').in('id', myTaskIds)
      const rows = raw || []
      const stepIds = [...new Set(rows.map((r: any) => r.step_id))]
      if (stepIds.length === 0) { setTasks([]); setLoading(false); return }

      const { data: steps } = await supabase.from('project_playbook_steps').select('id, title, project_playbook_id').in('id', stepIds)
      const stepMap: Record<number, any> = Object.fromEntries((steps || []).map((s: any) => [s.id, s]))
      const kitIds = [...new Set((steps || []).map((s: any) => s.project_playbook_id))]

      const { data: kits } = await supabase.from('project_playbooks').select('id, title, project_id').in('id', kitIds)
      const kitMap: Record<number, any> = Object.fromEntries((kits || []).map((k: any) => [k.id, k]))
      const projIds = [...new Set((kits || []).map((k: any) => k.project_id))]

      const { data: projs } = await supabase.from('projects').select('id, name').in('id', projIds)
      const projMap: Record<number, string> = Object.fromEntries((projs || []).map((p: any) => [p.id, p.name]))

      const taskIds = rows.map((r: any) => r.id)
      const { data: checks } = await supabase.from('project_playbook_checks')
        .select('item_id').eq('item_type', 'step_check').in('item_id', taskIds)
      const doneSet = new Set((checks || []).map((c: any) => c.item_id))

      const built: Task[] = rows.map((r: any) => {
        const step = stepMap[r.step_id] || {}
        const kit = kitMap[step.project_playbook_id] || {}
        return {
          id: r.id, kitId: step.project_playbook_id,
          title: r.description || r.label || 'Task',
          kitTitle: kit.title || 'Kit', stepTitle: step.title || 'Step',
          projectName: projMap[kit.project_id] || '—', done: doneSet.has(r.id),
          notes: r.notes || '',
        }
      })
      setTasks(built)
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to load tasks.')
    } finally { setLoading(false) }
  }, [t])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch('project_playbook_checks', load, undefined, !!uid)

  async function toggle(task: Task) {
    setSavingId(task.id)
    try {
      if (task.done) {
        const { error } = await supabase.from('project_playbook_checks').delete()
          .eq('project_playbook_id', task.kitId).eq('item_type', 'step_check').eq('item_id', task.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('project_playbook_checks')
          .insert({ project_playbook_id: task.kitId, item_type: 'step_check', item_id: task.id, checked_by: uid })
        if (error) throw error
      }
      await load()
    } catch (e: any) { Alert.alert(t('saveFailed'), e?.message || '') }
    finally { setSavingId(null) }
  }

  async function saveNote(task: Task, note: string) {
    if (note === (task.notes || '')) return
    const { error } = await supabase.rpc('set_task_note', { p_task_id: task.id, p_note: note })
    if (error) { Alert.alert(t('saveFailed'), error.message); return }
    setTasks(prev => prev.map(x => x.id === task.id ? { ...x, notes: note } : x))
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
            <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '800' }}>{t('mySchedule')}</Text>
          </View>
          <SkeletonList count={4} kind="task" />
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ color: COLORS.red, fontWeight: '700', marginBottom: 8 }}>{t('error')}</Text>
        <Text style={{ color: COLORS.text, textAlign: 'center' }}>{errorMessage}</Text>
      </SafeAreaView>
    )
  }

  const open = tasks.filter(x => !x.done)
  const done = tasks.filter(x => x.done)
  const shown = tab === 'open' ? open : done

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
      <View style={{ backgroundColor: COLORS.navy, paddingHorizontal: 20, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.white} />
        </Pressable>
        <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: '900' }}>{t('mySchedule')}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, padding: 16 }}>
        {(['open', 'done'] as const).map(k => (
          <Pressable key={k} onPress={() => setTab(k)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: tab === k ? COLORS.navy : COLORS.card, borderWidth: 1, borderColor: tab === k ? COLORS.navy : COLORS.border }}>
            <Text style={{ color: tab === k ? COLORS.white : COLORS.subtext, fontWeight: '800' }}>
              {k === 'open' ? `To do (${open.length})` : `Completed (${done.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10 }}>
        {/* Scheduled work — added on the web under Schedule > Gantt > Add Task.
            A different table from the job-kit checklist below, so it gets its
            own block rather than being mixed in and looking checkable. */}
        {tab === 'open' && scheduled.length > 0 && (
          <>
            <Text style={{ color: COLORS.subtext, fontWeight: '800', fontSize: 12, letterSpacing: 0.4, marginTop: 4 }}>
              {t('scheduledWork').toUpperCase()}
            </Text>
            {scheduled.map(sch => (
              <View key={`sch-${sch.id}`} style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.navySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="calendar-check" size={20} color={COLORS.navy} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>{sch.title}</Text>
                  <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 2 }}>
                    {sch.projectName}
                    {sch.when ? ` · ${new Date(sch.when + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                    {sch.status ? ` · ${sch.status}` : ''}
                  </Text>
                </View>
              </View>
            ))}
            <Text style={{ color: COLORS.subtext, fontWeight: '800', fontSize: 12, letterSpacing: 0.4, marginTop: 10 }}>
              {t('jobKitTasks').toUpperCase()}
            </Text>
          </>
        )}
        {shown.length === 0 && scheduled.length === 0 ? (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 32, alignItems: 'center' }}>
            <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={44} color={COLORS.muted} />
            <Text style={{ color: COLORS.subtext, marginTop: 10 }}>{tab === 'open' ? 'No tasks assigned to you.' : 'Nothing completed yet.'}</Text>
          </View>
        ) : shown.map(task => (
          <View key={task.id} style={{ backgroundColor: COLORS.card, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Pressable onPress={() => toggle(task)} disabled={savingId === task.id}
              style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: task.done ? COLORS.green : COLORS.border, backgroundColor: task.done ? COLORS.green : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
              {task.done ? <Ionicons name="checkmark" size={20} color={COLORS.white} /> : null}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15, textDecorationLine: task.done ? 'line-through' : 'none' }}>{task.title}</Text>
              <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 2 }}>{task.projectName} · {task.kitTitle} · {task.stepTitle}</Text>
              <TextInput
                key={`note-${task.id}-${task.notes}`}
                defaultValue={task.notes}
                placeholder={t('addNote')}
                placeholderTextColor={COLORS.muted}
                multiline
                onEndEditing={e => saveNote(task, e.nativeEvent.text.trim())}
                style={{ marginTop: 8, backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: COLORS.text, minHeight: 38 }}
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}
