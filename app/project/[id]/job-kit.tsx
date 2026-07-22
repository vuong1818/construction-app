import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WEB_BASE } from '../../../lib/config'
import { useLanguage } from '../../../lib/i18n'
import { isManagerRole } from '../../../lib/roles'
import { supabase } from '../../../lib/supabase'
import { COLORS } from '../../../lib/theme'

const JOBKIT_BUCKET = 'jobkit-photos'
// Install phases a step can be tagged with (matches the web editor + report route).
const PHASE_ORDER = ['Underground', 'Rough-in', 'Trim', 'Cutover', 'Final']

// A Job Kit is a per-project scope: Steps → Tasks (with materials + labor) + Tools.
// The crew checks off TASKS as they complete them; the materials list is the aggregated
// pull list from every task. Tools route through inventory check-out.
type Kit = { id: number; title: string | null; scope_of_work: string | null; module_type: string | null }
type Tool = { id: number; project_playbook_id: number; name: string; qty: number | null; unit: string | null; equipment_id: number | null }
type Step = { id: number; project_playbook_id: number; title: string | null; category: string | null; sort_order: number | null }
type Task = { id: number; step_id: number; label: string | null; description: string | null; qty: number | null; notes: string | null }
type TaskMat = { task_id: number; description: string | null; unit: string | null; qty: number | null; line_type: string | null }
type TaskPhoto = { id: number; step_check_id: number; photo_url: string; storage_path: string | null; uploaded_by: string | null }
// Org job-kit templates a manager can drop onto this project (add_playbook_to_project).
type Template = { id: number; title: string | null; module_type: string | null }

export default function JobKitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const projectId = Number(id)
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [kits, setKits] = useState<Kit[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskMats, setTaskMats] = useState<TaskMat[]>([])
  const [taskPhotos, setTaskPhotos] = useState<Map<number, TaskPhoto[]>>(new Map())
  const [checks, setChecks] = useState<Set<string>>(new Set())
  const [uid, setUid] = useState<string | null>(null)
  const [busyPhotoTask, setBusyPhotoTask] = useState<number | null>(null)
  const [isManager, setIsManager] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [pickerVisible, setPickerVisible] = useState(false)
  const [addingTpl, setAddingTpl] = useState(false)
  // Steps collapsed to a one-line summary so a long kit can be scanned at a glance.
  const [collapsedSteps, setCollapsedSteps] = useState<Set<number>>(new Set())
  const toggleStepCollapsed = (stepId: number) =>
    setCollapsedSteps(prev => { const n = new Set(prev); n.has(stepId) ? n.delete(stepId) : n.add(stepId); return n })

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const myId = session?.user?.id || null
    setUid(myId)
    let mgr = false
    if (myId) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', myId).single()
      mgr = isManagerRole((prof as any)?.role)
      setIsManager(mgr)
    }
    if (mgr) {
      const { data: tpl } = await supabase.from('playbooks').select('id, title, module_type').order('title')
      setTemplates((tpl as Template[]) || [])
    }

    const { data: k } = await supabase
      .from('project_playbooks').select('id, title, scope_of_work, module_type')
      .eq('project_id', projectId).order('created_at', { ascending: false })
    const kitList = (k as Kit[]) || []
    setKits(kitList)

    if (!kitList.length) {
      setTools([]); setSteps([]); setTasks([]); setTaskMats([]); setChecks(new Set()); setLoading(false); return
    }
    const ids = kitList.map(x => x.id)
    const [{ data: tl }, { data: sp }, { data: ck }] = await Promise.all([
      supabase.from('project_playbook_tools').select('id, project_playbook_id, name, qty, unit, equipment_id').in('project_playbook_id', ids).order('sort_order'),
      supabase.from('project_playbook_steps').select('id, project_playbook_id, title, category, sort_order').in('project_playbook_id', ids).order('sort_order'),
      supabase.from('project_playbook_checks').select('item_type, item_id').in('project_playbook_id', ids),
    ])
    setTools((tl as Tool[]) || [])
    const stepList = (sp as Step[]) || []
    setSteps(stepList)
    setChecks(new Set(((ck as any[]) || []).map(c => `${c.item_type}:${c.item_id}`)))

    const stepIds = stepList.map(s => s.id)
    if (stepIds.length) {
      const { data: tk } = await supabase.from('project_playbook_step_checks').select('id, step_id, label, description, qty, notes').in('step_id', stepIds).order('sort_order')
      const taskList = (tk as Task[]) || []
      setTasks(taskList)
      const taskIds = taskList.map(x => x.id)
      if (taskIds.length) {
        const [{ data: tm }, { data: ph }] = await Promise.all([
          supabase.from('task_materials').select('task_id, description, unit, qty, line_type').in('task_id', taskIds),
          supabase.from('project_playbook_task_photos').select('id, step_check_id, photo_url, storage_path, uploaded_by').in('step_check_id', taskIds).order('created_at'),
        ])
        setTaskMats((tm as TaskMat[]) || [])
        const pm = new Map<number, TaskPhoto[]>()
        ;((ph as TaskPhoto[]) || []).forEach(p => pm.set(p.step_check_id, [...(pm.get(p.step_check_id) || []), p]))
        setTaskPhotos(pm)
      } else { setTaskMats([]); setTaskPhotos(new Map()) }
    } else { setTasks([]); setTaskMats([]); setTaskPhotos(new Map()) }
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function toggleTask(kitId: number, taskId: number) {
    const key = `step_check:${taskId}`
    const has = checks.has(key)
    setChecks(prev => { const n = new Set(prev); has ? n.delete(key) : n.add(key); return n })
    const { error } = has
      ? await supabase.from('project_playbook_checks').delete().eq('project_playbook_id', kitId).eq('item_type', 'step_check').eq('item_id', taskId)
      : await supabase.from('project_playbook_checks').insert({ project_playbook_id: kitId, item_type: 'step_check', item_id: taskId, checked_by: uid })
    if (error) load()
  }

  // ── Task photos: pick from camera/library → jobkit-photos bucket → row (mirrors to project photo pot) ──
  async function runPicker(source: 'camera' | 'library'): Promise<{ url: string; path: string }[]> {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { Alert.alert(t('permissionNeeded'), source === 'camera' ? t('allowCamera') : t('allowPhotos')); return [] }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true })
    if (result.canceled || !result.assets?.length) return []
    const out: { url: string; path: string }[] = []
    let i = 0
    for (const asset of result.assets) {
      const resp = await fetch(asset.uri)
      const buf = await resp.arrayBuffer()
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase()
      const path = `${projectId}/${Date.now()}-${i++}.${ext}`
      const { error } = await supabase.storage.from(JOBKIT_BUCKET).upload(path, buf, { contentType: asset.mimeType || 'image/jpeg', upsert: false })
      if (error) throw error
      out.push({ url: supabase.storage.from(JOBKIT_BUCKET).getPublicUrl(path).data.publicUrl, path })
    }
    return out
  }
  async function addTaskPhoto(taskId: number) {
    Alert.alert(t('jkAddPhoto'), undefined, [
      { text: t('takePhoto'), onPress: () => doAddTaskPhoto(taskId, 'camera') },
      { text: t('chooseFromLibrary'), onPress: () => doAddTaskPhoto(taskId, 'library') },
      { text: t('cancel'), style: 'cancel' },
    ])
  }
  async function doAddTaskPhoto(taskId: number, source: 'camera' | 'library') {
    setBusyPhotoTask(taskId)
    try {
      const ups = await runPicker(source)
      if (!ups.length) return
      const rows: TaskPhoto[] = []
      for (const up of ups) {
        const { data, error } = await supabase.from('project_playbook_task_photos')
          .insert({ step_check_id: taskId, photo_url: up.url, storage_path: up.path, uploaded_by: uid })
          .select('id, step_check_id, photo_url, storage_path, uploaded_by').single()
        if (error) throw error
        rows.push(data as TaskPhoto)
      }
      setTaskPhotos(prev => { const m = new Map(prev); m.set(taskId, [...(m.get(taskId) || []), ...rows]); return m })
      Alert.alert(t('uploadComplete'), `${rows.length} ${t('photosAdded')}`)
    } catch (e: any) {
      Alert.alert(t('uploadFailed'), e.message || String(e))
    } finally { setBusyPhotoTask(null) }
  }
  function confirmRemovePhoto(photo: TaskPhoto) {
    Alert.alert(t('jkRemovePhoto'), undefined, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('remove'), style: 'destructive', onPress: () => removeTaskPhoto(photo) },
    ])
  }
  async function removeTaskPhoto(photo: TaskPhoto) {
    const { error } = await supabase.from('project_playbook_task_photos').delete().eq('id', photo.id)
    if (error) { Alert.alert(t('saveFailed'), error.message); return }
    if (photo.storage_path) await supabase.storage.from(JOBKIT_BUCKET).remove([photo.storage_path]).catch(() => {})
    setTaskPhotos(prev => { const m = new Map(prev); m.set(photo.step_check_id, (m.get(photo.step_check_id) || []).filter(p => p.id !== photo.id)); return m })
  }

  // Export a step (its tasks + photos) as a print-ready PDF — opens the server
  // doc endpoint in the browser, where the OS "Save as PDF" / share sheet takes over.
  async function exportStep(stepId: number) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { Alert.alert(t('saveFailed'), t('notAuthenticatedShort')); return }
    const url = `${WEB_BASE}/api/portal/step-doc?token=${encodeURIComponent(token)}&step=${stepId}`
    Linking.openURL(url).catch(() => Alert.alert(t('saveFailed'), t('couldNotOpen')))
  }

  // Export the job kit report (jobsite header + steps/tasks/notes/photos + materials
  // + tools). Pass a phase (step category) to print just that phase's steps. Opens in
  // the browser's Save-as-PDF / share sheet.
  async function exportKitReport(kitId: number, phase?: string) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { Alert.alert(t('saveFailed'), t('notAuthenticatedShort')); return }
    const q = phase ? `&phase=${encodeURIComponent(phase)}` : ''
    const url = `${WEB_BASE}/api/portal/kit-doc?token=${encodeURIComponent(token)}&pp=${kitId}${q}`
    Linking.openURL(url).catch(() => Alert.alert(t('saveFailed'), t('couldNotOpen')))
  }
  // Offer the whole kit or a single phase (the phases present on this kit's steps).
  function chooseKitReport(kitId: number) {
    const present = PHASE_ORDER.filter(p => steps.some(s => s.project_playbook_id === kitId && s.category === p))
    if (!present.length) { exportKitReport(kitId); return }
    Alert.alert(t('jkReport'), t('jkReportChoose'), [
      { text: t('jkWholeKit'), onPress: () => exportKitReport(kitId) },
      ...present.map(p => ({ text: p, onPress: () => exportKitReport(kitId, p) })),
      { text: t('cancel'), style: 'cancel' as const },
    ])
  }

  async function saveTaskNote(task: Task, note: string) {
    if (note === (task.notes || '')) return
    const { error } = await supabase.rpc('set_task_note', { p_task_id: task.id, p_note: note })
    if (error) { Alert.alert(t('saveFailed'), error.message); return }
    setTasks(prev => prev.map(x => x.id === task.id ? { ...x, notes: note } : x))
  }

  async function toggleTool(tool: Tool) {
    const key = `tool:${tool.id}`
    const has = checks.has(key)
    setChecks(prev => { const n = new Set(prev); has ? n.delete(key) : n.add(key); return n })
    const { error } = has
      ? await supabase.rpc('checkin_kit_tool', { p_tool_id: tool.id })
      : await supabase.rpc('checkout_kit_tool', { p_tool_id: tool.id })
    if (error) load()
  }

  // ── Manager editing: add/edit/delete kits, steps, tasks ─────────────────────
  const nextSort = (arr: { sort_order: number | null }[]) => (arr.length ? Math.max(...arr.map(x => x.sort_order || 0)) + 1 : 0)

  async function addKit() {
    const { data, error } = await supabase.from('project_playbooks')
      .insert({ project_id: projectId, title: t('jkNewKit') }).select('id, title, scope_of_work, module_type').single()
    if (error) { Alert.alert(t('saveFailed'), error.message); return }
    setKits(prev => [data as Kit, ...prev])
  }
  // Deep-copy an org template's full tree (steps/tasks/materials/tools) onto this project.
  async function addFromTemplate(playbookId: number) {
    setAddingTpl(true)
    const { error } = await supabase.rpc('add_playbook_to_project', { p_project_id: projectId, p_playbook_id: playbookId })
    setAddingTpl(false)
    if (error) { Alert.alert(t('saveFailed'), error.message); return }
    setPickerVisible(false)
    load()
  }
  async function updateKit(kitId: number, patch: Partial<Kit>) {
    setKits(prev => prev.map(k => k.id === kitId ? { ...k, ...patch } : k))
    const { error } = await supabase.from('project_playbooks').update(patch).eq('id', kitId)
    if (error) Alert.alert(t('saveFailed'), error.message)
  }
  function deleteKit(kit: Kit) {
    Alert.alert(t('jkDeleteKit'), t('jkDeleteKitMsg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('project_playbooks').delete().eq('id', kit.id)
        if (error) { Alert.alert(t('saveFailed'), error.message); return }
        load()
      } },
    ])
  }
  async function addStep(kitId: number) {
    const siblings = steps.filter(s => s.project_playbook_id === kitId)
    const { data, error } = await supabase.from('project_playbook_steps')
      .insert({ project_playbook_id: kitId, title: '', sort_order: nextSort(siblings) }).select('id, project_playbook_id, title, sort_order').single()
    if (error) { Alert.alert(t('saveFailed'), error.message); return }
    setSteps(prev => [...prev, data as Step])
  }
  async function updateStep(stepId: number, title: string) {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, title } : s))
    const { error } = await supabase.from('project_playbook_steps').update({ title }).eq('id', stepId)
    if (error) Alert.alert(t('saveFailed'), error.message)
  }
  function deleteStep(step: Step) {
    Alert.alert(t('jkDeleteStep'), t('jkDeleteStepMsg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('project_playbook_steps').delete().eq('id', step.id)
        if (error) { Alert.alert(t('saveFailed'), error.message); return }
        setSteps(prev => prev.filter(s => s.id !== step.id))
        setTasks(prev => prev.filter(x => x.step_id !== step.id))
      } },
    ])
  }
  async function addTask(stepId: number) {
    const siblings = tasks.filter(x => x.step_id === stepId)
    const sort_order = siblings.length ? Math.max(...siblings.map((_, i) => i)) + 1 : 0
    const { data, error } = await supabase.from('project_playbook_step_checks')
      .insert({ step_id: stepId, label: '', sort_order }).select('id, step_id, label, description, qty, notes').single()
    if (error) { Alert.alert(t('saveFailed'), error.message); return }
    setTasks(prev => [...prev, data as Task])
  }
  // The task name lives in both `description` (canonical) and the legacy `label` column; keep them
  // in sync so no reader ever falls back to a stale "New task" placeholder.
  async function updateTaskTitle(task: Task, text: string) {
    if (text === (task.description || '') && text === (task.label || '')) return
    setTasks(prev => prev.map(x => x.id === task.id ? { ...x, description: text, label: text } : x))
    const { error } = await supabase.from('project_playbook_step_checks').update({ description: text, label: text }).eq('id', task.id)
    if (error) Alert.alert(t('saveFailed'), error.message)
  }
  function deleteTask(task: Task) {
    Alert.alert(t('jkDeleteTask'), t('jkDeleteTaskMsg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('project_playbook_step_checks').delete().eq('id', task.id)
        if (error) { Alert.alert(t('saveFailed'), error.message); return }
        setTasks(prev => prev.filter(x => x.id !== task.id))
      } },
    ])
  }

  const progress = useMemo(() => {
    const keys = [...tasks.map(x => `step_check:${x.id}`), ...tools.map(x => `tool:${x.id}`)]
    return { done: keys.filter(k => checks.has(k)).length, total: keys.length }
  }, [tasks, tools, checks])

  // Bottom-sheet list of org templates; tapping one instantiates it onto the project.
  const templatePicker = (
    <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '70%' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.navy, marginBottom: 14 }}>{t('jkChooseTemplate')}</Text>
          {templates.length === 0 ? (
            <Text style={{ color: COLORS.subtext, paddingVertical: 12 }}>{t('jkNoTemplates')}</Text>
          ) : (
            <ScrollView>
              {templates.map(tpl => (
                <Pressable key={tpl.id} disabled={addingTpl} onPress={() => addFromTemplate(tpl.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.background, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, opacity: addingTpl ? 0.5 : 1 }}>
                  <MaterialCommunityIcons name="package-variant-closed" size={22} color={COLORS.teal} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.navy, fontWeight: '800' }} numberOfLines={1}>{tpl.title || t('jobKit')}</Text>
                    {tpl.module_type ? <Text style={{ color: COLORS.teal, fontSize: 12, fontWeight: '700' }}>{tpl.module_type}</Text> : null}
                  </View>
                  <MaterialCommunityIcons name="plus-circle" size={22} color={COLORS.teal} />
                </Pressable>
              ))}
            </ScrollView>
          )}
          <Pressable onPress={() => setPickerVisible(false)} disabled={addingTpl} style={{ alignItems: 'center', paddingVertical: 14 }}>
            <Text style={{ color: COLORS.subtext, fontWeight: '700' }}>{addingTpl ? t('jkAdding') : t('close')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>{t('loadingJobKit')}</Text>
      </SafeAreaView>
    )
  }

  if (!kits.length) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', padding: 28 }}>
        <MaterialCommunityIcons name="package-variant-closed" size={54} color={COLORS.border} />
        <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 18, marginTop: 12 }}>{t('noJobKitTitle')}</Text>
        <Text style={{ color: COLORS.subtext, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>{t('noJobKitMsg')}</Text>
        {isManager && (
          <Pressable onPress={addKit} style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.navy, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 22 }}>
            <MaterialCommunityIcons name="plus-circle-outline" size={20} color="white" />
            <Text style={{ color: 'white', fontWeight: '800' }}>{t('jkAddKit')}</Text>
          </Pressable>
        )}
        {isManager && (
          <Pressable onPress={() => setPickerVisible(true)} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: COLORS.teal, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 22 }}>
            <MaterialCommunityIcons name="folder-plus-outline" size={20} color={COLORS.teal} />
            <Text style={{ color: COLORS.teal, fontWeight: '800' }}>{t('jkAddFromTemplate')}</Text>
          </Pressable>
        )}
        {templatePicker}
      </SafeAreaView>
    )
  }

  const allDone = progress.total > 0 && progress.done === progress.total

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        <View style={{ backgroundColor: COLORS.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.navy }}>{t('jobKit')}</Text>
          <Text style={{ color: COLORS.subtext, marginTop: 2, marginBottom: 12 }}>{t('jkTapHint')}</Text>
          <View style={{ height: 12, borderRadius: 6, backgroundColor: COLORS.background, overflow: 'hidden' }}>
            <View style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, height: '100%', backgroundColor: allDone ? '#2E7D32' : COLORS.teal }} />
          </View>
          <Text style={{ marginTop: 8, fontWeight: '800', color: allDone ? '#2E7D32' : COLORS.navy }}>
            {allDone ? t('jkAllReady') : `${progress.done} / ${progress.total} ${t('jkPacked')}`}
          </Text>
          {isManager && (
            <Pressable onPress={() => setEditMode(v => !v)}
              style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: editMode ? COLORS.teal : COLORS.background, borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: editMode ? COLORS.teal : COLORS.border }}>
              <MaterialCommunityIcons name={editMode ? 'check' : 'pencil-outline'} size={18} color={editMode ? 'white' : COLORS.navy} />
              <Text style={{ color: editMode ? 'white' : COLORS.navy, fontWeight: '800' }}>{editMode ? t('jkDoneEditing') : t('jkEdit')}</Text>
            </Pressable>
          )}
          {isManager && (
            <Pressable onPress={() => setPickerVisible(true)}
              style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.background, borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: COLORS.border }}>
              <MaterialCommunityIcons name="folder-plus-outline" size={18} color={COLORS.navy} />
              <Text style={{ color: COLORS.navy, fontWeight: '800' }}>{t('jkAddFromTemplate')}</Text>
            </Pressable>
          )}
        </View>

        {kits.map(kit => {
          const kt = tools.filter(x => x.project_playbook_id === kit.id)
          const ks = steps.filter(x => x.project_playbook_id === kit.id)
          // Materials pull list calculated from the tasks: each task's MATERIAL lines
          // (labor excluded) × the task qty, grouped by phase (the step's category).
          const kitStepIds = new Set(ks.map(s => s.id))
          const phaseByStep = new Map(ks.map(s => [s.id, s.category || 'Uncategorized']))
          const kitTasks = tasks.filter(x => kitStepIds.has(x.step_id))
          const taskInfo = new Map(kitTasks.map(x => [x.id, { phase: phaseByStep.get(x.step_id) || 'Uncategorized', qty: Number(x.qty) || 1 }]))
          const byPhase: Record<string, Record<string, { name: string; unit: string; qty: number }>> = {}
          for (const m of taskMats) {
            const info = taskInfo.get(m.task_id)
            if (!info || m.line_type === 'labor') continue
            const total = (Number(m.qty) || 0) * info.qty
            const key = `${(m.description || '').toLowerCase()}|${(m.unit || 'EA').toLowerCase()}`
            if (!byPhase[info.phase]) byPhase[info.phase] = {}
            if (!byPhase[info.phase][key]) byPhase[info.phase][key] = { name: m.description || 'Material', unit: m.unit || 'EA', qty: 0 }
            byPhase[info.phase][key].qty += total
          }
          const matPhases = [...PHASE_ORDER, 'Uncategorized'].filter(p => byPhase[p]).map(p => ({ phase: p, items: Object.values(byPhase[p]) }))
          const hasMats = matPhases.length > 0
          return (
            <View key={kit.id} style={{ marginBottom: 20 }}>
              {editMode && isManager ? (
                /* ── EDIT MODE: kit / steps / tasks ── */
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput
                      defaultValue={kit.title || ''}
                      placeholder={t('jkKitTitle')}
                      placeholderTextColor={COLORS.border}
                      onEndEditing={e => updateKit(kit.id, { title: e.nativeEvent.text.trim() || null })}
                      style={{ flex: 1, fontSize: 18, fontWeight: '900', color: COLORS.navy, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 10 }}
                    />
                    <Pressable onPress={() => deleteKit(kit)} hitSlop={8} style={{ padding: 8 }}>
                      <MaterialCommunityIcons name="trash-can-outline" size={22} color="#B91C1C" />
                    </Pressable>
                  </View>
                  <TextInput
                    defaultValue={kit.scope_of_work || ''}
                    placeholder={t('jkScope')}
                    placeholderTextColor={COLORS.border}
                    multiline
                    onEndEditing={e => updateKit(kit.id, { scope_of_work: e.nativeEvent.text.trim() || null })}
                    style={{ marginTop: 8, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.text, minHeight: 44, textAlignVertical: 'top' }}
                  />

                  {ks.map((step, i) => {
                    const st = kitTasks.filter(x => x.step_id === step.id)
                    return (
                      <View key={step.id} style={{ marginTop: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontWeight: '900', color: COLORS.teal }}>{i + 1}.</Text>
                          <TextInput
                            defaultValue={step.title || ''}
                            placeholder={t('jkStepTitle')}
                            placeholderTextColor={COLORS.border}
                            onEndEditing={e => updateStep(step.id, e.nativeEvent.text.trim())}
                            style={{ flex: 1, fontWeight: '700', color: COLORS.navy, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 8 }}
                          />
                          <Pressable onPress={() => deleteStep(step)} hitSlop={8} style={{ padding: 6 }}>
                            <MaterialCommunityIcons name="trash-can-outline" size={20} color="#B91C1C" />
                          </Pressable>
                        </View>
                        {st.map(task => (
                          <View key={task.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginLeft: 20 }}>
                            <MaterialCommunityIcons name="checkbox-blank-circle-outline" size={18} color={COLORS.border} />
                            <TextInput
                              defaultValue={task.description || task.label || ''}
                              placeholder={t('jkTaskTitle')}
                              placeholderTextColor={COLORS.border}
                              onEndEditing={e => updateTaskTitle(task, e.nativeEvent.text.trim())}
                              style={{ flex: 1, color: COLORS.text, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 7 }}
                            />
                            <Pressable onPress={() => deleteTask(task)} hitSlop={8} style={{ padding: 6 }}>
                              <MaterialCommunityIcons name="trash-can-outline" size={18} color="#B91C1C" />
                            </Pressable>
                          </View>
                        ))}
                        <Pressable onPress={() => addTask(step.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginLeft: 20 }}>
                          <MaterialCommunityIcons name="plus-circle-outline" size={18} color={COLORS.teal} />
                          <Text style={{ color: COLORS.teal, fontWeight: '700', fontSize: 13 }}>{t('jkAddTask')}</Text>
                        </Pressable>
                      </View>
                    )
                  })}

                  <Pressable onPress={() => addStep(kit.id)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, borderWidth: 1, borderColor: COLORS.teal, borderRadius: 12, paddingVertical: 10 }}>
                    <MaterialCommunityIcons name="plus-circle-outline" size={18} color={COLORS.teal} />
                    <Text style={{ color: COLORS.teal, fontWeight: '800' }}>{t('jkAddStep')}</Text>
                  </Pressable>
                </View>
              ) : (
              <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 18, fontWeight: '900', color: COLORS.navy }}>{kit.title || t('jobKit')}</Text>
                <Pressable onPress={() => chooseKitReport(kit.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <MaterialCommunityIcons name="file-document-outline" size={16} color="white" />
                  <Text style={{ color: 'white', fontWeight: '800', fontSize: 12 }}>{t('jkReport')}</Text>
                </Pressable>
              </View>
              {kit.scope_of_work ? (
                <View style={{ backgroundColor: COLORS.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.border, marginTop: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.subtext, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{t('jkScope')}</Text>
                  <Text style={{ color: COLORS.text, lineHeight: 20 }}>{kit.scope_of_work}</Text>
                </View>
              ) : null}

              {/* Collapse / expand all steps for a quick overview of a long kit */}
              {ks.length > 1 && (
                <Pressable
                  onPress={() => setCollapsedSteps(prev => (ks.every(s => prev.has(s.id)) ? new Set() : new Set(ks.map(s => s.id))))}
                  style={{ alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12, marginBottom: 2, paddingVertical: 4 }}>
                  <MaterialCommunityIcons name={ks.every(s => collapsedSteps.has(s.id)) ? 'unfold-more-horizontal' : 'unfold-less-horizontal'} size={16} color={COLORS.teal} />
                  <Text style={{ color: COLORS.teal, fontWeight: '700', fontSize: 12 }}>{ks.every(s => collapsedSteps.has(s.id)) ? t('jkExpandAll') : t('jkCollapseAll')}</Text>
                </Pressable>
              )}

              {/* Steps → Tasks (each step collapses to a one-line summary) */}
              {ks.map((step, i) => {
                const st = kitTasks.filter(x => x.step_id === step.id)
                const doneCount = st.filter(x => checks.has(`step_check:${x.id}`)).length
                const collapsed = collapsedSteps.has(step.id)
                return (
                  <View key={step.id} style={{ marginTop: 14 }}>
                    <Pressable onPress={() => toggleStepCollapsed(step.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: collapsed ? 0 : 8 }}>
                      <MaterialCommunityIcons name={collapsed ? 'chevron-right' : 'chevron-down'} size={20} color={COLORS.teal} />
                      <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', color: COLORS.subtext, textTransform: 'uppercase', letterSpacing: 0.5 }} numberOfLines={collapsed ? 1 : undefined}>
                        {`${i + 1}. ${step.title || t('jkSteps')}`}
                      </Text>
                      {st.length > 0 && (
                        <Text style={{ fontSize: 11, fontWeight: '800', color: doneCount === st.length ? COLORS.teal : COLORS.subtext }}>{doneCount}/{st.length}</Text>
                      )}
                    </Pressable>
                    {!collapsed && (
                      <>
                        <Pressable onPress={() => exportStep(step.id)} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 }}>
                          <MaterialCommunityIcons name="file-pdf-box" size={16} color={COLORS.teal} />
                          <Text style={{ color: COLORS.teal, fontWeight: '700', fontSize: 12 }}>{t('exportStepPdf')}</Text>
                        </Pressable>
                        {st.length === 0 ? (
                          <Text style={{ color: COLORS.subtext, fontSize: 13, paddingBottom: 6 }}>—</Text>
                        ) : st.map(task => (
                          <View key={task.id}>
                            <CheckRow checked={checks.has(`step_check:${task.id}`)} onPress={() => toggleTask(kit.id, task.id)}
                              title={task.description || task.label || 'Task'}
                              sub={(Number(task.qty) || 1) > 1 ? `×${Number(task.qty)}` : undefined} />
                            <TextInput
                              key={`note-${task.id}-${task.notes || ''}`}
                              defaultValue={task.notes || ''}
                              placeholder={t('addNote')}
                              placeholderTextColor={COLORS.border}
                              multiline
                              onEndEditing={e => saveTaskNote(task, e.nativeEvent.text.trim())}
                              style={{ marginTop: -2, marginBottom: 8, marginLeft: 38, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: COLORS.text, minHeight: 36 }}
                            />
                            <TaskPhotos
                              photos={taskPhotos.get(task.id) || []}
                              busy={busyPhotoTask === task.id}
                              canRemove={(p) => isManager || p.uploaded_by === uid}
                              onAdd={() => addTaskPhoto(task.id)}
                              onRemove={confirmRemovePhoto}
                              addLabel={t('jkAddPhoto')}
                            />
                          </View>
                        ))}
                      </>
                    )}
                  </View>
                )
              })}

              {/* Aggregated materials pull list (read-only) */}
              {hasMats && (
                <Section icon="package-variant" label={t('jkMaterials')}>
                  {matPhases.map(group => (
                    <View key={group.phase} style={{ marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.teal, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6, marginBottom: 4 }}>{group.phase}</Text>
                      {group.items.map((m, i) => (
                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border }}>
                          <Text style={{ color: COLORS.navy, fontWeight: '600', flex: 1 }}>{m.name}</Text>
                          <Text style={{ color: COLORS.subtext, fontWeight: '700' }}>{m.qty.toLocaleString('en-US', { maximumFractionDigits: 2 })} {m.unit}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </Section>
              )}

              {/* Tools (check-out) */}
              {kt.length > 0 && (
                <Section icon="wrench-outline" label={t('jkTools')}>
                  {kt.map(x => (
                    <CheckRow key={x.id} checked={checks.has(`tool:${x.id}`)} onPress={() => toggleTool(x)}
                      title={x.name}
                      sub={`${t('jkNeed')} ${Number(x.qty || 1).toLocaleString('en-US')} ${x.unit || ''}${x.equipment_id ? ` · ${t('jkChecksOut')}` : ''}`} />
                  ))}
                </Section>
              )}
              </>
              )}
            </View>
          )
        })}

        {editMode && isManager && (
          <Pressable onPress={addKit} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.navy, borderRadius: 14, paddingVertical: 14, marginTop: 4 }}>
            <MaterialCommunityIcons name="plus-circle-outline" size={20} color="white" />
            <Text style={{ color: 'white', fontWeight: '800' }}>{t('jkAddKit')}</Text>
          </Pressable>
        )}
      </ScrollView>
      {templatePicker}
    </SafeAreaView>
  )
}

function Section({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <MaterialCommunityIcons name={icon as any} size={18} color={COLORS.teal} />
        <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.subtext, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      </View>
      {children}
    </View>
  )
}

function TaskPhotos({ photos, busy, canRemove, onAdd, onRemove, addLabel }: {
  photos: TaskPhoto[]; busy: boolean; canRemove: (p: TaskPhoto) => boolean
  onAdd: () => void; onRemove: (p: TaskPhoto) => void; addLabel: string
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginLeft: 38, marginBottom: 10 }}>
      {photos.map(p => (
        <Pressable key={p.id} onLongPress={() => canRemove(p) && onRemove(p)} style={{ position: 'relative' }}>
          <Image source={{ uri: p.photo_url }} style={{ width: 54, height: 54, borderRadius: 10, backgroundColor: COLORS.background }} />
          {canRemove(p) && (
            <View style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#B71C1C', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="close" size={13} color="white" />
            </View>
          )}
        </Pressable>
      ))}
      <Pressable onPress={onAdd} disabled={busy} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, height: 40, opacity: busy ? 0.5 : 1 }}>
        {busy ? <ActivityIndicator size="small" color={COLORS.teal} /> : <MaterialCommunityIcons name="camera-plus-outline" size={20} color={COLORS.teal} />}
        <Text style={{ color: COLORS.teal, fontWeight: '700', fontSize: 13 }}>{addLabel}</Text>
      </Pressable>
    </View>
  )
}

function CheckRow({ checked, onPress, title, sub, note }: { checked: boolean; onPress: () => void; title: string; sub?: string; note?: string }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: checked ? '#E8F5E9' : COLORS.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: checked ? '#A5D6A7' : COLORS.border }}>
      <MaterialCommunityIcons name={checked ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={26} color={checked ? '#2E7D32' : COLORS.border} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700', color: COLORS.navy, fontSize: 16, textDecorationLine: checked ? 'line-through' : 'none' }}>{title}</Text>
        {sub ? <Text style={{ color: COLORS.subtext, fontSize: 13, marginTop: 3, lineHeight: 19 }}>{sub}</Text> : null}
        {note ? <Text style={{ color: '#C62828', fontSize: 12, marginTop: 4, fontWeight: '600' }}>⚠ {note}</Text> : null}
      </View>
    </Pressable>
  )
}
