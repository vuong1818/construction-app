import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, Text, TextInput, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { canStock } from '../lib/roles'
import { COLORS } from '../lib/theme'

// Inventory on the phone — what we own, and how much of it.
//
// Deliberately NOT the job kit's material list. Project materials say what a job
// needs; inventory says what is on the shelf. They meet in one place only, a
// purchase order issued to the Inventory vendor, and nothing on this screen
// touches a project.
//
// Owner, manager and warehouse — the same canStock() set the web uses and the
// same set inventory RLS allows, so the screen cannot offer an action the
// database will refuse.

type Item = {
  id: number
  name: string
  sku: string | null
  unit: string | null
  qty_on_hand: number | null
  reorder_point: number | null
  unit_cost: number | null
  location: string | null
  notes: string | null
  is_active: boolean
}

const EMPTY = {
  id: null as number | null,
  name: '', sku: '', unit: 'EA', barcode: '',
  qty_on_hand: '0', reorder_point: '', unit_cost: '', location: '', notes: '',
  trade: '', group_name: '', size_rating: '', is_active: true,
  // Set when the item was pulled from the catalog. Keeps the stock row and
  // the priced material pointed at each other instead of merely alike.
  material_id: null as number | null,
}

type CatalogHit = { id: number; description: string; unit: string | null; trade: string | null; group_name: string | null; size_rating: string | null; item_code: string | null; barcode: string | null; base_unit_cost: number | null }

export default function InventoryScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<typeof EMPTY | null>(null)
  const [catalogQ, setCatalogQ] = useState('')
  const [catalogHits, setCatalogHits] = useState<CatalogHit[]>([])
  // The linked material's own barcode, kept only to notice a disagreement.
  const [catalogBarcode, setCatalogBarcode] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  // How many stock movements this item has, fetched when the sheet opens.
  //
  // The point is to ASK BEFORE offering, not to attempt a delete and report the
  // foreign key that stops it. A worker mid-count cannot act on "violates
  // foreign key constraint"; they can act on "this has 14 movements, so it can
  // be deactivated but not deleted".
  //
  // null = not known yet, so neither action is offered and nothing is guessed.
  const [historyCount, setHistoryCount] = useState<number | null>(null)

  const openEditor = useCallback(async (next: typeof EMPTY) => {
    setEditing(next)
    setCatalogBarcode(null)
    if (!next.id) { setHistoryCount(0); return }
    setHistoryCount(null)
    const { count } = await supabase
      .from('inventory_movements')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', next.id)
    setHistoryCount(count ?? 0)
  }, [])

  // Asked of the server as you type. The catalog is a thousand-plus rows and
  // a phone should not download it to pick one.
  const searchCatalog = useCallback(async (term: string) => {
    const q = term.trim()
    if (q.length < 2) { setCatalogHits([]); return }
    const { data } = await supabase
      .from('materials')
      .select('id, description, unit, trade, group_name, size_rating, item_code, barcode, base_unit_cost')
      .is('deleted_at', null)
      .or(`description.ilike.%${q}%,item_code.ilike.%${q}%`)
      .order('description')
      .limit(25)
    setCatalogHits((data as CatalogHit[]) || [])
  }, [])

  // Fill from the catalog, but never overwrite a barcode already on the form:
  // it came off the box the crew is holding, and that is the more specific
  // truth than whatever the catalog happens to carry.
  function applyCatalog(m: CatalogHit) {
    setEditing(p => p ? {
      ...p,
      name: m.description || p.name,
      unit: m.unit || p.unit,
      unit_cost: m.base_unit_cost == null ? p.unit_cost : String(m.base_unit_cost),
      trade: m.trade || '',
      group_name: m.group_name || '',
      size_rating: m.size_rating || '',
      sku: p.sku || m.item_code || '',
      barcode: p.barcode || m.barcode || '',
      material_id: m.id,
    } : p)
    setCatalogBarcode(m.barcode || null)
    setCatalogHits([])
    setCatalogQ('')
  }
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/'); return }
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const ok = canStock((prof as any)?.role)
    setAllowed(ok)
    if (ok) {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id, name, sku, unit, barcode, qty_on_hand, reorder_point, unit_cost, location, notes, is_active, trade, group_name, size_rating, material_id')
        .order('name')
      if (error) Alert.alert('Could not load inventory', error.message)
      setItems((data as any) || [])
    }
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  // Arriving from a scan that found nothing: open the same form the + button
  // opens, with the code already in it. One form, two ways in — two forms
  // writing one table drift, and only one of them would have the catalog
  // search that keeps the data matching.
  const { newBarcode } = useLocalSearchParams<{ newBarcode?: string }>()
  useEffect(() => {
    if (!newBarcode || !allowed) return
    openEditor({ ...EMPTY, barcode: String(newBarcode) })
    router.setParams({ newBarcode: undefined } as any)
  }, [newBarcode, allowed, router, openEditor])

  // Deactivating has to actually remove it from view, or the toggle looks
  // broken: is_active was loaded and then ignored, so an item marked inactive
  // stayed in the list exactly as before.
  const inactiveCount = useMemo(() => items.filter(i => i.is_active === false).length, [items])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const base = showInactive ? items : items.filter(i => i.is_active !== false)
    if (!needle) return base
    return base.filter(i =>
      (i.name || '').toLowerCase().includes(needle) ||
      (i.sku || '').toLowerCase().includes(needle) ||
      (i.location || '').toLowerCase().includes(needle))
  }, [items, q, showInactive])

  async function save() {
    if (!editing) return
    if (!editing.name.trim()) { Alert.alert('Name is required.'); return }
    setSaving(true)
    const payload: any = {
      name: editing.name.trim(),
      sku: editing.sku.trim() || null,
      unit: editing.unit.trim() || 'EA',
      qty_on_hand: Number(editing.qty_on_hand || 0),
      reorder_point: editing.reorder_point === '' ? null : Number(editing.reorder_point),
      unit_cost: editing.unit_cost === '' ? null : Number(editing.unit_cost),
      location: editing.location.trim() || null,
      notes: editing.notes.trim() || null,
      barcode: editing.barcode.trim() || null,
      trade: editing.trade.trim() || null,
      group_name: editing.group_name.trim() || null,
      size_rating: editing.size_rating.trim() || null,
      material_id: editing.material_id ?? null,
      is_active: editing.is_active !== false,
    }
    const { error } = editing.id
      ? await supabase.from('inventory_items').update(payload).eq('id', editing.id)
      : await supabase.from('inventory_items').insert(payload)
    setSaving(false)
    if (error) { Alert.alert('Save failed', error.message); return }
    setEditing(null)
    await load()
  }

  // Only reachable when the item has no movements — the sheet checks first and
  // offers Inactive instead when it does. The error branch stays as a backstop:
  // a purchase-order line can reference an item too, and that reference is not
  // in the movement count.
  function remove(item: Item) {
    Alert.alert(
      `Delete ${item.name}?`,
      'Nothing has moved against this item, so it can go for good.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('inventory_items').delete().eq('id', item.id)
            if (error) {
              Alert.alert(
                'Could not delete',
                'Something still refers to this item — an order line, most likely.\n\nSwitch it to Inactive instead: it leaves the list and keeps its history.')
              return
            }
            setEditing(null)
            await load()
          },
        },
      ])
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.teal} />
      </SafeAreaView>
    )
  }

  if (!allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, padding: 24, justifyContent: 'center' }}>
        <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 18, textAlign: 'center' }}>Inventory is restricted</Text>
        <Text style={{ color: COLORS.subtext, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
          Owners, managers and warehouse staff can manage stock. Ask your manager if you need access.
        </Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search name, SKU or location"
            placeholderTextColor={COLORS.subtext}
            style={{
              flex: 1, backgroundColor: COLORS.card, borderRadius: 14,
              borderWidth: 1, borderColor: COLORS.border,
              paddingHorizontal: 14, paddingVertical: 12, color: COLORS.text,
            }}
          />
          <Pressable
            onPress={() => openEditor({ ...EMPTY })}
            style={{ backgroundColor: COLORS.navy, borderRadius: 14, paddingHorizontal: 18, justifyContent: 'center' }}
          >
            <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 20 }}>+</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => router.push('/inventory-scan' as any)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}
        >
          <MaterialCommunityIcons name="barcode-scan" size={20} color={COLORS.teal} />
          <Text style={{ color: COLORS.teal, fontWeight: '700' }}>Scan a barcode</Text>
        </Pressable>
        {/* Retired stock is out of the way but not out of reach — otherwise
            deactivating is a one-way door and the only way back is a desktop. */}
        {inactiveCount > 0 && (
          <Pressable
            onPress={() => setShowInactive(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8 }}>
            <MaterialCommunityIcons
              name={showInactive ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={COLORS.subtext} />
            <Text style={{ color: COLORS.subtext, fontWeight: '700', fontSize: 13 }}>
              {showInactive ? 'Hide inactive' : `Show inactive (${inactiveCount})`}
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40, gap: 10 }}>
        {filtered.length === 0 && (
          <Text style={{ color: COLORS.subtext, textAlign: 'center', marginTop: 40 }}>
            {items.length === 0 ? 'No inventory items yet. Tap + to add one.' : 'Nothing matches that search.'}
          </Text>
        )}

        {filtered.map(it => {
          const low = it.reorder_point != null && Number(it.qty_on_hand || 0) <= Number(it.reorder_point)
          return (
            <Pressable
              key={it.id}
              onPress={() => openEditor({
                id: it.id, name: it.name || '', sku: it.sku || '', unit: it.unit || 'EA',
                qty_on_hand: String(it.qty_on_hand ?? 0),
                reorder_point: it.reorder_point == null ? '' : String(it.reorder_point),
                unit_cost: it.unit_cost == null ? '' : String(it.unit_cost),
                location: it.location || '', notes: it.notes || '',
                barcode: (it as any).barcode || '', trade: (it as any).trade || '',
                group_name: (it as any).group_name || '', size_rating: (it as any).size_rating || '',
                material_id: (it as any).material_id ?? null,
                is_active: it.is_active !== false,
              })}

              style={{
                backgroundColor: COLORS.card, borderRadius: 16, padding: 14,
                borderWidth: 1, borderColor: low ? '#F2B01E' : COLORS.border,
                flexDirection: 'row', alignItems: 'center', gap: 12,
                // Visible when Show inactive is on, but obviously retired.
                opacity: it.is_active === false ? 0.55 : 1,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 15 }}>{it.name}</Text>
                <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 2 }}>
                  {[it.sku, it.location].filter(Boolean).join(' · ') || 'No SKU or location'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: low ? '#B45309' : COLORS.navy, fontWeight: '900', fontSize: 17 }}>
                  {Number(it.qty_on_hand || 0).toLocaleString('en-US')}
                </Text>
                <Text style={{ color: COLORS.subtext, fontSize: 11 }}>{it.unit || 'EA'}</Text>
                {low && <Text style={{ color: '#B45309', fontSize: 10, fontWeight: '800', marginTop: 2 }}>REORDER</Text>}
              </View>
            </Pressable>
          )
        })}

        {filtered.length > 0 && (
          <Text style={{ color: COLORS.subtext, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
            Tap to edit · long-press to delete
          </Text>
        )}
      </ScrollView>

      <Modal visible={!!editing} animationType="slide" transparent onRequestClose={() => !saving && setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
              <Text style={{ color: COLORS.navy, fontWeight: '900', fontSize: 18 }}>
                {editing?.id ? 'Edit item' : 'New item'}
              </Text>

              {/* Pull it out of the catalog instead of retyping it.
                  This is what keeps a stock row and its priced material saying
                  the same thing: name, unit, cost, trade, group, size and
                  barcode all arrive together, and material_id links the two so
                  they stay pointed at each other. Typing the same values by
                  hand looks identical on the day and drifts by the month. */}
              {!editing?.id && (
                <View>
                  <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 6, fontSize: 13 }}>Find it in the material catalog</Text>
                  <TextInput
                    value={catalogQ}
                    onChangeText={(v) => { setCatalogQ(v); searchCatalog(v) }}
                    placeholder="Type 2 letters — name or item code"
                    placeholderTextColor={COLORS.subtext}
                    autoCorrect={false}
                    style={{ backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, color: COLORS.text }}
                  />
                  {catalogHits.length > 0 && (
                    <View style={{ marginTop: 8, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, overflow: 'hidden' }}>
                      {catalogHits.map(m => (
                        <Pressable key={m.id} onPress={() => applyCatalog(m)}
                          style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.card }}>
                          <Text style={{ color: COLORS.text, fontWeight: '700' }} numberOfLines={2}>{m.description}</Text>
                          <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 2 }}>
                            {[m.item_code, m.trade, m.group_name, m.unit].filter(Boolean).join(' · ')}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {editing?.material_id ? (
                    <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.tealSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
                      <MaterialCommunityIcons name="link-variant" size={16} color={COLORS.teal} />
                      <Text style={{ color: COLORS.teal, fontWeight: '800', flex: 1 }}>Linked to the catalog</Text>
                      <Pressable onPress={() => setEditing(p => (p ? { ...p, material_id: null } : p))}>
                        <Text style={{ color: COLORS.navy, fontWeight: '800' }}>Unlink</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {/* A scanned code is kept over the catalog's, because it came
                      off the box in front of the crew. But scans go wrong —
                      a neighbouring label, a shelf tag, the wrong side of the
                      carton — so when the two disagree, say so and make the swap
                      one tap. Silently preferring either one is what leaves a
                      barcode nobody can explain. */}
                  {editing?.material_id && catalogBarcode && editing.barcode && catalogBarcode !== editing.barcode ? (
                    <View style={{ marginTop: 8, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
                      <Text style={{ color: '#92400E', fontWeight: '800', fontSize: 12 }}>This barcode differs from the catalog&apos;s</Text>
                      <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>Scanned {editing.barcode} · catalog {catalogBarcode}</Text>
                      <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
                        <Pressable onPress={() => setEditing(p => (p ? { ...p, barcode: catalogBarcode } : p))}>
                          <Text style={{ color: COLORS.navy, fontWeight: '800' }}>Use the catalog&apos;s</Text>
                        </Pressable>
                        <Pressable onPress={() => setCatalogBarcode(null)}>
                          <Text style={{ color: COLORS.subtext, fontWeight: '800' }}>Keep the scan</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              )}

              {([
                ['name', 'Name *', 'default'],
                ['sku', 'SKU', 'default'],
                ['barcode', 'Barcode', 'default'],
                ['unit', 'Unit', 'default'],
                ['qty_on_hand', 'Quantity on hand', 'numeric'],
                ['reorder_point', 'Reorder point', 'numeric'],
                ['unit_cost', 'Unit cost', 'numeric'],
                ['trade', 'Trade', 'default'],
                ['group_name', 'Group', 'default'],
                ['size_rating', 'Size / rating', 'default'],
                ['location', 'Location', 'default'],
                ['notes', 'Notes', 'default'],
              ] as const).map(([key, label, kb]) => (
                <View key={key}>
                  <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 6, fontSize: 13 }}>{label}</Text>
                  <TextInput
                    value={(editing as any)?.[key] ?? ''}
                    onChangeText={t => setEditing(p => (p ? { ...p, [key]: t } : p))}
                    keyboardType={kb === 'numeric' ? 'decimal-pad' : 'default'}
                    multiline={key === 'notes'}
                    style={{
                      backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
                      paddingHorizontal: 14, paddingVertical: 12, color: COLORS.text,
                      minHeight: key === 'notes' ? 80 : undefined,
                      textAlignVertical: key === 'notes' ? 'top' : 'center',
                    }}
                  />
                </View>
              ))}

              {/* Active, and what can be done with it.
                  Retiring stock is the normal case: the item existed, it moved,
                  and the ledger still has to mean something. Deleting is for the
                  one you just typed by mistake. Which of the two is offered is
                  decided by whether anything has ever moved, asked before the
                  fact rather than discovered through a foreign-key error. */}
              {editing?.id ? (
                <View style={{ marginTop: 4, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 12 }}>
                  <Pressable
                    onPress={() => setEditing(p => (p ? { ...p, is_active: !(p.is_active !== false) } : p))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <MaterialCommunityIcons
                      name={editing.is_active !== false ? 'toggle-switch' : 'toggle-switch-off-outline'}
                      size={30}
                      color={editing.is_active !== false ? COLORS.green : COLORS.subtext} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontWeight: '800' }}>
                        {editing.is_active !== false ? 'Active' : 'Inactive'}
                      </Text>
                      <Text style={{ color: COLORS.subtext, fontSize: 12 }}>
                        {editing.is_active !== false
                          ? 'Counted and shown in the list'
                          : 'Hidden from the list; its history is kept'}
                      </Text>
                    </View>
                  </Pressable>

                  {historyCount === null ? (
                    <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 10 }}>Checking its history…</Text>
                  ) : historyCount > 0 ? (
                    <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 10, lineHeight: 18 }}>
                      {historyCount} stock movement{historyCount === 1 ? '' : 's'} recorded, so this cannot be deleted —
                      the ledger would stop adding up. Switch it to Inactive instead.
                    </Text>
                  ) : (
                    <Pressable
                      onPress={() => remove({ id: editing.id, name: editing.name } as Item)}
                      disabled={saving}
                      style={{ marginTop: 12, borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, paddingVertical: 11, alignItems: 'center' }}>
                      <Text style={{ color: '#B91C1C', fontWeight: '800' }}>Delete — nothing has moved yet</Text>
                    </Pressable>
                  )}
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                <Pressable
                  onPress={() => setEditing(null)}
                  disabled={saving}
                  style={{ flex: 1, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingVertical: 15, alignItems: 'center' }}
                >
                  <Text style={{ color: COLORS.navy, fontWeight: '800' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={save}
                  disabled={saving}
                  style={{ flex: 1, backgroundColor: COLORS.navy, borderRadius: 16, paddingVertical: 15, alignItems: 'center', opacity: saving ? 0.6 : 1 }}
                >
                  <Text style={{ color: COLORS.white, fontWeight: '800' }}>{saving ? 'Saving…' : 'Save'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}
