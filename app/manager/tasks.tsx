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
import { useLanguage, type TranslationKey } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'

type Status = 'assigned' | 'in_progress' | 'completed'

const STATUS_CONFIG: Record<Status, { labelKey: TranslationKey; color: string; bg: string }> = {
  assigned:    { labelKey: 'statusAssigned',   color: '#1565C0', bg: '#E3F2FD' },
  in_progress: { labelKey: 'statusInProgress', color: '#E65100', bg: '#FFF3E0' },
  completed:   { labelKey: 'statusCompleted',  color: '#2E7D32', bg: '#E8F5E9' },
}

const STATUS_ORDER: Record<Status, number> = { in_progress: 0, assigned: 1, completed: 2 }

const OVERDUE = { color: '#C62828', bg: '#FFEBEE' }

type Task = {
  id: number
  project_id: number
  task_date: string | null
  title: string
  assigned_to: string | null
  status: Status
  notes: string | null
}

type Project = { id: number; name: string; status: string | null }

function isOverdue(t: Task): boolean {
  if (!t.task_date || t.status === 'completed') return false
  return new Date(t.task_date + 'T23:59:59') < new Date()
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ManagerTasksScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([])

  const load = useCallback(async () => {
    setErrorMessage('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { setErrorMessage(t('signInRequired')); setLoading(false); return }

    const { data: me } = await supabase
      .from('profiles').select('role').eq('id', session.user.id).single()
    if (me?.role !== 'manager') { setErrorMessage(t('managerAccessRequired')); setLoading(false); return }

    const [{ data: projData }, { data: profData }, { data: taskData }] = await Promise.all([
      supabase.from('projects').select('id, name, status'),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('project_tasks').select('id, project_id, task_date, title, assigned_to, status, notes'),
    ])
    setProjects(projData || [])
    setProfiles(profData || [])
    setTasks((taskData as Task[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch('project_tasks', load, undefined, !loading)
  useRealtimeRefetch('projects',      load, undefined, !loading)

  function profileName(id: string | null) {
    if (!id) return t('unassigned')
    const p = profiles.find(x => x.id === id)
    return p?.full_name || t('unknown')
  }

  function projectName(id: number) {
    return projects.find(p => p.id === id)?.name || t('unknownProject')
  }

  const completedProjectIds = new Set(projects.filter(p => p.status === 'completed').map(p => p.id))
  const visibleTasks = tasks.filter(t => !completedProjectIds.has(t.project_id))

  const sorted = [...visibleTasks].sort((a, b) => {
    const oa = isOverdue(a) ? -1 : 0
    const ob = isOverdue(b) ? -1 : 0
    if (oa !== ob) return oa - ob
    const sa = STATUS_ORDER[a.status] ?? 9
    const sb = STATUS_ORDER[b.status] ?? 9
    if (sa !== sb) return sa - sb
    return (a.task_date || '').localeCompare(b.task_date || '')
  })

  const overdueCount    = visibleTasks.filter(isOverdue).length
  const inProgressCount = visibleTasks.filter(t => t.status === 'in_progress').length
  const assignedCount   = visibleTasks.filter(t => t.status === 'assigned').length

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
          <Text style={{ color: COLORS.navy, fontWeight: '700' }}>{t('back')}</Text>
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
            <Text style={{ color: '#D9F6FB' }}>{t('back')}</Text>
          </Pressable>
          <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800', marginBottom: 6 }}>{t('tasks')}</Text>
          <Text style={{ color: '#D9F6FB', lineHeight: 20, fontSize: 13 }}>
            {t('openTasksAcrossActive')}
          </Text>
        </View>

        {/* Summary chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <View style={{ backgroundColor: OVERDUE.bg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 }}>
            <Text style={{ color: OVERDUE.color, fontWeight: '800', fontSize: 12 }}>{t('overdueCount', { count: overdueCount })}</Text>
          </View>
          <View style={{ backgroundColor: STATUS_CONFIG.in_progress.bg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 }}>
            <Text style={{ color: STATUS_CONFIG.in_progress.color, fontWeight: '800', fontSize: 12 }}>{t('inProgressCount', { count: inProgressCount })}</Text>
          </View>
          <View style={{ backgroundColor: STATUS_CONFIG.assigned.bg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 }}>
            <Text style={{ color: STATUS_CONFIG.assigned.color, fontWeight: '800', fontSize: 12 }}>{t('assignedCount', { count: assignedCount })}</Text>
          </View>
        </View>

        {sorted.length === 0 ? (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, padding: 24, alignItems: 'center' }}>
            <Text style={{ color: COLORS.subtext }}>{t('noOpenTasksActive')}</Text>
          </View>
        ) : (
          sorted.map(task => {
            const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.assigned
            const overdue = isOverdue(task)
            return (
              <Pressable
                key={task.id}
                onPress={() => router.push(`/project/${task.project_id}/tasks`)}
                style={{
                  backgroundColor: COLORS.card,
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: overdue ? '#C62828' : COLORS.border,
                  borderLeftWidth: overdue ? 4 : 1,
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <View style={{ backgroundColor: cfg.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
                    <Text style={{ color: cfg.color, fontWeight: '800', fontSize: 11, letterSpacing: 0.5 }}>{t(cfg.labelKey).toUpperCase()}</Text>
                  </View>
                  {overdue && (
                    <View style={{ backgroundColor: OVERDUE.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
                      <Text style={{ color: OVERDUE.color, fontWeight: '800', fontSize: 11, letterSpacing: 0.5 }}>{`⚠ ${t('overdue').toUpperCase()}`}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialCommunityIcons name="folder-outline" size={14} color={COLORS.navy} />
                    <Text style={{ color: COLORS.navy, fontWeight: '700', fontSize: 12 }}>{projectName(task.project_id)}</Text>
                  </View>
                </View>

                <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 6 }}>{task.title}</Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  <Text style={{ color: overdue ? OVERDUE.color : COLORS.subtext, fontSize: 12, fontWeight: overdue ? '700' : '400' }}>
                    {`📅 ${t('due')} ${formatDate(task.task_date)}`}
                  </Text>
                  <Text style={{ color: COLORS.subtext, fontSize: 12 }}>👤 {profileName(task.assigned_to)}</Text>
                </View>

                {task.notes ? (
                  <View style={{ backgroundColor: '#FAFBFD', borderRadius: 10, padding: 10, marginTop: 8 }}>
                    <Text style={{ color: COLORS.text, fontSize: 12 }}>📝 {task.notes}</Text>
                  </View>
                ) : null}
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
