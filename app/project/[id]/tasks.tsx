import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Picker } from '@react-native-picker/picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { SkeletonList } from '../../../components/SkeletonCard'
import { useRealtimeRefetch } from '../../../hooks/useRealtimeRefetch'
import { useLanguage, type TranslationKey } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { SignedImage } from '../../../components/SignedImage'
import { signedUrl } from '../../../lib/storageUrl'
import { COLORS, TOUCH, TYPE } from '../../../lib/theme'

type Status = 'preparation' | 'in_progress' | 'blocked' | 'completed'

const STATUS_CONFIG: Record<Status, { labelKey: TranslationKey; color: string; bg: string }> = {
  preparation: { labelKey: 'statusPreparation', color: '#64748B', bg: '#F1F5F9' },
  blocked:     { labelKey: 'statusBlocked',     color: '#B71C1C', bg: '#FDECEA' },
  in_progress: { labelKey: 'statusInProgress', color: '#E65100', bg: '#FFF3E0' },
  completed:   { labelKey: 'statusCompleted', color: '#2E7D32', bg: '#E8F5E9' },
}

// Sort: in_progress first, then assigned, then completed (overdue is bumped above all in code).
const STATUS_ORDER: Status[] = ['in_progress', 'blocked', 'preparation', 'completed']

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
  // Set when this bar was generated from a job-kit task. Contracted scope, as
  // opposed to something somebody typed in on site.
  source_task_id?: number | null
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

type TaskPhoto = {
  id: number
  task_id: number
  file_path: string
  caption: string | null
  uploaded_by: string | null
  created_at: string
  url: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

// Monday-of-week for the anchor date, and a readable label for it. Lifted from
// the old separate Schedule screen, which is now the "By date" view here.
function weekKeyOf(iso: string | null | undefined): string {
  if (!iso) return '0000-00-00'
  const d = new Date(iso + 'T12:00:00')
  d.setHours(0, 0, 0, 0)
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

export default function ProjectTasksScreen() {
  const { id, task: focusTaskId } = useLocalSearchParams<{ id: string; task?: string }>()
  const router = useRouter()
  const projectId = Number(id)
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isManager, setIsManager] = useState(false)
  const [view, setView] = useState<'list' | 'dates'>('list')
  // A worker opens on their own work; a manager opens on the whole project.
  // Both can switch — the old Schedule screen showed everyone to everyone.
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [photosByTask, setPhotosByTask] = useState<Record<number, TaskPhoto[]>>({})
  const [uploadingTaskId, setUploadingTaskId] = useState<number | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  // The lightbox needs a real uri, so the path is signed on tap rather than
  // for every thumbnail up front.
  const openLightbox = async (path?: string | null) => {
    if (!path) return
    setLightboxUrl(await signedUrl('project-photos', path))
  }

  // Edit modal state
  const [editing, setEditing] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    task_date: '',
    title: '',
    assigned_to: '',
    status: 'preparation' as Status,
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

      const [meResult, projectResult, tasksResult, profilesResult, photosResult] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', session.user.id).single(),
        supabase.from('projects').select('id, name').eq('id', projectId).single(),
        supabase.from('project_tasks')
          .select('id, project_id, task_date, start_date, end_date, title, assigned_to, status, notes, created_by, created_at, updated_at, source_task_id')
          .eq('project_id', projectId),
        supabase.from('profiles').select('id, full_name, role').order('full_name'),
        supabase.from('project_photos')
          .select('id, task_id, file_path, caption, uploaded_by, created_at')
          .eq('project_id', projectId)
          .not('task_id', 'is', null)
          .order('created_at', { ascending: true }),
      ])

      const role = meResult.data?.role || 'worker'
      const manager = ['manager', 'owner'].includes(String(role))
      setIsManager(manager)
      setScope(manager ? 'all' : 'mine')

      if (projectResult.error) { setErrorMessage(projectResult.error.message); setLoading(false); return }
      setProject(projectResult.data as Project)

      if (tasksResult.error) { setErrorMessage(tasksResult.error.message); setLoading(false); return }
      const allTasks = (tasksResult.data || []) as Task[]
      // Everything is held; Mine/All decides what is shown. This screen now
      // does the job the separate Schedule screen used to, and that one showed
      // the whole project to everybody.
      const visible = allTasks
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

      const grouped: Record<number, TaskPhoto[]> = {}
      for (const p of (photosResult?.data || [])) {
        // Keep the path; SignedImage mints the url when the row renders.
        const list = grouped[p.task_id] || (grouped[p.task_id] = [])
        list.push({ ...p, url: p.file_path } as TaskPhoto)
      }
      setPhotosByTask(grouped)
    } catch (e: any) {
      setErrorMessage(e?.message || t('failedToLoadTasks'))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  // Arriving from the home screen's My Tasks with ?task=<id>: open that task in
  // the editor as if it had been tapped here, so there is one task screen with
  // one set of rules rather than a second half-editor on the dashboard.
  const [focusHandled, setFocusHandled] = useState(false)
  useEffect(() => {
    if (focusHandled || !focusTaskId || tasks.length === 0) return
    const target = tasks.find(x => String(x.id) === String(focusTaskId))
    if (target) openEdit(target)
    setFocusHandled(true)
  }, [focusTaskId, tasks, focusHandled])

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

  async function pickAndUploadPhoto(task: Task) {
    try {
      // Ask for camera + library access. Workers usually want camera; show
      // both options so they can also grab a photo from their roll.
      const choice = await new Promise<'camera' | 'library' | null>(resolve => {
        Alert.alert('Add photo', 'Pick a source', [
          { text: 'Camera',   onPress: () => resolve('camera') },
          { text: 'Library',  onPress: () => resolve('library') },
          { text: 'Cancel',   style: 'cancel', onPress: () => resolve(null) },
        ])
      })
      if (!choice) return

      let result: ImagePicker.ImagePickerResult
      if (choice === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync()
        if (!perm.granted) { Alert.alert('Camera access required.'); return }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!perm.granted) { Alert.alert('Photo library access required.'); return }
        // Let the crew pick several photos in one go.
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true })
      }
      if (result.canceled || !result.assets?.length) return
      const assets = result.assets

      setUploadingTaskId(task.id)
      let ok = 0
      const fails: string[] = []
      for (const asset of assets) {
        try {
          const ext = (asset.fileName?.split('.').pop() || asset.uri.split('.').pop() || 'jpg').toLowerCase()
          const fileName = `task-${task.id}-${Date.now()}-${ok + fails.length}.${ext}`
          const filePath = `project-${task.project_id}/tasks/${task.id}/${fileName}`

          const fileResp = await fetch(asset.uri)
          if (!fileResp.ok) throw new Error('Could not read photo file.')
          const arrayBuffer = await fileResp.arrayBuffer()

          const { error: upErr } = await supabase.storage
            .from('project-photos')
            .upload(filePath, arrayBuffer, { contentType: asset.mimeType || 'image/jpeg', upsert: false })
          if (upErr) throw new Error(upErr.message)

          const fileUrl = supabase.storage.from('project-photos').getPublicUrl(filePath).data.publicUrl
          const { error: dbErr } = await supabase.from('project_photos').insert({
            project_id: task.project_id,
            task_id: task.id,
            file_path: filePath,
            file_url: fileUrl,
            uploaded_by: currentUserId,
          })
          if (dbErr) {
            // Best-effort cleanup of the orphaned object on row failure.
            await supabase.storage.from('project-photos').remove([filePath]).catch(() => {})
            throw new Error(dbErr.message)
          }
          ok++
        } catch (e: any) {
          fails.push(e?.message || 'Unknown error')
        }
      }
      await load()
      // Confirm completion so the crew knows the upload finished.
      if (ok > 0 && fails.length === 0) Alert.alert('Upload complete', `${ok} photo${ok === 1 ? '' : 's'} added.`)
      else if (ok > 0) Alert.alert('Upload complete', `${ok} added, ${fails.length} failed.`)
      else Alert.alert('Photo upload failed', fails[0] || 'Unknown error')
    } catch (e: any) {
      Alert.alert('Photo upload failed', e?.message || 'Unknown error')
    } finally {
      setUploadingTaskId(null)
    }
  }

  function confirmDeletePhoto(photo: TaskPhoto) {
    Alert.alert('Delete photo?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.storage.from('project-photos').remove([photo.file_path]).catch(() => {})
          const { error } = await supabase.from('project_photos').delete().eq('id', photo.id)
          if (error) { Alert.alert('Delete failed', error.message); return }
          await load()
        },
      },
    ])
  }

  function openCreate() {
    setForm({
      task_date: new Date().toISOString().split('T')[0],
      title: '',
      assigned_to: '',
      status: 'preparation',
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

  // Mine/All is a filter, By-date is a grouping. Building one row list from
  // both keeps the card markup below written once — the alternative was a
  // second copy of it that would drift.
  const scoped = scope === 'mine'
    ? tasks.filter(x => x.assigned_to === currentUserId)
    : tasks
  type Row = { key: string; header?: string; task?: Task }
  const rows: Row[] = view === 'list'
    ? scoped.map(x => ({ key: `t${x.id}`, task: x }))
    : (() => {
        const byWeek = new Map<string, Task[]>()
        const ordered = [...scoped].sort((a, b) => {
          const ai = a.start_date || a.task_date || ''
          const bi = b.start_date || b.task_date || ''
          if (!ai && !bi) return a.id - b.id
          if (!ai) return 1
          if (!bi) return -1
          return ai.localeCompare(bi)
        })
        for (const x of ordered) {
          const k = weekKeyOf(x.start_date || x.task_date)
          if (!byWeek.has(k)) byWeek.set(k, [])
          byWeek.get(k)!.push(x)
        }
        const out: Row[] = []
        for (const [k, list] of byWeek) {
          out.push({ key: `h${k}`, header: weekLabel(k) })
          for (const x of list) out.push({ key: `t${x.id}`, task: x })
        }
        return out
      })()


  if (loading) {
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
          <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '800', marginBottom: 6 }}>
            {project?.name || t('project')}
          </Text>
          <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
            {scope === 'mine' ? t('tasksAssignedToYou') : t('allTasksForProject')}
          </Text>
        </View>

        {/* View and scope. This screen replaced the separate Schedule tile, so it
            has to answer both "what is on me" and "what is everyone doing, and
            when" without being two screens again. */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {([['list', t('listView')], ['dates', t('byDateView')]] as const).map(([k, label]) => (
            <Pressable key={k} onPress={() => setView(k as 'list' | 'dates')}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: view === k ? COLORS.navy : COLORS.card, borderWidth: 1, borderColor: view === k ? COLORS.navy : COLORS.border }}>
              <Text style={{ color: view === k ? COLORS.white : COLORS.subtext, fontWeight: '800' }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {([['mine', t('scopeMine')], ['all', t('scopeEveryone')]] as const).map(([k, label]) => (
            <Pressable key={k} onPress={() => setScope(k as 'mine' | 'all')}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', backgroundColor: scope === k ? COLORS.tealSoft : COLORS.card, borderWidth: 1, borderColor: scope === k ? COLORS.teal : COLORS.border }}>
              <Text style={{ color: scope === k ? COLORS.teal : COLORS.subtext, fontWeight: '800' }}>
                {label} ({k === 'mine' ? tasks.filter(x => x.assigned_to === currentUserId).length : tasks.length})
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Anyone may add a task. The insert stamps created_by, which is what
            the row policy checks, and a worker can only ever delete one they
            created. */}
        {(
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

        {rows.length === 0 ? (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, padding: 24 }}>
            <Text style={{ color: COLORS.subtext, textAlign: 'center' }}>
              {scope === 'mine' ? t('noTasksWorker') : t('noTasksManager')}
            </Text>
          </View>
        ) : (
          rows.map(row => {
            if (row.header) {
              return (
                <Text key={row.key} style={{ color: COLORS.subtext, fontWeight: '800', fontSize: 12, letterSpacing: 0.4, marginTop: 6, marginBottom: 6 }}>
                  {row.header.toUpperCase()}
                </Text>
              )
            }
            const task = row.task!
            const cfg = STATUS_CONFIG[task.status]
            const editable = canEdit(task)
            const overdue = isTaskOverdue(task)
            return (
              <Pressable
                key={row.key}
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

                {/* Contracted scope reads differently from something typed in on
                    site: one is work you are being paid for, the other usually
                    is not. The bar knows which it is; the crew could not tell. */}
                {task.source_task_id ? (
                  <View style={{ alignSelf: 'flex-start', backgroundColor: '#FFF3E0', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialCommunityIcons name="package-variant-closed" size={12} color="#E65100" />
                    <Text style={{ color: '#E65100', fontSize: 11, fontWeight: '800' }}>{t('fromJobKit')}</Text>
                  </View>
                ) : null}

                {task.notes ? (
                  <View style={{ backgroundColor: '#FAFBFD', borderRadius: 10, padding: 12, marginTop: 6 }}>
                    <Text style={{ color: COLORS.subtext, fontSize: TYPE.body, lineHeight: 22 }}>📝 {task.notes}</Text>
                  </View>
                ) : null}

                {(photosByTask[task.id]?.length || 0) > 0 || canEdit(task) ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginTop: 10 }}
                    contentContainerStyle={{ gap: 8, paddingRight: 4 }}
                  >
                    {(photosByTask[task.id] || []).map(p => {
                      const canDelete = isManager || p.uploaded_by === currentUserId
                      return (
                        <Pressable
                          key={p.id}
                          onPress={() => openLightbox(p.file_path)}
                          onLongPress={canDelete ? () => confirmDeletePhoto(p) : undefined}
                          style={{ width: 84, height: 84, borderRadius: 10, overflow: 'hidden', backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border }}
                        >
                          <SignedImage bucket="project-photos" value={p.file_path} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        </Pressable>
                      )
                    })}
                    {canEdit(task) && (
                      <Pressable
                        onPress={() => pickAndUploadPhoto(task)}
                        disabled={uploadingTaskId === task.id}
                        style={{ width: 84, height: 84, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.teal, backgroundColor: COLORS.tealSoft, alignItems: 'center', justifyContent: 'center' }}
                      >
                        {uploadingTaskId === task.id ? (
                          <ActivityIndicator color={COLORS.teal} />
                        ) : (
                          <>
                            <MaterialCommunityIcons name="camera-plus-outline" size={26} color={COLORS.teal} />
                            <Text style={{ color: COLORS.teal, fontSize: 11, fontWeight: '800', marginTop: 4 }}>Add Photo</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </ScrollView>
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
                  {(isManager || task.created_by === currentUserId) && (
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
                  <Picker.Item label={t('unassignedOption')} value="" />
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

      <Modal visible={!!lightboxUrl} transparent animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
        <Pressable
          onPress={() => setLightboxUrl(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
        >
          {lightboxUrl && (
            <Image source={{ uri: lightboxUrl }} style={{ width: '100%', height: '70%', resizeMode: 'contain' }} />
          )}
          <Pressable
            onPress={() => setLightboxUrl(null)}
            style={{ marginTop: 24, backgroundColor: COLORS.white, paddingHorizontal: 26, paddingVertical: 14, borderRadius: 100, minHeight: TOUCH.minHeight, justifyContent: 'center' }}
          >
            <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: TYPE.bodyBold }}>Close</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
