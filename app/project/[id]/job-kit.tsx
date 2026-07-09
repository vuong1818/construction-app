import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { COLORS } from '../../../lib/theme'

// A Job Kit is a per-project playbook: scope of work + tools + materials + steps.
// A project can have several (e.g. Electric, Plumbing). Crews check items off;
// checking a material logs usage and draws it down from inventory.
type Kit = { id: number; title: string | null; scope_of_work: string | null; module_type: string | null }
type Tool = { id: number; project_playbook_id: number; name: string; qty: number | null; unit: string | null }
type Material = { id: number; project_playbook_id: number; name: string; qty: number | null; unit: string | null; qty_used: number | null; inventory_item_id: number | null }
type Step = { id: number; project_playbook_id: number; title: string | null; body: string | null; safety_note: string | null; sort_order: number | null }
type Loc = { id: number; name: string; kind: string }

export default function JobKitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const projectId = Number(id)
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [kits, setKits] = useState<Kit[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [checks, setChecks] = useState<Set<string>>(new Set()) // `${type}:${item_id}`
  const [locations, setLocations] = useState<Loc[]>([])
  const [uid, setUid] = useState<string | null>(null)

  // Material-usage modal
  const [useMat, setUseMat] = useState<Material | null>(null)
  const [useQty, setUseQty] = useState('')
  const [useLoc, setUseLoc] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getSession().then(r => ({ data: { user: r.data.session?.user } }))
    setUid(user?.id || null)

    const { data: k } = await supabase
      .from('project_playbooks')
      .select('id, title, scope_of_work, module_type')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    const kitList = (k as Kit[]) || []
    setKits(kitList)

    if (kitList.length) {
      const ids = kitList.map(x => x.id)
      const [{ data: tl }, { data: ml }, { data: sp }, { data: ck }, { data: loc }] = await Promise.all([
        supabase.from('project_playbook_tools').select('id, project_playbook_id, name, qty, unit').in('project_playbook_id', ids).order('sort_order'),
        supabase.from('project_playbook_materials').select('id, project_playbook_id, name, qty, unit, qty_used, inventory_item_id').in('project_playbook_id', ids).order('sort_order'),
        supabase.from('project_playbook_steps').select('id, project_playbook_id, title, body, safety_note, sort_order').in('project_playbook_id', ids).order('sort_order'),
        supabase.from('project_playbook_checks').select('project_playbook_id, item_type, item_id').in('project_playbook_id', ids),
        supabase.from('inventory_locations').select('id, name, kind').eq('is_active', true).order('kind').order('name'),
      ])
      setTools((tl as Tool[]) || [])
      setMaterials((ml as Material[]) || [])
      setSteps((sp as Step[]) || [])
      setChecks(new Set(((ck as any[]) || []).map(c => `${c.item_type}:${c.item_id}`)))
      setLocations((loc as Loc[]) || [])
    } else {
      setTools([]); setMaterials([]); setSteps([]); setChecks(new Set()); setLocations([])
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function toggleCheck(kitId: number, type: 'tool' | 'step', itemId: number) {
    const key = `${type}:${itemId}`
    const has = checks.has(key)
    // optimistic
    setChecks(prev => { const n = new Set(prev); has ? n.delete(key) : n.add(key); return n })
    if (has) {
      await supabase.from('project_playbook_checks').delete()
        .eq('project_playbook_id', kitId).eq('item_type', type).eq('item_id', itemId)
    } else {
      await supabase.from('project_playbook_checks')
        .insert({ project_playbook_id: kitId, item_type: type, item_id: itemId, checked_by: uid })
    }
  }

  function openUse(m: Material) {
    const remaining = Math.max(0, Number(m.qty || 0) - Number(m.qty_used || 0))
    setUseMat(m)
    setUseQty(String(remaining > 0 ? remaining : (m.qty || 1)))
    setUseLoc(locations[0]?.id ?? null)
  }

  async function confirmUse() {
    if (!useMat) return
    const qty = Number(useQty)
    if (!qty || qty <= 0) return
    setSaving(true)
    const { error } = await supabase.rpc('consume_kit_material', {
      p_material_id: useMat.id, p_from_location_id: useLoc, p_qty: qty,
    })
    setSaving(false)
    setUseMat(null)
    if (!error) load()
  }

  const progress = useMemo(() => {
    const toolDone = tools.filter(x => checks.has(`tool:${x.id}`)).length
    const stepDone = steps.filter(x => checks.has(`step:${x.id}`)).length
    const matDone = materials.filter(m => Number(m.qty_used || 0) >= Number(m.qty || 0) && Number(m.qty || 0) > 0).length
    const total = tools.length + steps.length + materials.length
    return { done: toolDone + stepDone + matDone, total }
  }, [tools, steps, materials, checks])

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
          const km = materials.filter(x => x.project_playbook_id === kit.id)
          const ks = steps.filter(x => x.project_playbook_id === kit.id)
          return (
            <View key={kit.id} style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.navy }}>{kit.title || t('jobKit')}</Text>
              {kit.module_type ? <Text style={{ color: COLORS.teal, fontWeight: '700', fontSize: 13, marginTop: 2 }}>{kit.module_type}</Text> : null}
              {kit.scope_of_work ? (
                <View style={{ backgroundColor: COLORS.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.border, marginTop: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.subtext, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{t('jkScope')}</Text>
                  <Text style={{ color: COLORS.text, lineHeight: 20 }}>{kit.scope_of_work}</Text>
                </View>
              ) : null}

              {/* Tools */}
              {kt.length > 0 && (
                <Section icon="wrench-outline" label={t('jkTools')}>
                  {kt.map(x => (
                    <CheckRow key={x.id} checked={checks.has(`tool:${x.id}`)} onPress={() => toggleCheck(kit.id, 'tool', x.id)}
                      title={x.name} sub={`${t('jkNeed')} ${Number(x.qty || 1).toLocaleString('en-US')} ${x.unit || ''}`} />
                  ))}
                </Section>
              )}

              {/* Materials */}
              {km.length > 0 && (
                <Section icon="package-variant" label={t('jkMaterials')}>
                  {km.map(m => {
                    const used = Number(m.qty_used || 0), need = Number(m.qty || 0)
                    const done = need > 0 && used >= need
                    return (
                      <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: done ? '#E8F5E9' : COLORS.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: done ? '#A5D6A7' : COLORS.border }}>
                        <MaterialCommunityIcons name={done ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={26} color={done ? '#2E7D32' : COLORS.border} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '700', color: COLORS.navy, fontSize: 16 }}>{m.name}</Text>
                          <Text style={{ color: COLORS.subtext, fontSize: 13, marginTop: 2 }}>
                            {t('jkNeed')} {need.toLocaleString('en-US')} {m.unit || ''} · {used.toLocaleString('en-US')} {t('jkUsed')}
                          </Text>
                        </View>
                        <Pressable onPress={() => openUse(m)} style={{ backgroundColor: COLORS.tealSoft, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 }}>
                          <Text style={{ color: COLORS.teal, fontWeight: '800' }}>{t('jkUse')}</Text>
                        </Pressable>
                      </View>
                    )
                  })}
                </Section>
              )}

              {/* Steps */}
              {ks.length > 0 && (
                <Section icon="format-list-numbered" label={t('jkSteps')}>
                  {ks.map((x, i) => (
                    <CheckRow key={x.id} checked={checks.has(`step:${x.id}`)} onPress={() => toggleCheck(kit.id, 'step', x.id)}
                      title={`${i + 1}. ${x.title || ''}`} sub={x.body || undefined} note={x.safety_note || undefined} />
                  ))}
                </Section>
              )}
            </View>
          )
        })}
      </ScrollView>

      {/* Material usage modal */}
      <Modal visible={!!useMat} transparent animationType="slide" onRequestClose={() => setUseMat(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.navy, marginBottom: 4 }}>{t('jkLogUsage')}</Text>
            <Text style={{ color: COLORS.subtext, marginBottom: 16 }}>{useMat?.name}</Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.subtext, textTransform: 'uppercase', marginBottom: 6 }}>{t('jkQty')}</Text>
            <TextInput value={useQty} onChangeText={setUseQty} keyboardType="numeric"
              style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 16, color: COLORS.text, marginBottom: 16 }} />

            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.subtext, textTransform: 'uppercase', marginBottom: 6 }}>{t('jkFrom')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              <Pressable onPress={() => setUseLoc(null)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: useLoc === null ? COLORS.teal : COLORS.border, backgroundColor: useLoc === null ? COLORS.tealSoft : COLORS.background }}>
                <Text style={{ color: useLoc === null ? COLORS.teal : COLORS.subtext, fontWeight: '700', fontSize: 13 }}>{t('jkNoLoc')}</Text>
              </Pressable>
              {locations.map(l => (
                <Pressable key={l.id} onPress={() => setUseLoc(l.id)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: useLoc === l.id ? COLORS.teal : COLORS.border, backgroundColor: useLoc === l.id ? COLORS.tealSoft : COLORS.background }}>
                  <Text style={{ color: useLoc === l.id ? COLORS.teal : COLORS.subtext, fontWeight: '700', fontSize: 13 }}>{l.name}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={confirmUse} disabled={saving} style={{ flex: 1, backgroundColor: COLORS.navy, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: saving ? 0.6 : 1 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{saving ? '…' : t('jkConfirm')}</Text>
              </Pressable>
              <Pressable onPress={() => setUseMat(null)} style={{ flex: 1, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: COLORS.subtext, fontWeight: '800', fontSize: 15 }}>{t('cancel')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
