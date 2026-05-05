import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SkeletonList } from '../../../components/SkeletonCard'
import { useRealtimeRefetch } from '../../../hooks/useRealtimeRefetch'
import { useLanguage } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { COLORS } from '../../../lib/theme'

type Task = {
  id: number
  title: string
  status: 'assigned' | 'in_progress' | 'completed'
  task_date: string | null
  start_date: string | null
  end_date: string | null
  assigned_to: string | null
  notes: string | null
}

type Profile = { id: string; full_name: string | null }
type Project = { id: number; name: string }

const STATUS_BADGE: Record<Task['status'], { bg: string; color: string; key: 'statusAssigned' | 'statusInProgress' | 'statusCompleted' }> = {
  assigned:    { bg: '#E3F2FD', color: '#1565C0', key: 'statusAssigned' },
  in_progress: { bg: '#FFF3E0', color: '#E65100', key: 'statusInProgress' },
  completed:   { bg: '#E8F5E9', color: '#2E7D32', key: 'statusCompleted' },
}

function fromIso(s: string) { return new Date(s + 'T12:00:00') }
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

function fmt(iso: string | null | undefined) {
  if (!iso) return ''
  return fromIso(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Group key — the Monday of the week of the task's anchor date.
function weekKeyOf(iso: string | null | undefined): string {
  if (!iso) return '0000-00-00'
  const d = startOfDay(fromIso(iso))
  const day = d.getDay() || 7
  if (day !== 1) d.setHours(-24 * (day - 1))
  return d.toISOString().slice(0, 10)
}

function weekLabel(weekKey: string): string {
  if (weekKey === '0000-00-00') return 'Unscheduled'
  const start = new Date(weekKey + 'T12:00:00')
  const end = new Date(start); end.setDate(end.getDate() + 6)
  const same = start.getMonth() === end.getMonth()
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', same ? { day: 'numeric' } : { month: 'short', day: 'numeric' })
  return `${startStr} – ${endStr}`
}

export default function ProjectScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const projectId = Number(id)
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({})

  const load = useCallback(async () => {
    if (!Number.isFinite(projectId)) { setLoading(false); return }
    const [projectRes, tasksRes, profilesRes] = await Promise.all([
      supabase.from('projects').select('id, name').eq('id', projectId).single(),
      supabase
        .from('project_tasks')
        .select('id, title, status, task_date, start_date, end_date, assigned_to, notes')
        .eq('project_id', projectId),
      supabase.from('profiles').select('id, full_name'),
    ])
    if (projectRes.data) setProject(projectRes.data as Project)
    setTasks((tasksRes.data || []) as Task[])
    const map: Record<string, Profile> = {}
    for (const p of (profilesRes.data || []) as Profile[]) map[p.id] = p
    setProfilesById(map)
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch('project_tasks', load, `project_id=eq.${projectId}`, Number.isFinite(projectId))

  // Sort by anchor date (start_date || task_date), unscheduled bucket last.
  const sorted = [...tasks].sort((a, b) => {
    const aIso = a.start_date || a.task_date || ''
    const bIso = b.start_date || b.task_date || ''
    if (!aIso && !bIso) return a.id - b.id
    if (!aIso) return 1
    if (!bIso) return -1
    return aIso.localeCompare(bIso)
  })

  // Group by Monday-of-week of anchor date.
  const groups: { key: string; label: string; tasks: Task[] }[] = []
  const seen = new Map<string, Task[]>()
  for (const task of sorted) {
    const anchor = task.start_date || task.task_date
    const key = weekKeyOf(anchor)
    if (!seen.has(key)) seen.set(key, [])
    seen.get(key)!.push(task)
  }
  for (const [key, ts] of seen) groups.push({ key, label: weekLabel(key), tasks: ts })

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
            <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '800', marginBottom: 6 }}>
              {t('projectSchedule')}
            </Text>
          </View>
          <SkeletonList count={3} kind="task" />
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
          <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '800', marginBottom: 6 }}>
            {t('projectSchedule')}
          </Text>
          <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
            {project?.name || ''}
          </Text>
        </View>

        {tasks.length === 0 ? (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, padding: 28 }}>
            <Text style={{ color: COLORS.subtext, textAlign: 'center' }}>
              {t('scheduleEmpty')}
            </Text>
          </View>
        ) : (
          groups.map(g => (
            <View key={g.key} style={{ marginBottom: 18 }}>
              <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 13, letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>
                {g.label}
              </Text>
              {g.tasks.map(task => {
                const badge = STATUS_BADGE[task.status]
                const assignee = task.assigned_to ? profilesById[task.assigned_to]?.full_name : null
                const startStr = fmt(task.start_date)
                const endStr = fmt(task.end_date)
                const oneDay = task.task_date && !task.start_date && !task.end_date
                const range = oneDay
                  ? fmt(task.task_date)
                  : startStr && endStr
                    ? `${startStr} – ${endStr}`
                    : startStr || endStr || ''
                return (
                  <View
                    key={task.id}
                    style={{
                      backgroundColor: COLORS.card,
                      borderRadius: 22,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      padding: 16,
                      marginBottom: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <View style={{ backgroundColor: badge.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
                          <Text style={{ color: badge.color, fontWeight: '800', fontSize: 11, letterSpacing: 0.3 }}>
                            {t(badge.key).toUpperCase()}
                          </Text>
                        </View>
                        {range ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <MaterialCommunityIcons name="calendar-blank-outline" size={14} color={COLORS.subtext} />
                            <Text style={{ color: COLORS.subtext, fontSize: 12, fontWeight: '700' }}>{range}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>
                      {task.title}
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialCommunityIcons name="account-outline" size={14} color={COLORS.muted} />
                      <Text style={{ color: COLORS.subtext, fontSize: 12 }}>
                        {assignee || t('unassigned')}
                      </Text>
                    </View>

                    {task.notes ? (
                      <Text style={{ color: COLORS.subtext, fontSize: 13, marginTop: 8, lineHeight: 18 }} numberOfLines={3}>
                        {task.notes}
                      </Text>
                    ) : null}
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
