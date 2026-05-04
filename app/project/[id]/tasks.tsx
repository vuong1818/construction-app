import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Picker } from '@react-native-picker/picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import DatePickerField from '../../../components/DatePickerField'
import PickerWrap from '../../../components/PickerWrap'
import { useRealtimeRefetch } from '../../../hooks/useRealtimeRefetch'
import { useLanguage, type TranslationKey } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { COLORS, TOUCH, TYPE } from '../../../lib/theme'

type Status = 'assigned' | 'in_progress' | 'completed'

const STATUS_CONFIG: Record<Status, { labelKey: TranslationKey; color: string; bg: string }> = {
  assigned:    { labelKey: 'statusAssigned',   color: '#1565C0', bg: '#E3F2FD' },
  in_progress: { labelKey: 'statusInProgress', color: '#E65100', bg: '#FFF3E0' },
  completed:   { labelKey: 'statusCompleted', color: '#2E7D32', bg: '#E8F5E9' },
}

// Sort: in_progress first, then assigned, then completed (overdue is bumped above all in code).
const STATUS_ORDER: Status[] = ['in_progress', 'assigned', 'completed']

const OVERDUE_BADGE = { color: '#C62828', bg: '#FFEBEE' }

export function isTaskOverdue(t: { task_date: string | null; end_date?: string | null; status: Status }): boolean {
  if (t.status === 'completed') return false
  const ref = t.end_date || t.task_date
  if (!ref) return false
  return new Date(ref + 'T23:59:59') < new Date()
}

type Task = {
  id: number
  project_id: number
  task_date: string | null
  start_date: string | null
  end_date: string | null
  title: string
  assigned_to: string | null
  status: Status
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type Profile = {
  id: string
  full_name: string | null
  role: string | null
}

type Project = {
  id: number
  name: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export default function ProjectTasksScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const projectId = Number(id)
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isManager, setIsManager] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])

  // Edit modal state
  const [editing, setEditing] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    task_date: '',
    title: '',
    assigned_to: '',
    status: 'assigned' as Status,
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!Number.isFinite(projectId)) {
      setErrorMessage(t('invalidProject'))
      setLoading(false)
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setErrorMessage(t('mustBeSignedIn')); setLoading(false); return }
      setCurrentUserId(session.user.id)

      const [meResult, projectResult, tasksResult, profilesResult] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', session.user.id).single(),
        supabase.from('projects').select('id, name').eq('id', projectId).single(),
        supabase.from('project_tasks')
          .select('id, project_id, task_date, start_date, end_date, title, assigned_to, status, notes, created_by, created_at, updated_at')
          .eq('project_id', projectId),
        supabase.from('profiles').select('id, full_name, role').order('full_name'),
      ])

      const role = meResult.data?.role || 'worker'
      const manager = role === 'manager'
      setIsManager(manager)

      if (projectResult.error) { setErrorMessage(projectResult.error.message); setLoading(false); return }
      setProject(projectResult.data as Project)

      if (tasksResult.error) { setErrorMessage(tasksResult.error.message); setLoading(false); return }
      const allTasks = (tasksResult.data || []) as Task[]
      // Workers only see tasks assigned to them; managers see all
      const visible = manager ? allTasks : allTasks.filter(task => task.assigned_to === session.user.id)
      // Sort: status priority, then by scheduled start (start_date if set,
      // falling back to task_date) so the list reads as a project schedule.
      visible.sort((a, b) => {
        const oa = isTaskOverdue(a) ? -1 : 0
        const ob = isTaskOverdue(b) ? -1 : 0
        if (oa !== ob) return oa - ob
        const sa = STATUS_ORDER.indexOf(a.status)
        const sb = STATUS_ORDER.indexOf(b.status)
        if (sa !== sb) return sa - sb
        const da = a.start_date || a.task_date || ''
        const db = b.start_date || b.task_date || ''
        return da.localeCompare(db)
      })
      setTasks(visible)

      if (profilesResult.data) setProfiles(profilesResult.data as Profile[])
    } catch (e: any) {
      setErrorMessage(e?.message || t('failedToLoadTasks'))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  // Live updates when tasks change for this project
  useRealtimeRefetch(
    'project_tasks',
    load,
    Number.isFinite(projectId) ? `project_id=eq.${projectId}` : undefined,
    Number.isFinite(projectId),
  )

  function profileName(uid: string | null) {
    const p = profiles.find(x => x.id === uid)
    return p?.full_name || (uid ? t('unknown') : '—')
  }

  function canEdit(task: Task) {
    return isManager || task.assigned_to === currentUserId
  }

  function openCreate() {
    setForm({
      task_date: new Date().toISOString().split('T')[0],
      title: '',
      assigned_to: '',
      status: 'assigned',
      notes: '',
    })
    setCreating(true)
  }

  function openEdit(task: Task) {
    setForm({
      task_date: task.task_date || '',
      title: task.title || '',
      assigned_to: task.assigned_to || '',
      status: task.status,
      notes: task.notes || '',
    })
    setEditing(task)
  }

  function closeForm() {
    setCreating(false)
    setEditing(null)
  }

  async function save() {
    if (!form.title.trim()) {
      Alert.alert(t('missing'), t('taskTitleRequired'))
      return
    }
    if (form.task_date && !DATE_RE.test(form.task_date)) {
      Alert.alert(t('invalidDate'), t('invalidDateOrBlank'))
      return
    }

    setSaving(true)
    try {
      if (editing) {
        // Workers may only update status + notes; managers may update anything.
        const payload = isManager
          ? {
              task_date: form.task_date.trim() || null,
              title: form.title.trim(),
              assigned_to: form.assigned_to || null,
              status: form.status,
              notes: form.notes.trim() || null,
            }
          : {
              status: form.status,
              notes: form.notes.trim() || null,
            }
        const { error } = await supabase.from('project_tasks').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('project_tasks').insert({
          project_id: projectId,
          task_date: form.task_date.trim() || null,
          title: form.title.trim(),
          assigned_to: form.assigned_to || null,
          status: form.status,
          notes: form.notes.trim() || null,
          created_by: currentUserId,
        })
        if (error) throw error
      }

      closeForm()
      load()
    } catch (e: any) {
      Alert.alert(t('saveFailed'), e?.message || t('couldNotSaveTask'))
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete(task: Task) {
    Alert.alert(
      t('deleteTask'),
      t('deleteTaskConfirm', { title: task.title }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'), style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('project_tasks').delete().eq('id', task.id)
            if (error) {
              Alert.alert(t('deleteFailed'), error.message)
              return
            }
            load()
          },
        },
      ],
    )
  }

  const editingFieldsLocked = !!(editing && !isManager)

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>{t('loadingTasks')}</Text>
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
          <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '800', marginBottom: 6 }}>
            {project?.name || t('project')}
          </Text>
          <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
            {isManager ? t('allTasksForProject') : t('tasksAssignedToYou')}
          </Text>
        </View>

        {isManager && (
          <Pressable
            onPress={openCreate}
            style={{
              backgroundColor: COLORS.teal,
              borderRadius: 18,
              paddingVertical: 16,
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 16 }}>
              {t('addTask')}
            </Text>
          </Pressable>
        )}

        {tasks.length === 0 ? (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, padding: 24 }}>
            <Text style={{ color: COLORS.subtext, textAlign: 'center' }}>
              {isManager ? t('noTasksManager') : t('noTasksWorker')}
            </Text>
          </View>
        ) : (
          tasks.map(task => {
            const cfg = STATUS_CONFIG[task.status]
            const editable = canEdit(task)
            const overdue = isTaskOverdue(task)
            return (
              <Pressable
                key={task.id}
                onPress={() => editable && openEdit(task)}
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
                    <Text style={{ color: cfg.color, fontWeight: '800', fontSize: 11, letterSpacing: 0.5 }}>
                      {t(cfg.labelKey).toUpperCase()}
                    </Text>
                  </View>
                  {overdue && (
                    <View style={{ backgroundColor: OVERDUE_BADGE.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
                      <Text style={{ color: OVERDUE_BADGE.color, fontWeight: '800', fontSize: 11, letterSpacing: 0.5 }}>
                        {`⚠ ${t('overdue').toUpperCase()}`}
                      </Text>
                    </View>
                  )}
                  <Text style={{ color: overdue ? OVERDUE_BADGE.color : COLORS.subtext, fontSize: 12, fontWeight: overdue ? '700' : '400' }}>
                    {(() => {
                      const s = task.start_date || task.task_date
                      const e = task.end_date
                      if (s && e && e !== s) return `📅 ${formatDate(s)} → ${formatDate(e)}`
                      if (s) return `📅 ${t('due')} ${formatDate(s)}`
                      return `📅 ${t('due')} —`
                    })()}
                  </Text>
                  {isManager && (
                    <Text style={{ color: COLORS.subtext, fontSize: 12 }}>👤 {profileName(task.assigned_to)}</Text>
                  )}
                </View>

                <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 6 }}>
                  {task.title}
                </Text>

                {task.notes ? (
                  <View style={{ backgroundColor: '#FAFBFD', borderRadius: 10, padding: 12, marginTop: 6 }}>
                    <Text style={{ color: COLORS.subtext, fontSize: TYPE.body, lineHeight: 22 }}>📝 {task.notes}</Text>
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
                  {editable && (
                    <Pressable
                      onPress={() => openEdit(task)}
                      style={{ backgroundColor: COLORS.tealSoft, paddingHorizontal: TOUCH.pillPaddingH, paddingVertical: TOUCH.pillPaddingV, minHeight: TOUCH.minHeight, borderRadius: 12, justifyContent: 'center' }}
                    >
                      <Text style={{ color: COLORS.teal, fontWeight: '700', fontSize: TYPE.bodyBold }}>
                        {isManager ? t('edit') : t('update')}
                      </Text>
                    </Pressable>
                  )}
                  {isManager && (
                    <Pressable
                      onPress={() => confirmDelete(task)}
                      style={{ backgroundColor: COLORS.redSoft, paddingHorizontal: TOUCH.pillPaddingH, paddingVertical: TOUCH.pillPaddingV, minHeight: TOUCH.minHeight, borderRadius: 12, justifyContent: 'center' }}
                    >
                      <Text style={{ color: COLORS.red, fontWeight: '700', fontSize: TYPE.bodyBold }}>{t('delete')}</Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            )
          })
        )}
      </ScrollView>

      {/* Edit / Create modal */}
      <Modal
        visible={!!(editing || creating)}
        transparent
        animationType="slide"
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' }}
        >
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, maxHeight: '92%' }}>
            <ScrollView
              contentContainerStyle={{ padding: 22, paddingBottom: 60 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ color: COLORS.navy, fontSize: 20, fontWeight: '800' }}>
                  {editing ? (editingFieldsLocked ? t('updateTask') : t('editTask')) : t('newTask')}
                </Text>
                <Pressable onPress={closeForm} hitSlop={10} style={{ padding: 4 }}>
                  <MaterialCommunityIcons name="close" size={26} color={COLORS.subtext} />
                </Pressable>
              </View>

              {/* Due Date */}
              <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 6 }}>{t('dueDateLabel')}</Text>
              {editingFieldsLocked ? (
                <Text style={{ color: COLORS.text, marginBottom: 16 }}>{formatDate(form.task_date)}</Text>
              ) : (
                <DatePickerField
                  value={form.task_date}
                  onChange={(iso) => setForm({ ...form, task_date: iso })}
                  allowClear
                />
              )}

              {/* Task title */}
              <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 6 }}>{`${t('taskTitle')} *`}</Text>
              {editingFieldsLocked ? (
                <Text style={{ color: COLORS.text, fontWeight: '700', marginBottom: 16 }}>{form.title}</Text>
              ) : (
                <TextInput
                  value={form.title}
                  onChangeText={(text) => setForm({ ...form, title: text })}
                  placeholder={t('taskTitlePlaceholder')}
                  placeholderTextColor={COLORS.subtext}
                  multiline
                  style={{
                    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14,
                    paddingHorizontal: 14, paddingVertical: 12, color: COLORS.text, marginBottom: 16, minHeight: 60,
                    textAlignVertical: 'top',
                  }}
                />
              )}

              {/* Assigned worker */}
              <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 6 }}>{t('assignedTo')}</Text>
              {editingFieldsLocked ? (
                <Text style={{ color: COLORS.text, marginBottom: 16 }}>{profileName(form.assigned_to)}</Text>
              ) : (
                <PickerWrap
                  selectedValue={form.assigned_to}
                  onValueChange={(value) => setForm({ ...form, assigned_to: String(value ?? '') })}
                >
                  <Picker.Item label={t('unassigned')} value="" />
                  {profiles.map(p => (
                    <Picker.Item
                      key={p.id}
                      label={`${p.full_name || t('unnamed')}${p.role === 'manager' ? t('managerSuffix') : ''}`}
                      value={p.id}
                    />
                  ))}
                </PickerWrap>
              )}

              {/* Status */}
              <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 8 }}>{t('status')}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {STATUS_ORDER.map(s => {
                  const cfg = STATUS_CONFIG[s]
                  const active = form.status === s
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setForm({ ...form, status: s })}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 100,
                        backgroundColor: active ? cfg.color : cfg.bg,
                        borderWidth: 1, borderColor: cfg.color,
                      }}
                    >
                      <Text style={{ color: active ? COLORS.white : cfg.color, fontWeight: '700', fontSize: 13 }}>
                        {t(cfg.labelKey)}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              {/* Notes */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ color: COLORS.navy, fontWeight: '700' }}>{t('notes')}</Text>
                {form.notes.length > 0 && (
                  <Pressable onPress={() => setForm({ ...form, notes: '' })}>
                    <Text style={{ color: COLORS.red, fontWeight: '700', fontSize: 13 }}>{t('clearNote')}</Text>
                  </Pressable>
                )}
              </View>
              <TextInput
                value={form.notes}
                onChangeText={(text) => setForm({ ...form, notes: text })}
                placeholder={editingFieldsLocked ? t('addNoteForManager') : t('optionalNotes')}
                placeholderTextColor={COLORS.subtext}
                multiline
                style={{
                  backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14,
                  paddingHorizontal: 14, paddingVertical: 12, color: COLORS.text, minHeight: 100,
                  textAlignVertical: 'top', marginBottom: 18,
                }}
              />

              {/* Actions */}
              <View style={{ gap: 10 }}>
                <Pressable
                  onPress={save}
                  disabled={saving}
                  style={{
                    backgroundColor: saving ? '#94A3B8' : COLORS.navy,
                    borderRadius: 18, paddingVertical: 16, alignItems: 'center',
                  }}
                >
                  <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 16 }}>
                    {saving ? t('saving') : editing ? t('save') : t('addTaskShort')}
                  </Text>
                </Pressable>
                <Pressable onPress={closeForm} style={{ borderRadius: 18, paddingVertical: 14, alignItems: 'center' }}>
                  <Text style={{ color: COLORS.subtext, fontWeight: '700', fontSize: 15 }}>{t('cancel')}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}
