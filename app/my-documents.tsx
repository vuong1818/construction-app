// Me → My documents: what the company has on file for me (read-only:
// licenses, certifications, tax forms are the office's) and the documents I
// sign in the app, such as the NDA / IP assignment — same signature pad as
// the safety paperwork.
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { Badge, Card } from '../components/ui'
import { useLanguage } from '../lib/i18n'
import { SIGNATURE_HTML } from '../lib/signaturePad'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

type Doc = { id: number; file_path: string | null; issued_on: string | null; expires_on: string | null; signed_at: string | null; signed_name: string | null; expired: boolean; expiring: boolean }
type Type = { key: string; label: string; required: boolean; expires: boolean; signable: boolean; doc: Doc | null; state: 'ok' | 'expiring' | 'expired' | 'missing' | 'none' }
type Status = { employment_type: string; types: Type[]; others: { id: number; label: string; expires_on: string | null }[] }

const DATA_URL = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/
const fmt = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString() : '')

export default function MyDocumentsScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const [status, setStatus] = useState<Status | null>(null)
  const [name, setName] = useState('')
  const [signing, setSigning] = useState<Type | null>(null)
  const [sig, setSig] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const webviewRef = useRef<WebView>(null)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [{ data }, { data: prof }] = await Promise.all([
      supabase.rpc('worker_document_status'),
      supabase.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle(),
    ])
    if (data) setStatus(data as Status)
    if (prof?.full_name) setName(prof.full_name)
  }, [])
  useEffect(() => { load() }, [load])

  function onPadMessage(event: any) {
    try {
      const msg = JSON.parse(event.nativeEvent.data)
      if (msg.type === 'empty') { Alert.alert(t('noSignatureTitle'), t('noSignatureDrawFirst')); return }
      if (msg.type === 'signature') setSig(msg.data)
    } catch { /* ignore */ }
  }

  async function confirmSign() {
    if (!signing || !sig) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('not signed in')
      let path: string | null = null
      const m = DATA_URL.exec(sig)
      if (m) {
        const bin = atob(m[2])
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const p = `workers/${session.user.id}/signatures/${signing.key}-${Date.now()}.png`
        const { data: up, error: upErr } = await supabase.storage.from('compliance-docs').upload(p, bytes, { contentType: 'image/png', upsert: false })
        if (upErr) throw upErr
        path = up?.path || p
      }
      const { error } = await supabase.rpc('sign_worker_document', { p_doc_key: signing.key, p_signed_name: name || t('unknownWorker'), p_signature_path: path })
      if (error) throw error
      setSigning(null); setSig(null)
      await load()
      Alert.alert(t('signed'), t('documentSignedBody', { doc: signing.label }))
    } catch (e: any) {
      Alert.alert(t('error'), e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  const tone = (s: Type['state']) => (s === 'ok' ? 'ok' : s === 'expiring' ? 'warn' : s === 'expired' || s === 'missing' ? 'danger' : 'neutral') as any
  const label = (s: Type['state']) => ({ ok: t('docOnFile'), expiring: t('docExpiring'), expired: t('docExpired'), missing: t('docMissing'), none: t('docNotOnFile') }[s])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
          <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="arrow-back" size={18} color="#D9F6FB" />
            <Text style={{ color: '#D9F6FB' }}>{t('back')}</Text>
          </Pressable>
          <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800', marginBottom: 6 }}>{t('myDocuments')}</Text>
          <Text style={{ color: '#D9F6FB', lineHeight: 20, fontSize: 13 }}>{t('myDocumentsIntro')}</Text>
        </View>

        {!status ? <ActivityIndicator color={COLORS.navy} /> : (
          <>
            {status.types.filter(x => x.signable).map(x => (
              <Card key={x.key} title={x.label} subtitle={x.doc?.signed_at ? `${t('signedBy')} ${x.doc.signed_name} · ${fmt(x.doc.signed_at)}` : t('signInApp')}>
                {x.doc?.signed_at ? (
                  <Badge tone="ok" label={t('signed')} />
                ) : (
                  <Pressable onPress={() => { setSig(null); setSigning(x) }} style={{ backgroundColor: COLORS.teal, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 15 }}>{t('signNow')}</Text>
                  </Pressable>
                )}
              </Card>
            ))}

            <Card title={t('onFileWithOffice')}>
              {status.types.filter(x => !x.signable).map((x, i, arr) => (
                <View key={x.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: COLORS.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>{x.label}</Text>
                    {x.doc?.expires_on ? <Text style={{ color: x.doc.expired ? COLORS.red : COLORS.muted, fontSize: 12 }}>{t('expires')} {fmt(x.doc.expires_on)}</Text> : null}
                  </View>
                  <Badge tone={tone(x.state)} label={label(x.state)} />
                </View>
              ))}
              {status.others.map(o => (
                <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15, flex: 1 }}>{o.label}</Text>
                  {o.expires_on ? <Text style={{ color: COLORS.muted, fontSize: 12 }}>{t('expires')} {fmt(o.expires_on)}</Text> : null}
                </View>
              ))}
              <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 8 }}>{t('docsManagedByOffice')}</Text>
            </Card>
          </>
        )}
      </ScrollView>

      <Modal visible={!!signing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSigning(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View style={{ padding: 20, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ color: COLORS.navy, fontSize: 20, fontWeight: '800', flex: 1 }}>{signing?.label}</Text>
              <Pressable onPress={() => setSigning(null)} hitSlop={10}><MaterialCommunityIcons name="close" size={26} color={COLORS.muted} /></Pressable>
            </View>
            <Text style={{ color: COLORS.subtext, fontSize: 13, marginBottom: 12, lineHeight: 19 }}>{t('ndaSignText', { name: name || t('unknownWorker') })}</Text>
            <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 }}>{t('signingAs').toUpperCase()}</Text>
            <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 16, marginBottom: 12 }}>{name || t('unknownWorker')}</Text>
            {sig ? (
              <>
                <View style={{ height: 160, backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' }}>
                  <Image source={{ uri: sig }} style={{ width: '100%', height: '100%', resizeMode: 'contain' }} />
                </View>
                <Pressable onPress={() => setSig(null)} style={{ marginTop: 8 }}><Text style={{ color: COLORS.teal, fontWeight: '700' }}>{t('redrawSignature')}</Text></Pressable>
                <Pressable onPress={confirmSign} disabled={saving} style={{ marginTop: 16, backgroundColor: saving ? '#94A3B8' : COLORS.green, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
                  {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 16 }}>{t('confirmSignature')}</Text>}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 6 }}>{t('drawSignaturePrompt')}</Text>
                <View style={{ height: 220, backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' }}>
                  <WebView ref={webviewRef} source={{ html: SIGNATURE_HTML }} style={{ flex: 1, opacity: 0.99 }} scrollEnabled={false} bounces={false} onMessage={onPadMessage} javaScriptEnabled originWhitelist={['*']} />
                </View>
              </>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}
