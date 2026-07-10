import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { COLORS } from '../../../lib/theme'

// Material Requests: the crew flags material they're missing/short on the field so
// the office can fulfill from inventory or add it to an order. Tracked
// requested → ordered → fulfilled (or cancelled). Workers raise; office moves status.
type Req = {
  id: number; item_name: string; qty: number; unit: string; note: string | null
  status: 'requested' | 'ordered' | 'fulfilled' | 'cancelled'
  requested_by: string | null; created_at: string
}

const STATUS: Record<string, { bg: string; fg: string; key: 'matReqStatusRequested' | 'matReqStatusOrdered' | 'matReqStatusFulfilled' | 'matReqStatusCancelled' }> = {
  requested: { bg: '#FEF3C7', fg: '#92400E', key: 'matReqStatusRequested' },
  ordered:   { bg: '#DBEAFE', fg: '#1E40AF', key: 'matReqStatusOrdered' },
  fulfilled: { bg: '#DCFCE7', fg: '#166534', key: 'matReqStatusFulfilled' },
  cancelled: { bg: '#E5E7EB', fg: '#6B7280', key: 'matReqStatusCancelled' },
}

export default function MaterialRequestsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const projectId = Number(id)
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Req[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [uid, setUid] = useState<string | null>(null)
  const [isManager, setIsManager] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [itemName, setItemName] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('EA')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200) }

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const myId = session?.user?.id || null
    setUid(myId)
    if (myId) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', myId).single()
      const role = (prof as any)?.role
      setIsManager(role === 'manager' || role === 'owner' || role === 'warehouse')
    }
    const { data } = await supabase.from('material_requests').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
    const list = (data as Req[]) || []
    setRows(list)
    const ids = [...new Set(list.map(r => r.requested_by).filter(Boolean) as string[])]
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      setNames(Object.fromEntries(((profs as any[]) || []).map(p => [p.id, p.full_name])))
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function submit() {
    if (!itemName.trim()) { flash(t('matReqNameRequired')); return }
    setSaving(true)
    const { error } = await supabase.from('material_requests').insert({
      project_id: projectId, item_name: itemName.trim(),
      qty: Number(qty) || 1, unit: unit.trim() || 'EA', note: note.trim() || null, requested_by: uid,
    })
    setSaving(false)
    if (error) { flash(error.message); return }
    setItemName(''); setQty('1'); setUnit('EA'); setNote(''); setShowForm(false)
    flash(t('matReqSubmitted')); load()
  }

  async function setStatus(req: Req, status: Req['status']) {
    const patch: any = { status, updated_at: new Date().toISOString(), handled_by: uid }
    if (status === 'fulfilled') patch.fulfilled_at = new Date().toISOString()
    const { error } = await supabase.from('material_requests').update(patch).eq('id', req.id)
    if (error) { flash(error.message); return }
    load()
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>{t('matReqLoading')}</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        <View style={{ backgroundColor: COLORS.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.navy }}>{t('matReqTitle')}</Text>
          <Text style={{ color: COLORS.subtext, marginTop: 2 }}>{t('matReqSubtitle')}</Text>
          <Pressable onPress={() => setShowForm(v => !v)}
            style={{ marginTop: 14, backgroundColor: showForm ? COLORS.background : COLORS.navy, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: showForm ? COLORS.border : COLORS.navy }}>
            <Text style={{ color: showForm ? COLORS.navy : 'white', fontWeight: '800' }}>{showForm ? t('cancel') : t('matReqNew')}</Text>
          </Pressable>
        </View>

        {showForm && (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 }}>
            <Field label={t('matReqMaterial')}>
              <TextInput style={inputStyle} value={itemName} onChangeText={setItemName} placeholder={t('matReqMaterialPlaceholder')} placeholderTextColor={COLORS.subtext} />
            </Field>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label={t('matReqQty')}>
                  <TextInput style={inputStyle} value={qty} onChangeText={setQty} keyboardType="numeric" placeholderTextColor={COLORS.subtext} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label={t('matReqUnit')}>
                  <TextInput style={inputStyle} value={unit} onChangeText={setUnit} placeholderTextColor={COLORS.subtext} />
                </Field>
              </View>
            </View>
            <Field label={t('matReqNote')}>
              <TextInput style={[inputStyle, { minHeight: 60, textAlignVertical: 'top' }]} value={note} onChangeText={setNote} placeholder={t('matReqNotePlaceholder')} placeholderTextColor={COLORS.subtext} multiline />
            </Field>
            <Pressable onPress={submit} disabled={saving} style={{ backgroundColor: COLORS.teal, borderRadius: 12, paddingVertical: 13, alignItems: 'center', opacity: saving ? 0.6 : 1 }}>
              <Text style={{ color: 'white', fontWeight: '800' }}>{saving ? '…' : t('matReqSubmit')}</Text>
            </Pressable>
          </View>
        )}

        {rows.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 30 }}>
            <MaterialCommunityIcons name="package-variant" size={48} color={COLORS.border} />
            <Text style={{ color: COLORS.subtext, marginTop: 10 }}>{t('matReqNone')}</Text>
          </View>
        ) : rows.map(req => {
          const s = STATUS[req.status] || STATUS.requested
          return (
            <View key={req.id} style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <View style={{ backgroundColor: s.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color: s.fg, fontWeight: '800', fontSize: 11 }}>{t(s.key)}</Text>
                </View>
                <Text style={{ fontWeight: '800', color: COLORS.navy, fontSize: 16, flexShrink: 1 }}>{req.item_name}</Text>
              </View>
              <Text style={{ color: COLORS.text, marginTop: 6, fontWeight: '700' }}>{Number(req.qty).toLocaleString('en-US')} {req.unit}</Text>
              {req.note ? <Text style={{ color: COLORS.subtext, marginTop: 4, lineHeight: 20 }}>{req.note}</Text> : null}
              <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 6 }}>
                {t('matReqRequestedBy')} {names[req.requested_by || ''] || '—'} · {new Date(req.created_at).toLocaleDateString()}
              </Text>

              {isManager && req.status !== 'fulfilled' && req.status !== 'cancelled' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {req.status === 'requested' && <SmallBtn label={t('matReqMarkOrdered')} onPress={() => setStatus(req, 'ordered')} />}
                  <SmallBtn label={t('matReqFulfill')} color="#166534" onPress={() => setStatus(req, 'fulfilled')} />
                  <SmallBtn label={t('matReqCancel')} color="#B91C1C" onPress={() => setStatus(req, 'cancelled')} />
                </View>
              )}
            </View>
          )
        })}
      </ScrollView>

      {toast ? (
        <View style={{ position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: COLORS.navy, borderRadius: 12, padding: 14, alignItems: 'center' }}>
          <Text style={{ color: 'white', fontWeight: '700' }}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  )
}

const inputStyle = { backgroundColor: COLORS.background, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: 15 } as const

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontWeight: '700', color: COLORS.navy, fontSize: 13, marginBottom: 5 }}>{label}</Text>
      {children}
    </View>
  )
}

function SmallBtn({ label, onPress, color }: { label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={{ borderWidth: 1, borderColor: color ? color + '55' : COLORS.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 }}>
      <Text style={{ color: color || COLORS.navy, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}
