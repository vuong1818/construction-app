import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { COLORS } from '../../../lib/theme'

// A Job Kit is a per-project playbook: scope of work + tools + materials + steps.
// The listed quantities are the PLAN (what the project needs). Nothing leaves
// inventory until a worker checks the item off — then the linked material is
// removed from its default location, and a linked tool is checked out to them.
type Kit = { id: number; title: string | null; scope_of_work: string | null; module_type: string | null }
type Tool = { id: number; project_playbook_id: number; name: string; qty: number | null; unit: string | null; equipment_id: number | null }
type Material = { id: number; project_playbook_id: number; name: string; qty: number | null; unit: string | null; inventory_item_id: number | null }
type Step = { id: number; project_playbook_id: number; title: string | null; body: string | null; safety_note: string | null; sort_order: number | null }
type Loc = { id: number; name: string; kind: string; is_primary: boolean | null }
type StockRow = { item_id: number; location_id: number; qty: number }

export default function JobKitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const projectId = Number(id)
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [kits, setKits] = useState<Kit[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [checks, setChecks] = useState<Set<string>>(new Set())
  const [locations, setLocations] = useState<Loc[]>([])
  const [invDefaults, setInvDefaults] = useState<Map<number, number | null>>(new Map())
  const [invStock, setInvStock] = useState<StockRow[]>([])
  const [uid, setUid] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    setUid(session?.user?.id || null)

    const { data: k } = await supabase
      .from('project_playbooks').select('id, title, scope_of_work, module_type')
      .eq('project_id', projectId).order('created_at', { ascending: false })
    const kitList = (k as Kit[]) || []
    setKits(kitList)

    if (kitList.length) {
      const ids = kitList.map(x => x.id)
      const [{ data: tl }, { data: ml }, { data: sp }, { data: ck }, { data: loc }, { data: invI }, { data: invS }] = await Promise.all([
        supabase.from('project_playbook_tools').select('id, project_playbook_id, name, qty, unit, equipment_id').in('project_playbook_id', ids).order('sort_order'),
        supabase.from('project_playbook_materials').select('id, project_playbook_id, name, qty, unit, inventory_item_id').in('project_playbook_id', ids).order('sort_order'),
        supabase.from('project_playbook_steps').select('id, project_playbook_id, title, body, safety_note, sort_order').in('project_playbook_id', ids).order('sort_order'),
        supabase.from('project_playbook_checks').select('project_playbook_id, item_type, item_id').in('project_playbook_id', ids),
        supabase.from('inventory_locations').select('id, name, kind, is_primary').eq('is_active', true).order('kind').order('name'),
        supabase.from('inventory_items').select('id, default_location_id'),
        supabase.from('inventory_stock').select('item_id, location_id, qty'),
      ])
      setTools((tl as Tool[]) || [])
      setMaterials((ml as Material[]) || [])
      setSteps((sp as Step[]) || [])
      setChecks(new Set(((ck as any[]) || []).map(c => `${c.item_type}:${c.item_id}`)))
      setLocations((loc as Loc[]) || [])
      setInvDefaults(new Map(((invI as any[]) || []).map(i => [i.id, i.default_location_id])))
      setInvStock((invS as StockRow[]) || [])
    } else {
      setTools([]); setMaterials([]); setSteps([]); setChecks(new Set()); setLocations([]); setInvStock([])
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  // Source location when a material is checked off: its own default → the main
  // location → wherever the most stock is.
  function resolveLoc(invItemId: number): number | null {
    const def = invDefaults.get(invItemId)
    if (def) return def
    const primary = locations.find(l => l.is_primary)
    if (primary) return primary.id
    const rows = invStock.filter(s => s.item_id === invItemId && Number(s.qty) > 0)
    if (rows.length) return rows.reduce((a, b) => (Number(b.qty) > Number(a.qty) ? b : a)).location_id
    return null
  }

  async function toggleCheck(kitId: number, type: 'step', itemId: number) {
    const key = `${type}:${itemId}`
    const has = checks.has(key)
    setChecks(prev => { const n = new Set(prev); has ? n.delete(key) : n.add(key); return n })
    if (has) await supabase.from('project_playbook_checks').delete().eq('project_playbook_id', kitId).eq('item_type', type).eq('item_id', itemId)
    else await supabase.from('project_playbook_checks').insert({ project_playbook_id: kitId, item_type: type, item_id: itemId, checked_by: uid })
  }

  // Tools route through RPCs so a linked equipment asset is checked out / returned.
  async function toggleTool(tool: Tool) {
    const key = `tool:${tool.id}`
    const has = checks.has(key)
    setChecks(prev => { const n = new Set(prev); has ? n.delete(key) : n.add(key); return n })
    const { error } = has
      ? await supabase.rpc('checkin_kit_tool', { p_tool_id: tool.id })
      : await supabase.rpc('checkout_kit_tool', { p_tool_id: tool.id })
    if (error) load()
  }

  // Checking a material removes its required qty from inventory (default location);
  // unchecking returns it.
  async function toggleMaterial(m: Material) {
    const key = `material:${m.id}`
    const has = checks.has(key)
    const qty = Number(m.qty) || 0
    setChecks(prev => { const n = new Set(prev); has ? n.delete(key) : n.add(key); return n })
    if (has) {
      await supabase.from('project_playbook_checks').delete().eq('project_playbook_id', m.project_playbook_id).eq('item_type', 'material').eq('item_id', m.id)
      if (m.inventory_item_id) await supabase.rpc('return_kit_material', { p_material_id: m.id, p_to_location_id: resolveLoc(m.inventory_item_id), p_qty: qty })
    } else {
      await supabase.from('project_playbook_checks').insert({ project_playbook_id: m.project_playbook_id, item_type: 'material', item_id: m.id, checked_by: uid })
      if (m.inventory_item_id) await supabase.rpc('consume_kit_material', { p_material_id: m.id, p_from_location_id: resolveLoc(m.inventory_item_id), p_qty: qty })
    }
    load()
  }

  const progress = useMemo(() => {
    const done = [...tools.map(x => `tool:${x.id}`), ...materials.map(x => `material:${x.id}`), ...steps.map(x => `step:${x.id}`)].filter(k => checks.has(k)).length
    return { done, total: tools.length + materials.length + steps.length }
  }, [tools, materials, steps, checks])

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

              {kt.length > 0 && (
                <Section icon="wrench-outline" label={t('jkTools')}>
                  {kt.map(x => (
                    <CheckRow key={x.id} checked={checks.has(`tool:${x.id}`)} onPress={() => toggleTool(x)}
                      title={x.name}
                      sub={`${t('jkNeed')} ${Number(x.qty || 1).toLocaleString('en-US')} ${x.unit || ''}${x.equipment_id ? ` · ${t('jkChecksOut')}` : ''}`} />
                  ))}
                </Section>
              )}

              {km.length > 0 && (
                <Section icon="package-variant" label={t('jkMaterials')}>
                  {km.map(m => (
                    <CheckRow key={m.id} checked={checks.has(`material:${m.id}`)} onPress={() => toggleMaterial(m)}
                      title={m.name}
                      sub={`${t('jkNeed')} ${Number(m.qty || 0).toLocaleString('en-US')} ${m.unit || ''}${m.inventory_item_id ? ` · ${t('jkDeducts')}` : ''}`} />
                  ))}
                </Section>
              )}

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
