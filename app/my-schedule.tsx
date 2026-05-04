import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch'
import { useLanguage, type TranslationKey } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS, TOUCH, TYPE } from '../lib/theme'
import { SkeletonList } from '../components/SkeletonCard'

type Status = 'assigned' | 'in_progress' | 'completed'

type Task = {
  id: number
  project_id: number
  title: string
  status: Status
  notes: string | null
  task_date: string | null
  start_date: string | null
  end_date: string | null
}

type Project = {
  id: number
  name: string
  status: string | null
}

const STATUS_CONFIG: Record<Status, { labelKey: TranslationKey; color: string; bg: string }> = {
  assigned:    { labelKey: 'statusAssigned',    color: '#1565C0', bg: '#E3F2FD' },
  in_progress: { labelKey: 'statusInProgress',  color: '#E65100', bg: '#FFF3E0' },
  completed:   { labelKey: 'statusCompleted',   color: '#2E7D32', bg: '#E8F5E9' },
}

const MS_PER_DAY = 86_400_000
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function fromIso(s: string) { return new Date(s + 'T12:00:00') }
function fmt(iso: string | null | undefined) {
  if (!iso) return ''
  return fromIso(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function mondayOf(d: Date) {
  const x = new Date(d)
  const day = x.getDay() || 7
  if (day !== 1) x.setHours(-24 * (day - 1))
  x.setHours(0, 0, 0, 0)
  return x
}

type Bucket = 'upcoming' | 'overdue' | 'completed' | 'all'

export default function MyScheduleScreen() {
  const router = useRouter()
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [bucket, setBucket] = useState<Bucket>('upcoming')
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setErrorMessage(t('mustBeSignedIn')); setLoading(false); return }
      setUserId(session.user.id)

      const [tasksResult, projectsResult] = await Promise.all([
        supabase.from('project_tasks')
          .select('id, project_id, title, status, notes, task_date, start_date, end_date')
          .eq('assigned_to', session.user.id)
          .order('start_date', { ascending: true })
          .order('task_date',  { ascending: true }),
        supabase.from('projects').select('id, name, status').order('name'),
      ])

      if (tasksResult.error) { setErrorMessage(tasksResult.error.message); setLoading(false); return }
      if (projectsResult.error) { setErrorMessage(projectsResult.error.message); setLoading(false); return }

      setTasks((tasksResult.data || []) as Task[])
      setProjects((projectsResult.data || []) as Project[])
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to load schedule.')
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch('project_tasks', load, userId ? `assigned_to=eq.${userId}` : undefined, !!userId)

  async function setStatus(task: Task, status: Status) {
    setSavingId(task.id)
    const { error } = await supabase.from('project_tasks').update({ status }).eq('id', task.id)
    setSavingId(null)
    if (error) { Alert.alert(t('saveFailed'), error.message); return }
    load()
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
            <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '800', marginBottom: 6 }}>
              {t('mySchedule')}
            </Text>
            <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
              {t('myScheduleSubtitle')}
            </Text>
          </View>
          <SkeletonList count={3} kind="task" />
        </ScrollView>
      </SafeAreaView>
    )
  }
  if (errorMessage) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.red, fontWeight: '700', marginBottom: 10 }}>{t('error')}</Text>
        <Text style={{ color: COLORS.text, textAlign: 'center', marginBottom: 16 }}>{errorMessage}</Text>
        <Pressable onPress={() => router.back()} style={{ backgroundColor: COLORS.navy, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 }}>
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>{t('back')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const completedProjectIds = new Set(projects.filter(p => p.status === 'completed').map(p => p.id))
  const live = tasks.filter(x => !completedProjectIds.has(x.project_id))

  function isOverdue(x: Task) {
    if (x.status === 'completed') return false
    const refIso = x.end_date || x.task_date
    if (!refIso) return false
    return startOfDay(fromIso(refIso)) < startOfDay(new Date())
  }
  const overdue   = live.filter(isOverdue)
  const upcoming  = live.filter(x => x.status !== 'completed' && !isOverdue(x))
  const completed = tasks.filter(x => x.status === 'completed')

  const view: Task[] =
    bucket === 'overdue'   ? overdue   :
    bucket === 'completed' ? completed :
    bucket === 'all'       ? tasks     :
                             upcoming

  const groups = groupByWeek(view)
  const projectName = (id: number) => projects.find(p => p.id === id)?.name || t('unknown')

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
          <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '800', marginBottom: 6 }}>
            {t('mySchedule')}
          </Text>
          <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
            {t('myScheduleSubtitle')}
          </Text>
        </View>

        {/* Filter pills */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {[
            { id: 'upcoming'  as Bucket, labelKey: 'upcoming'  as TranslationKey, count: upcoming.length,  color: '#1565C0' },
            { id: 'overdue'   as Bucket, labelKey: 'overdue'   as TranslationKey, count: overdue.length,   color: '#C62828' },
            { id: 'completed' as Bucket, labelKey: 'statusCompleted' as TranslationKey, count: completed.length, color: '#2E7D32' },
            { id: 'all'       as Bucket, labelKey: 'allItems'  as TranslationKey, count: tasks.length,     color: COLORS.navy },
          ].map(b => {
            const active = bucket === b.id
            return (
              <Pressable
                key={b.id}
                onPress={() => setBucket(b.id)}
                style={{
                  backgroundColor: active ? b.color : COLORS.white,
                  borderColor: COLORS.border, borderWidth: 1,
                  borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                }}
              >
                <Text style={{ color: active ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 13 }}>
                  {t(b.labelKey)}
                </Text>
                <View style={{ backgroundColor: active ? 'rgba(255,255,255,0.25)' : '#F4F7FA', borderRadius: 100, paddingHorizontal: 7, paddingVertical: 1 }}>
                  <Text style={{ color: active ? COLORS.white : b.color, fontWeight: '800', fontSize: 11 }}>{b.count}</Text>
                </View>
              </Pressable>
            )
          })}
        </View>

        {view.length === 0 ? (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, padding: 28 }}>
            <Text style={{ color: COLORS.subtext, textAlign: 'center' }}>
              {bucket === 'overdue'   ? t('myScheduleEmptyOverdue')   :
               bucket === 'completed' ? t('myScheduleEmptyCompleted') :
               bucket === 'upcoming'  ? t('myScheduleEmptyUpcoming')  :
                                        t('myScheduleEmptyAll')}
            </Text>
          </View>
        ) : (
          groups.map(g => (
            <View key={g.key} style={{ marginBottom: 18 }}>
              <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 13, letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>
                {g.label}
              </Text>
              {g.tasks.map(task => {
                const cfg = STATUS_CONFIG[task.status]
                const od = isOverdue(task)
                return (
                  <View
                    key={task.id}
                    style={{
                      backgroundColor: COLORS.card,
                      borderRadius: 22,
                      borderWidth: 1, borderColor: COLORS.border,
                      borderLeftWidth: od ? 4 : 1,
                      borderLeftColor: od ? '#C62828' : COLORS.border,
                      padding: 16, marginBottom: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                      <Pressable
                        onPress={() => router.push(`/project/${task.project_id}/tasks` as any)}
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '800' }} numberOfLines={2}>
                          {task.title}
                        </Text>
                        <Text style={{ color: COLORS.teal, fontSize: 13, fontWeight: '600', marginTop: 2 }}>
                          {projectName(task.project_id)}
                        </Text>
                      </Pressable>
                      <View style={{ backgroundColor: cfg.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
                        <Text style={{ color: cfg.color, fontWeight: '800', fontSize: 11, letterSpacing: 0.5 }}>
                          {t(cfg.labelKey).toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <Text style={{ color: COLORS.subtext, fontSize: 13 }}>
                        📅 {fmt(task.start_date || task.task_date)}
                        {task.end_date && task.end_date !== task.start_date ? ` → ${fmt(task.end_date)}` : ''}
                      </Text>
                      {od && (
                        <Text style={{ color: '#C62828', fontWeight: '800', fontSize: 12 }}>· {t('overdue')}</Text>
                      )}
                    </View>

                    {task.notes ? (
                      <View style={{ backgroundColor: '#FAFBFD', borderRadius: 10, padding: 12, marginTop: 10 }}>
                        <Text style={{ color: COLORS.subtext, fontSize: TYPE.body, lineHeight: 22 }}>📝 {task.notes}</Text>
                      </View>
                    ) : null}

                    {task.status !== 'completed' ? (
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                        {task.status !== 'in_progress' && (
                          <Pressable
                            onPress={() => setStatus(task, 'in_progress')}
                            disabled={savingId === task.id}
                            style={{ backgroundColor: COLORS.amberSoft, paddingHorizontal: TOUCH.pillPaddingH, paddingVertical: TOUCH.pillPaddingV, minHeight: TOUCH.minHeight, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                          >
                            <MaterialCommunityIcons name="play" size={18} color={COLORS.amber} />
                            <Text style={{ color: COLORS.amber, fontWeight: '800', fontSize: TYPE.bodyBold }}>{t('start')}</Text>
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => setStatus(task, 'completed')}
                          disabled={savingId === task.id}
                          style={{ backgroundColor: COLORS.greenSoft, paddingHorizontal: TOUCH.pillPaddingH, paddingVertical: TOUCH.pillPaddingV, minHeight: TOUCH.minHeight, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                        >
                          <MaterialCommunityIcons name="check" size={18} color="#2E7D32" />
                          <Text style={{ color: '#2E7D32', fontWeight: '800', fontSize: TYPE.bodyBold }}>{t('markCompleted')}</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={{ marginTop: 14 }}>
                        <Pressable
                          onPress={() => setStatus(task, 'assigned')}
                          disabled={savingId === task.id}
                          style={{ alignSelf: 'flex-start', backgroundColor: '#F4F7FA', borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: TOUCH.pillPaddingH, paddingVertical: TOUCH.pillPaddingV, minHeight: TOUCH.minHeight, borderRadius: 14, justifyContent: 'center' }}
                        >
                          <Text style={{ color: COLORS.subtext, fontWeight: '700', fontSize: TYPE.bodyBold }}>↺ {t('reopen')}</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// Bucket tasks by their start-week. Weeks run Mon → Sun. "No date" goes last.
function groupByWeek(tasks: Task[]) {
  const weeks = new Map<string, { key: string; monday: Date | null; label: string; tasks: Task[] }>()
  const todayMon = mondayOf(startOfDay(new Date()))
  tasks.forEach(t => {
    const refIso = t.start_date || t.task_date
    if (!refIso) {
      const k = 'z-undated'
      if (!weeks.has(k)) weeks.set(k, { key: k, monday: null, label: 'No date set', tasks: [] })
      weeks.get(k)!.tasks.push(t)
      return
    }
    const monday = mondayOf(startOfDay(fromIso(refIso)))
    const k = monday.toISOString().slice(0, 10)
    if (!weeks.has(k)) {
      let label: string
      const diff = Math.round(((+monday) - (+todayMon)) / MS_PER_DAY / 7)
      if      (diff === 0)  label = 'This Week'
      else if (diff === 1)  label = 'Next Week'
      else if (diff === -1) label = 'Last Week'
      else if (diff < 0)    label = `${Math.abs(diff)} weeks ago`
      else                  label = `Week of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      weeks.set(k, { key: k, monday, label, tasks: [] })
    }
    weeks.get(k)!.tasks.push(t)
  })
  return Array.from(weeks.values()).sort((a, b) => {
    if (!a.monday && !b.monday) return 0
    if (!a.monday) return 1
    if (!b.monday) return -1
    return (+a.monday) - (+b.monday)
  })
}
