import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { COLORS } from '../../../lib/theme'

// Material Requests: the crew builds a LIST of material they need and sends it to the
// office. Each item is typed, barcode-scanned, and/or photographed (when they don't know
// what it's called). This is a REQUEST only — it never decrements inventory.
type Req = {
  id: number; item_name: string; qty: number; unit: string; note: string | null
  status: 'requested' | 'ordered' | 'fulfilled' | 'cancelled'
  requested_by: string | null; created_at: string
  photo_url: string | null; barcode: string | null; batch_id: string | null
}

type Draft = { key: string; name: string; qty: string; unit: string; barcode: string | null; photoUri: string | null }
type Mode = 'type' | 'scan' | 'photo'

const PHOTO_BUCKET = 'material-photos'

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
  const [permission, requestPermission] = useCameraPermissions()

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Req[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [uid, setUid] = useState<string | null>(null)
  const [isManager, setIsManager] = useState(false)

  // Draft request being built.
  const [building, setBuilding] = useState(false)
  const [draft, setDraft] = useState<Draft[]>([])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  // Add-item modal.
  const [itemOpen, setItemOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('type')
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('EA')
  const [barcode, setBarcode] = useState<string | null>(null)
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [scanned, setScanned] = useState(false)

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2400) }

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

  function resetItem() {
    setMode('type'); setName(''); setQty('1'); setUnit('EA'); setBarcode(null); setPhotoUri(null); setScanned(false)
  }
  function openItem() { resetItem(); setItemOpen(true) }

  async function switchMode(m: Mode) {
    if (m === 'scan' && permission && !permission.granted) {
      const res = await requestPermission()
      if (!res.granted) { flash(t('scanNeedCamera')); return }
    }
    setMode(m); setScanned(false)
  }

  async function onScan({ data }: { data: string }) {
    if (scanned) return
    setScanned(true)
    setBarcode(data)
    // If we recognize the barcode, prefill the name so the office sees a known item.
    const { data: found } = await supabase.from('inventory_items').select('name, unit').eq('barcode', data).limit(1).maybeSingle()
    if (found) { setName((found as any).name || ''); if ((found as any).unit) setUnit((found as any).unit) }
  }

  async function pickPhoto(source: 'camera' | 'library') {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { flash(t('scanNeedCamera')); return }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images })
    if (result.canceled || !result.assets?.length) return
    setPhotoUri(result.assets[0].uri)
  }

  function addToDraft() {
    if (!name.trim() && !barcode && !photoUri) { flash(t('matReqNeedItem')); return }
    const n = Number(qty)
    if (!n || n <= 0) { flash(t('matReqQtyRequired')); return }
    setDraft(d => [...d, { key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim(), qty, unit: unit.trim() || 'EA', barcode, photoUri }])
    setItemOpen(false)
  }

  async function uploadPhoto(uri: string): Promise<string | null> {
    try {
      const resp = await fetch(uri)
      const buf = await resp.arrayBuffer()
      const ext = (uri.split('.').pop() || 'jpg').toLowerCase()
      const path = `${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, buf, { contentType: 'image/jpeg', upsert: false })
      if (error) return null
      return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl
    } catch { return null }
  }

  async function submitRequest() {
    if (draft.length === 0) { flash(t('matReqNeedItem')); return }
    setSubmitting(true)
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const noteVal = note.trim() || null
    const rowsToInsert: any[] = []
    for (const it of draft) {
      let photo_url: string | null = null
      if (it.photoUri) photo_url = await uploadPhoto(it.photoUri)
      rowsToInsert.push({
        project_id: projectId,
        item_name: it.name || (it.barcode ? `Barcode ${it.barcode}` : t('matReqPhotoItem')),
        qty: Number(it.qty) || 1, unit: it.unit || 'EA',
        note: noteVal, barcode: it.barcode, photo_url, batch_id: batchId, requested_by: uid,
      })
    }
    const { error } = await supabase.from('material_requests').insert(rowsToInsert)
    setSubmitting(false)
    if (error) { flash(error.message); return }
    setDraft([]); setNote(''); setBuilding(false)
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
          <Pressable onPress={() => { setBuilding(v => !v); if (building) { setDraft([]); setNote('') } }}
            style={{ marginTop: 14, backgroundColor: building ? COLORS.background : COLORS.navy, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: building ? COLORS.border : COLORS.navy }}>
            <Text style={{ color: building ? COLORS.navy : 'white', fontWeight: '800' }}>{building ? t('cancel') : t('matReqNew')}</Text>
          </Pressable>
        </View>

        {building && (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 }}>
            {/* Draft item list */}
            {draft.length === 0 ? (
              <Text style={{ color: COLORS.subtext, textAlign: 'center', paddingVertical: 14 }}>{t('matReqEmptyList')}</Text>
            ) : draft.map((it, idx) => (
              <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: idx < draft.length - 1 ? 1 : 0, borderBottomColor: COLORS.border }}>
                {it.photoUri
                  ? <Image source={{ uri: it.photoUri }} style={{ width: 42, height: 42, borderRadius: 8 }} />
                  : <View style={{ width: 42, height: 42, borderRadius: 8, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialCommunityIcons name={it.barcode ? 'barcode' : 'package-variant'} size={22} color={COLORS.subtext} />
                    </View>}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.navy, fontWeight: '700' }}>{it.name || (it.barcode ? `Barcode ${it.barcode}` : t('matReqPhotoItem'))}</Text>
                  <Text style={{ color: COLORS.subtext, fontSize: 13 }}>{Number(it.qty).toLocaleString('en-US')} {it.unit}</Text>
                </View>
                <Pressable onPress={() => setDraft(d => d.filter(x => x.key !== it.key))} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color="#B91C1C" />
                </Pressable>
              </View>
            ))}

            <Pressable onPress={openItem} style={{ marginTop: 12, borderWidth: 1, borderColor: COLORS.teal, borderRadius: 12, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Ionicons name="add-circle-outline" size={20} color={COLORS.teal} />
              <Text style={{ color: COLORS.teal, fontWeight: '800' }}>{t('matReqAddItem')}</Text>
            </Pressable>

            <Text style={{ fontWeight: '700', color: COLORS.navy, fontSize: 13, marginTop: 16, marginBottom: 5 }}>{t('matReqNote')}</Text>
            <TextInput style={[inputStyle, { minHeight: 60, textAlignVertical: 'top' }]} value={note} onChangeText={setNote} placeholder={t('matReqNotePlaceholder')} placeholderTextColor={COLORS.subtext} multiline />

            <Pressable onPress={submitRequest} disabled={submitting || draft.length === 0}
              style={{ marginTop: 14, backgroundColor: COLORS.teal, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: (submitting || draft.length === 0) ? 0.5 : 1 }}>
              <Text style={{ color: 'white', fontWeight: '800' }}>{submitting ? '…' : `${t('matReqSubmitList')} (${draft.length})`}</Text>
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
              {req.photo_url ? <Image source={{ uri: req.photo_url }} style={{ width: '100%', height: 160, borderRadius: 10, marginTop: 8 }} resizeMode="cover" /> : null}
              <Text style={{ color: COLORS.text, marginTop: 6, fontWeight: '700' }}>{Number(req.qty).toLocaleString('en-US')} {req.unit}</Text>
              {req.barcode ? <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 2 }}>🔖 {req.barcode}</Text> : null}
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

      {/* Add-item modal: type / scan / photo */}
      <Modal visible={itemOpen} transparent animationType="slide" onRequestClose={() => setItemOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '90%' }}>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: COLORS.navy }}>{t('matReqAddItem')}</Text>
                <Pressable onPress={() => setItemOpen(false)}><Ionicons name="close" size={26} color={COLORS.subtext} /></Pressable>
              </View>

              {/* Mode tabs */}
              <View style={{ flexDirection: 'row', backgroundColor: COLORS.background, borderRadius: 12, padding: 4, marginBottom: 16 }}>
                {(['type', 'scan', 'photo'] as Mode[]).map(m => (
                  <Pressable key={m} onPress={() => switchMode(m)} style={{ flex: 1, paddingVertical: 10, borderRadius: 9, backgroundColor: mode === m ? COLORS.navy : 'transparent', alignItems: 'center' }}>
                    <Text style={{ color: mode === m ? 'white' : COLORS.subtext, fontWeight: '800', fontSize: 13 }}>
                      {m === 'type' ? t('matReqType') : m === 'scan' ? t('matReqScan') : t('matReqPhoto')}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {mode === 'scan' && (
                <View style={{ marginBottom: 14 }}>
                  {!scanned ? (
                    <View style={{ height: 220, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }}>
                      {permission?.granted ? (
                        <CameraView style={{ flex: 1 }} facing="back" onBarcodeScanned={onScan}
                          barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8', 'code128', 'code39'] }}>
                          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <View style={{ width: 200, height: 110, borderWidth: 3, borderColor: '#fff', borderRadius: 12 }} />
                            <Text style={{ color: '#fff', marginTop: 10, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>{t('scanAim')}</Text>
                          </View>
                        </CameraView>
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <Pressable onPress={() => switchMode('scan')} style={{ backgroundColor: COLORS.navy, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 }}>
                            <Text style={{ color: '#fff', fontWeight: '800' }}>{t('scanGrant')}</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={{ backgroundColor: COLORS.tealSoft, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <MaterialCommunityIcons name="barcode-scan" size={26} color={COLORS.teal} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.teal, fontWeight: '800' }}>{t('matReqScanned')}</Text>
                        <Text style={{ color: COLORS.text }}>{barcode}</Text>
                      </View>
                      <Pressable onPress={() => { setScanned(false); setBarcode(null) }}>
                        <Text style={{ color: COLORS.navy, fontWeight: '800' }}>{t('scanAgain')}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}

              {mode === 'photo' && (
                <View style={{ marginBottom: 14 }}>
                  {photoUri ? (
                    <View>
                      <Image source={{ uri: photoUri }} style={{ width: '100%', height: 200, borderRadius: 12 }} resizeMode="cover" />
                      <Pressable onPress={() => setPhotoUri(null)} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                        <Text style={{ color: '#B91C1C', fontWeight: '700' }}>{t('matReqRemovePhoto')}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Pressable onPress={() => pickPhoto('camera')} style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 16, alignItems: 'center', gap: 6 }}>
                        <Ionicons name="camera-outline" size={26} color={COLORS.navy} />
                        <Text style={{ color: COLORS.navy, fontWeight: '700', fontSize: 13 }}>{t('matReqTakePhoto')}</Text>
                      </Pressable>
                      <Pressable onPress={() => pickPhoto('library')} style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 16, alignItems: 'center', gap: 6 }}>
                        <Ionicons name="images-outline" size={26} color={COLORS.navy} />
                        <Text style={{ color: COLORS.navy, fontWeight: '700', fontSize: 13 }}>{t('matReqChoosePhoto')}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}

              {/* Name — always available (optional when a barcode/photo is attached). */}
              <Text style={{ fontWeight: '700', color: COLORS.navy, fontSize: 13, marginBottom: 5 }}>
                {mode === 'type' ? t('matReqMaterial') : t('matReqOptionalName')}
              </Text>
              <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder={t('matReqMaterialPlaceholder')} placeholderTextColor={COLORS.subtext} />

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: COLORS.navy, fontSize: 13, marginBottom: 5 }}>{t('matReqQty')}</Text>
                  <TextInput style={inputStyle} value={qty} onChangeText={setQty} keyboardType="numeric" placeholderTextColor={COLORS.subtext} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: COLORS.navy, fontSize: 13, marginBottom: 5 }}>{t('matReqUnit')}</Text>
                  <TextInput style={inputStyle} value={unit} onChangeText={setUnit} placeholderTextColor={COLORS.subtext} />
                </View>
              </View>

              <Pressable onPress={addToDraft} style={{ marginTop: 18, backgroundColor: COLORS.navy, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: 'white', fontWeight: '800' }}>{t('matReqAddToList')}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {toast ? (
        <View style={{ position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: COLORS.navy, borderRadius: 12, padding: 14, alignItems: 'center' }}>
          <Text style={{ color: 'white', fontWeight: '700' }}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  )
}

const inputStyle = { backgroundColor: COLORS.background, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: 15 } as const

function SmallBtn({ label, onPress, color }: { label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={{ borderWidth: 1, borderColor: color ? color + '55' : COLORS.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 }}>
      <Text style={{ color: color || COLORS.navy, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}
