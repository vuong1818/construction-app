import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../../lib/i18n'
import { isManagerRole } from '../../../lib/roles'
import { supabase } from '../../../lib/supabase'
import { COLORS } from '../../../lib/theme'

const JOBKIT_BUCKET = 'jobkit-photos'

// A Job Kit is a per-project scope: Steps → Tasks (with materials + labor) + Tools.
// The crew checks off TASKS as they complete them; the materials list is the aggregated
// pull list from every task. Tools route through inventory check-out.
type Kit = { id: number; title: string | null; scope_of_work: string | null; module_type: string | null }
type Tool = { id: number; project_playbook_id: number; name: string; qty: number | null; unit: string | null; equipment_id: number | null }
type Step = { id: number; project_playbook_id: number; title: string | null; sort_order: number | null }
type Task = { id: number; step_id: number; label: string | null; description: string | null; qty: number | null; notes: string | null }
type TaskMat = { task_id: number; description: string | null; unit: string | null; qty: number | null }
type TaskPhoto = { id: number; step_check_id: number; photo_url: string; storage_path: string | null; uploaded_by: string | null }

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

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const myId = session?.user?.id || null
    setUid(myId)
    if (myId) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', myId).single()
      setIsManager(isManagerRole((prof as any)?.role))
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
      supabase.from('project_playbook_steps').select('id, project_playbook_id, title, sort_order').in('project_playbook_id', ids).order('sort_order'),
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
          supabase.from('task_materials').select('task_id, description, unit, qty').in('task_id', taskIds),
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
  async function runPicker(source: 'camera' | 'library'): Promise<{ url: string; path: string } | null> {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { Alert.alert(t('permissionNeeded'), source === 'camera' ? t('allowCamera') : t('allowPhotos')); return null }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images })
    if (result.canceled || !result.assets?.length) return null
    const asset = result.assets[0]
    const resp = await fetch(asset.uri)
    const buf = await resp.arrayBuffer()
    const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase()
    const path = `${projectId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from(JOBKIT_BUCKET).upload(path, buf, { contentType: asset.mimeType || 'image/jpeg', upsert: false })
    if (error) throw error
    return { url: supabase.storage.from(JOBKIT_BUCKET).getPublicUrl(path).data.publicUrl, path }
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
      const up = await runPicker(source)
      if (!up) return
      const { data, error } = await supabase.from('project_playbook_task_photos')
        .insert({ step_check_id: taskId, photo_url: up.url, storage_path: up.path, uploaded_by: uid })
        .select('id, step_check_id, photo_url, storage_path, uploaded_by').single()
      if (error) throw error
      setTaskPhotos(prev => { const m = new Map(prev); m.set(taskId, [...(m.get(taskId) || []), data as TaskPhoto]); return m })
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
    const url = `https://nguyenmep.com/api/portal/step-doc?token=${encodeURIComponent(token)}&step=${stepId}`
    Linking.openURL(url).catch(() => Alert.alert(t('saveFailed'), t('couldNotOpen')))
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
  // Edit the field that supplies the visible title (description if present, else label).
  async function updateTaskTitle(task: Task, text: string) {
    const field = task.description != null && task.description !== '' ? 'description' : 'label'
    if (text === ((task as any)[field] || '')) return
    setTasks(prev => prev.map(x => x.id === task.id ? { ...x, [field]: text } : x))
    const { error } = await supabase.from('project_playbook_step_checks').update({ [field]: text }).eq('id', task.id)
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
        </View>

        {kits.map(kit => {
          const kt = tools.filter(x => x.project_playbook_id === kit.id)
          const ks = steps.filter(x => x.project_playbook_id === kit.id)
          // Aggregate this kit's task materials into a pull list.
          const kitStepIds = new Set(ks.map(s => s.id))
          const kitTasks = tasks.filter(x => kitStepIds.has(x.step_id))
          const qtyByTask = new Map(kitTasks.map(x => [x.id, Number(x.qty) || 1]))
          const matAgg: Record<string, { name: string; unit: string; qty: number }> = {}
          for (const m of taskMats) {
            if (!qtyByTask.has(m.task_id)) continue
            const total = (Number(m.qty) || 0) * (qtyByTask.get(m.task_id) || 1)
            const key = `${(m.description || '').toLowerCase()}|${(m.unit || 'EA').toLowerCase()}`
            if (!matAgg[key]) matAgg[key] = { name: m.description || 'Material', unit: m.unit || 'EA', qty: 0 }
            matAgg[key].qty += total
          }
          const mats = Object.values(matAgg)
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
              <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.navy }}>{kit.title || t('jobKit')}</Text>
              {kit.scope_of_work ? (
                <View style={{ backgroundColor: COLORS.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.border, marginTop: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.subtext, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{t('jkScope')}</Text>
                  <Text style={{ color: COLORS.text, lineHeight: 20 }}>{kit.scope_of_work}</Text>
                </View>
              ) : null}

              {/* Steps → Tasks */}
              {ks.map((step, i) => {
                const st = kitTasks.filter(x => x.step_id === step.id)
                return (
                  <Section key={step.id} icon="format-list-numbered" label={`${i + 1}. ${step.title || t('jkSteps')}`}>
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
                          sub={task.qty ? `${t('jkNeed')} ${Number(task.qty).toLocaleString('en-US')}` : undefined} />
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
                          canRemove={(p) => p.uploaded_by === uid}
                          onAdd={() => addTaskPhoto(task.id)}
                          onRemove={confirmRemovePhoto}
                          addLabel={t('jkAddPhoto')}
                        />
                      </View>
                    ))}
                  </Section>
                )
              })}

              {/* Aggregated materials pull list (read-only) */}
              {mats.length > 0 && (
                <Section icon="package-variant" label={t('jkMaterials')}>
                  {mats.map((m, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border }}>
                      <Text style={{ color: COLORS.navy, fontWeight: '600', flex: 1 }}>{m.name}</Text>
                      <Text style={{ color: COLORS.subtext, fontWeight: '700' }}>{m.qty.toLocaleString('en-US', { maximumFractionDigits: 2 })} {m.unit}</Text>
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
