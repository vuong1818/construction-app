import { Ionicons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

type Item = { id: number; name: string; unit: string | null; qty_on_hand: number | null }
type Loc = { id: number; name: string; kind: string }
type Proj = { id: number; name: string }

export default function InventoryScan() {
  const { t } = useLanguage()
  const router = useRouter()
  const [permission, requestPermission] = useCameraPermissions()

  const [locations, setLocations] = useState<Loc[]>([])
  const [projects, setProjects] = useState<Proj[]>([])
  const [uid, setUid] = useState<string | null>(null)

  const [scanning, setScanning] = useState(true)
  const [item, setItem] = useState<Item | null>(null)
  const [notFound, setNotFound] = useState<string | null>(null)
  const [dir, setDir] = useState<'in' | 'out'>('out')
  const [qty, setQty] = useState('1')
  const [locId, setLocId] = useState<number | null>(null)
  const [projId, setProjId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (permission && !permission.granted) requestPermission() }, [permission])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUid(user?.id || null)
      const [{ data: loc }, { data: pr }] = await Promise.all([
        supabase.from('inventory_locations').select('id, name, kind').eq('is_active', true).order('kind').order('name'),
        supabase.from('projects').select('id, name').order('name'),
      ])
      const ls = (loc as Loc[]) || []
      setLocations(ls)
      setProjects((pr as Proj[]) || [])
      setLocId(ls[0]?.id ?? null)
    })()
  }, [])

  const onScan = useCallback(async ({ data }: { data: string }) => {
    setScanning(false)
    const { data: found } = await supabase
      .from('inventory_items').select('id, name, unit, qty_on_hand').eq('barcode', data).limit(1).maybeSingle()
    if (found) { setItem(found as Item); setNotFound(null); setQty('1'); setDir('out') }
    else { setItem(null); setNotFound(data) }
  }, [])

  function resume() { setItem(null); setNotFound(null); setScanning(true) }

  async function record() {
    if (!item) return
    const n = Number(qty)
    if (!n || n <= 0) return
    setSaving(true)
    const from = dir === 'out' ? locId : null
    const to = dir === 'in' ? locId : null
    const reason = dir === 'in' ? 'receive' : (projId ? 'issue' : 'consume')
    const { error } = await supabase.from('inventory_movements').insert({
      item_id: item.id, qty: n, from_location_id: from, to_location_id: to,
      project_id: dir === 'out' ? projId : null, user_id: uid, reason,
    })
    setSaving(false)
    if (!error) resume()
  }

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.navy }}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{t('inventoryScan')}</Text>
      <Pressable onPress={() => router.back()}><Ionicons name="close" size={26} color="#fff" /></Pressable>
    </View>
  )

  if (!permission) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.teal} /></SafeAreaView>
  }
  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        {header}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 }}>
          <Ionicons name="camera-outline" size={48} color={COLORS.border} />
          <Text style={{ color: COLORS.text, textAlign: 'center', marginTop: 12, marginBottom: 16, lineHeight: 20 }}>{t('scanNeedCamera')}</Text>
          <Pressable onPress={requestPermission} style={{ backgroundColor: COLORS.navy, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{t('scanGrant')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
      {header}

      {scanning ? (
        <View style={{ flex: 1 }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={onScan}
            barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8', 'code128', 'code39'] }}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: 260, height: 150, borderWidth: 3, borderColor: '#fff', borderRadius: 16 }} />
              <Text style={{ color: '#fff', marginTop: 16, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>{t('scanAim')}</Text>
            </View>
          </CameraView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 18 }}>
          {notFound && (
            <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }}>
              <Ionicons name="help-circle-outline" size={44} color={COLORS.subtext} />
              <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 16, marginTop: 8 }}>{t('scanNotFound')}</Text>
              <Text style={{ color: COLORS.subtext, marginTop: 4 }}>{notFound}</Text>
              <Text style={{ color: COLORS.subtext, fontSize: 12, textAlign: 'center', marginTop: 8 }}>{t('scanAddFirst')}</Text>
              <Pressable onPress={resume} style={{ backgroundColor: COLORS.navy, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 16 }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{t('scanAgain')}</Text>
              </Pressable>
            </View>
          )}

          {item && (
            <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: COLORS.border }}>
              <Text style={{ color: COLORS.navy, fontWeight: '900', fontSize: 20 }}>{item.name}</Text>
              <Text style={{ color: COLORS.subtext, marginTop: 2, marginBottom: 16 }}>{Number(item.qty_on_hand || 0).toLocaleString('en-US')} {item.unit || ''} {t('scanOnHand')}</Text>

              {/* Direction */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                {(['out', 'in'] as const).map(d => (
                  <Pressable key={d} onPress={() => setDir(d)} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 2, borderColor: dir === d ? COLORS.teal : COLORS.border, backgroundColor: dir === d ? COLORS.tealSoft : COLORS.background }}>
                    <Text style={{ color: dir === d ? COLORS.teal : COLORS.subtext, fontWeight: '800' }}>{d === 'out' ? t('scanTake') : t('scanReceive')}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Qty */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.subtext, textTransform: 'uppercase', marginBottom: 6 }}>{t('scanQtyLabel')}</Text>
              <TextInput value={qty} onChangeText={setQty} keyboardType="numeric" style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 18, color: COLORS.text, marginBottom: 16 }} />

              {/* Location */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.subtext, textTransform: 'uppercase', marginBottom: 6 }}>{dir === 'out' ? t('scanFromLoc') : t('scanToLoc')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {locations.length === 0 && <Text style={{ color: COLORS.subtext, fontStyle: 'italic' }}>{t('scanNoLocations')}</Text>}
                {locations.map(l => (
                  <Pressable key={l.id} onPress={() => setLocId(l.id)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: locId === l.id ? COLORS.teal : COLORS.border, backgroundColor: locId === l.id ? COLORS.tealSoft : COLORS.background }}>
                    <Text style={{ color: locId === l.id ? COLORS.teal : COLORS.subtext, fontWeight: '700', fontSize: 13 }}>{l.name}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Project (only for Out) */}
              {dir === 'out' && (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.subtext, textTransform: 'uppercase', marginBottom: 6 }}>{t('scanProjLabel')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                    <Pressable onPress={() => setProjId(null)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: projId === null ? COLORS.teal : COLORS.border, backgroundColor: projId === null ? COLORS.tealSoft : COLORS.background }}>
                      <Text style={{ color: projId === null ? COLORS.teal : COLORS.subtext, fontWeight: '700', fontSize: 13 }}>{t('scanNoProject')}</Text>
                    </Pressable>
                    {projects.map(p => (
                      <Pressable key={p.id} onPress={() => setProjId(p.id)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: projId === p.id ? COLORS.teal : COLORS.border, backgroundColor: projId === p.id ? COLORS.tealSoft : COLORS.background }}>
                        <Text style={{ color: projId === p.id ? COLORS.teal : COLORS.subtext, fontWeight: '700', fontSize: 13 }}>{p.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={record} disabled={saving || locId === null} style={{ flex: 1, backgroundColor: COLORS.navy, borderRadius: 12, paddingVertical: 15, alignItems: 'center', opacity: (saving || locId === null) ? 0.5 : 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{saving ? '…' : t('scanRecord')}</Text>
                </Pressable>
                <Pressable onPress={resume} style={{ flex: 1, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 15, alignItems: 'center' }}>
                  <Text style={{ color: COLORS.subtext, fontWeight: '800', fontSize: 15 }}>{t('scanAgain')}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}
