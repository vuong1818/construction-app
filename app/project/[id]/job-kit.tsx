import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { COLORS } from '../../../lib/theme'

// A Job Kit is a per-project scope: Steps → Tasks (with materials + labor) + Tools.
// The crew checks off TASKS as they complete them; the materials list is the aggregated
// pull list from every task. Tools route through inventory check-out.
type Kit = { id: number; title: string | null; scope_of_work: string | null; module_type: string | null }
type Tool = { id: number; project_playbook_id: number; name: string; qty: number | null; unit: string | null; equipment_id: number | null }
type Step = { id: number; project_playbook_id: number; title: string | null; sort_order: number | null }
type Task = { id: number; step_id: number; label: string | null; description: string | null; qty: number | null }
type TaskMat = { task_id: number; description: string | null; unit: string | null; qty: number | null }

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
  const [checks, setChecks] = useState<Set<string>>(new Set())
  const [uid, setUid] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    setUid(session?.user?.id || null)

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
      const { data: tk } = await supabase.from('project_playbook_step_checks').select('id, step_id, label, description, qty').in('step_id', stepIds).order('sort_order')
      const taskList = (tk as Task[]) || []
      setTasks(taskList)
      const taskIds = taskList.map(x => x.id)
      if (taskIds.length) {
        const { data: tm } = await supabase.from('task_materials').select('task_id, description, unit, qty').in('task_id', taskIds)
        setTaskMats((tm as TaskMat[]) || [])
      } else setTaskMats([])
    } else { setTasks([]); setTaskMats([]) }
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

  async function toggleTool(tool: Tool) {
    const key = `tool:${tool.id}`
    const has = checks.has(key)
    setChecks(prev => { const n = new Set(prev); has ? n.delete(key) : n.add(key); return n })
    const { error } = has
      ? await supabase.rpc('checkin_kit_tool', { p_tool_id: tool.id })
      : await supabase.rpc('checkout_kit_tool', { p_tool_id: tool.id })
    if (error) load()
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
                    {st.length === 0 ? (
                      <Text style={{ color: COLORS.subtext, fontSize: 13, paddingBottom: 6 }}>—</Text>
                    ) : st.map(task => (
                      <CheckRow key={task.id} checked={checks.has(`step_check:${task.id}`)} onPress={() => toggleTask(kit.id, task.id)}
                        title={task.description || task.label || 'Task'}
                        sub={task.qty ? `${t('jkNeed')} ${Number(task.qty).toLocaleString('en-US')}` : undefined} />
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
            </View>
          )
        })}
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
