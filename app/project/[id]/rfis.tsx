import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { useRealtimeRefetch } from '../../../hooks/useRealtimeRefetch'
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { COLORS } from '../../../lib/theme'
import { SignedImage } from '../../../components/SignedImage'
import { forwardToSharedJobsite, loadForwardedRfis, useForwardTarget, type ForwardedRfi } from '../../../lib/sharedJobsite'

// RFI (Request For Information): a field question the office/manager must answer.
// Any worker assigned to the project can raise one; managers answer. Tracked
// open → answered → closed. Separate from daily Reports (a log, not a Q&A thread).
type Rfi = {
  id: number; subject: string; question: string | null; plan_ref: string | null
  status: 'open' | 'answered' | 'closed'; answer: string | null
  rfi_no: string | null; photo_url: string | null
  asked_by: string | null; answered_by: string | null; answered_at: string | null; created_at: string
  forwarded_to_id: number | null; author_name: string | null; author_org: string | null
}

const PHOTO_BUCKET = 'rfi-photos'

const STATUS: Record<string, { bg: string; fg: string; key: 'rfiStatusOpen' | 'rfiStatusAnswered' | 'rfiStatusClosed' }> = {
  open:     { bg: '#FEF3C7', fg: '#92400E', key: 'rfiStatusOpen' },
  answered: { bg: '#DCFCE7', fg: '#166534', key: 'rfiStatusAnswered' },
  closed:   { bg: '#E5E7EB', fg: '#374151', key: 'rfiStatusClosed' },
}

export default function RfisScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const projectId = Number(id)
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Rfi[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [uid, setUid] = useState<string | null>(null)
  const [isManager, setIsManager] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [subject, setSubject] = useState('')
  const [question, setQuestion] = useState('')
  const [planRef, setPlanRef] = useState('')
  const [saving, setSaving] = useState(false)
  const [answerDraft, setAnswerDraft] = useState<Record<number, string>>({})
  const [newPhotoUrl, setNewPhotoUrl] = useState('')
  const [busyPhoto, setBusyPhoto] = useState(false)
  const [toast, setToast] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  // Only what the reader has toggled; everything else follows the status rule
  // in isExpanded, so an RFI arriving from realtime needs no state seeded.
  const [toggled, setToggled] = useState<Record<number, boolean>>({})

  // This job stands in for one another company shared with us. An RFI is a
  // question for THEM, so it is sent onto their jobsite — and once it is,
  // their number, status and answer show here against ours.
  const { target } = useForwardTarget(projectId)
  const [sendAlso, setSendAlso] = useState<boolean | null>(null)
  const willSend = !!target && (sendAlso ?? target.defaults.rfis)
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [copies, setCopies] = useState<Record<number, ForwardedRfi>>({})

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200) }

  async function sendAcross(rfiId: number, quiet: boolean) {
    setSendingId(rfiId)
    try {
      const res = await forwardToSharedJobsite('rfis', rfiId)
      if (!quiet) flash(res.warning ? `${t('sentTo', { org: res.ownerOrgName })}. ${res.warning}` : `${t('sentTo', { org: res.ownerOrgName })}${res.rfiNo ? ` · ${res.rfiNo}` : ''}`)
    } catch (e: any) {
      Alert.alert(t('sendFailedTitle'), t('sendFailed', { org: target?.ownerOrgName || '', reason: e?.message || 'Unknown error' }))
    } finally {
      setSendingId(null)
    }
  }

  // An open RFI is a question somebody is waiting on, so it reads expanded.
  // Answered and closed ones are history and fold away until asked for.
  function isExpanded(rfi: Rfi) {
    return toggled[rfi.id] ?? (rfi.status === 'open')
  }

  function canEdit(rfi: Rfi) {
    return isManager || (rfi.asked_by === uid && rfi.status === 'open')
  }

  function storagePath(url: string | null) {
    const marker = `/${PHOTO_BUCKET}/`
    const i = (url || '').indexOf(marker)
    return i === -1 ? null : (url as string).slice(i + marker.length)
  }
  async function deletePhotoObject(url: string | null) {
    const p = storagePath(url)
    if (p) await supabase.storage.from(PHOTO_BUCKET).remove([p]).catch(() => {})
  }
  // Pick from camera or library, then upload to the rfi-photos bucket → public URL.
  async function pickAndUpload(): Promise<string | null> {
    return new Promise((resolve) => {
      Alert.alert('Add photo', undefined, [
        { text: 'Take photo', onPress: async () => resolve(await runPicker('camera')) },
        { text: 'Choose from library', onPress: async () => resolve(await runPicker('library')) },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ])
    })
  }
  async function runPicker(source: 'camera' | 'library'): Promise<string | null> {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { flash('Permission denied'); return null }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images })
    if (result.canceled || !result.assets?.length) return null
    const asset = result.assets[0]
    setBusyPhoto(true)
    try {
      const resp = await fetch(asset.uri)
      const buf = await resp.arrayBuffer()
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase()
      const path = `${projectId}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, buf, { contentType: asset.mimeType || 'image/jpeg', upsert: false })
      if (error) throw error
      return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl
    } catch (e: any) {
      flash('Upload failed: ' + e.message); return null
    } finally { setBusyPhoto(false) }
  }

  async function addNewPhoto() {
    const url = await pickAndUpload()
    if (!url) return
    if (newPhotoUrl) await deletePhotoObject(newPhotoUrl)
    setNewPhotoUrl(url)
  }
  async function setRfiPhoto(rfi: Rfi) {
    const url = await pickAndUpload()
    if (!url) return
    const { error } = await supabase.from('rfis').update({ photo_url: url, updated_at: new Date().toISOString() }).eq('id', rfi.id)
    if (error) { flash(error.message); return }
    if (rfi.photo_url) await deletePhotoObject(rfi.photo_url)
    flash('Photo updated'); load()
  }
  async function removeRfiPhoto(rfi: Rfi) {
    const { error } = await supabase.from('rfis').update({ photo_url: null, updated_at: new Date().toISOString() }).eq('id', rfi.id)
    if (error) { flash(error.message); return }
    if (rfi.photo_url) await deletePhotoObject(rfi.photo_url)
    flash('Photo removed'); load()
  }

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const myId = session?.user?.id || null
    setUid(myId)
    if (myId) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', myId).single()
      const role = (prof as any)?.role
      setIsManager(role === 'manager' || role === 'owner')
    }
    const { data } = await supabase.from('rfis').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
    const list = (data as Rfi[]) || []
    setRows(list)
    setCopies(await loadForwardedRfis(list))
    const ids = [...new Set(list.flatMap(r => [r.asked_by, r.answered_by]).filter(Boolean) as string[])]
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      setNames(Object.fromEntries(((profs as any[]) || []).map(p => [p.id, p.full_name])))
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  // rfis only started publishing in 20260809000003 — before that this channel
  // opened and delivered nothing.
  useRealtimeRefetch(
    'rfis',
    load,
    Number.isFinite(projectId) ? `project_id=eq.${projectId}` : undefined,
    Number.isFinite(projectId),
  )

  function resetForm() { setSubject(''); setQuestion(''); setPlanRef(''); setNewPhotoUrl(''); setEditingId(null) }

  function startEdit(rfi: Rfi) {
    setSubject(rfi.subject || '')
    setQuestion(rfi.question || '')
    setPlanRef(rfi.plan_ref || '')
    setNewPhotoUrl(rfi.photo_url || '')
    setEditingId(rfi.id)
    setShowForm(true)
  }

  async function submit() {
    if (!subject.trim()) { flash(t('rfiSubjectRequired')); return }
    setSaving(true)
    const fields = {
      subject: subject.trim(),
      question: question.trim() || null, plan_ref: planRef.trim() || null,
      photo_url: newPhotoUrl || null,
    }
    let error: { message: string } | null = null
    let createdId: number | null = null
    if (editingId) {
      ;({ error } = await supabase.from('rfis').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', editingId))
    } else {
      const res = await supabase.from('rfis').insert({ project_id: projectId, asked_by: uid, ...fields }).select('id').single()
      error = res.error
      createdId = (res.data as any)?.id ?? null
    }
    setSaving(false)
    if (error) { flash(error.message); return }
    const wasForwarded = editingId ? !!rows.find(r => r.id === editingId)?.forwarded_to_id : false
    resetForm(); setShowForm(false)
    if (!editingId && target && willSend && createdId) {
      await sendAcross(createdId, false)
    } else {
      flash(editingId ? t('rfiUpdated') : t('rfiSubmitted'))
      // An edit to an RFI already over there follows it quietly.
      if (editingId && wasForwarded && target) await sendAcross(editingId, true)
    }
    load()
  }

  async function sendAnswer(rfi: Rfi) {
    const text = (answerDraft[rfi.id] || '').trim()
    if (!text) { flash(t('rfiAnswerRequired')); return }
    const { error } = await supabase.from('rfis').update({
      answer: text, status: 'answered', answered_by: uid,
      answered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', rfi.id)
    if (error) { flash(error.message); return }
    setAnswerDraft(d => ({ ...d, [rfi.id]: '' }))
    flash(t('rfiAnswerSent')); load()
  }

  async function setStatus(rfi: Rfi, status: 'open' | 'closed') {
    const { error } = await supabase.from('rfis').update({ status, updated_at: new Date().toISOString() }).eq('id', rfi.id)
    if (error) { flash(error.message); return }
    load()
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>{t('rfiLoading')}</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        <View style={{ backgroundColor: COLORS.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.navy }}>{t('rfisTitle')}</Text>
          <Text style={{ color: COLORS.subtext, marginTop: 2 }}>{t('rfisSubtitle')}</Text>
          <Pressable onPress={() => { if (showForm) { setShowForm(false); resetForm() } else { resetForm(); setShowForm(true) } }}
            style={{ marginTop: 14, backgroundColor: showForm ? COLORS.background : COLORS.navy, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: showForm ? COLORS.border : COLORS.navy }}>
            <Text style={{ color: showForm ? COLORS.navy : 'white', fontWeight: '800' }}>{showForm ? t('cancel') : (editingId ? t('rfiEdit') : t('rfiNew'))}</Text>
          </Pressable>
        </View>

        {showForm && (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 }}>
            <Field label={t('rfiSubject')}>
              <TextInput style={inputStyle} value={subject} onChangeText={setSubject} placeholder={t('rfiSubjectPlaceholder')} placeholderTextColor={COLORS.subtext} />
            </Field>
            <Field label={t('rfiQuestion')}>
              <TextInput style={[inputStyle, { minHeight: 90, textAlignVertical: 'top' }]} value={question} onChangeText={setQuestion} placeholder={t('rfiQuestionPlaceholder')} placeholderTextColor={COLORS.subtext} multiline />
            </Field>
            <Field label={t('rfiPlanRef')}>
              <TextInput style={inputStyle} value={planRef} onChangeText={setPlanRef} placeholder={t('rfiPlanRefPlaceholder')} placeholderTextColor={COLORS.subtext} />
            </Field>
            <View style={{ marginBottom: 12 }}>
              {newPhotoUrl ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {/* SignedImage, not a bare Image. pickAndUpload returns a
                      STORAGE PATH in a private bucket — the same value the
                      submitted RFI renders below through SignedImage. Handing
                      that path to <Image> fetches nothing, so the photo went up
                      fine and the preview stayed blank while Replace and Remove
                      appeared beside it: the state said a photo was attached and
                      the picture said it was not. */}
                  <SignedImage bucket={PHOTO_BUCKET} value={newPhotoUrl} style={{ width: 72, height: 72, borderRadius: 8 }} />
                  <SmallBtn label={busyPhoto ? '…' : 'Replace'} onPress={addNewPhoto} />
                  <SmallBtn label="Remove" onPress={async () => { await deletePhotoObject(newPhotoUrl); setNewPhotoUrl('') }} />
                </View>
              ) : (
                <Pressable onPress={addNewPhoto} disabled={busyPhoto} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignSelf: 'flex-start' }}>
                  <MaterialCommunityIcons name="camera-outline" size={18} color={COLORS.navy} />
                  <Text style={{ color: COLORS.navy, fontWeight: '700' }}>{busyPhoto ? '…' : 'Add photo'}</Text>
                </Pressable>
              )}
            </View>
            {target && !editingId && (
              <Pressable
                onPress={() => setSendAlso(!willSend)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F8F2FA', borderWidth: 1, borderColor: '#E1BEE7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#4A148C', fontWeight: '800', fontSize: 14 }}>{t('sendToJobsite', { org: target.ownerOrgName })}</Text>
                  <Text style={{ color: '#6A1B9A', fontSize: 12, marginTop: 2, lineHeight: 16 }}>{t('sendRfiHint')}</Text>
                </View>
                <Switch value={willSend} onValueChange={v => setSendAlso(v)} trackColor={{ true: '#7B1FA2', false: '#CBD5E1' }} thumbColor="white" />
              </Pressable>
            )}
            <Pressable onPress={submit} disabled={saving} style={{ backgroundColor: COLORS.teal, borderRadius: 12, paddingVertical: 13, alignItems: 'center', opacity: saving ? 0.6 : 1 }}>
              <Text style={{ color: 'white', fontWeight: '800' }}>{saving ? '…' : t('rfiSubmit')}</Text>
            </Pressable>
          </View>
        )}

        {rows.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 30 }}>
            <MaterialCommunityIcons name="comment-question-outline" size={48} color={COLORS.border} />
            <Text style={{ color: COLORS.subtext, marginTop: 10 }}>{t('rfiNone')}</Text>
          </View>
        ) : rows.map(rfi => {
          const s = STATUS[rfi.status] || STATUS.open
          return (
            <View key={rfi.id} style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 }}>
              <Pressable
                onPress={() => setToggled(x => ({ ...x, [rfi.id]: !isExpanded(rfi) }))}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
              >
                <Text style={{ color: COLORS.subtext, fontSize: 12, width: 14 }}>{isExpanded(rfi) ? '▼' : '▶'}</Text>
                <View style={{ backgroundColor: s.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color: s.fg, fontWeight: '800', fontSize: 11 }}>{t(s.key)}</Text>
                </View>
                {rfi.rfi_no ? (
                  <View style={{ backgroundColor: '#EEF2FF', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: COLORS.navy, fontWeight: '700', fontSize: 11 }}>{rfi.rfi_no}</Text>
                  </View>
                ) : null}
                <Text style={{ fontWeight: '800', color: COLORS.navy, fontSize: 16, flexShrink: 1 }}>{rfi.subject}</Text>
                {/* Collapsed, these say what is inside without opening it. */}
                {!isExpanded(rfi) && rfi.photo_url ? <Text style={{ fontSize: 13 }}>📎</Text> : null}
                {!isExpanded(rfi) && rfi.answer ? <Text style={{ color: '#166534', fontSize: 11, fontWeight: '700' }}>{t('rfiAnswerLabel')}</Text> : null}
              </Pressable>
              {isExpanded(rfi) && rfi.plan_ref ? <Text style={{ color: COLORS.teal, fontWeight: '700', fontSize: 12, marginTop: 6 }}>📐 {rfi.plan_ref}</Text> : null}
              {isExpanded(rfi) && rfi.question ? <Text style={{ color: COLORS.text, marginTop: 6, lineHeight: 20 }}>{rfi.question}</Text> : null}
              {isExpanded(rfi) && rfi.photo_url ? <SignedImage bucket={PHOTO_BUCKET} value={rfi.photo_url} style={{ width: '100%', height: 180, borderRadius: 10, marginTop: 8 }} resizeMode="cover" /> : null}
              {isExpanded(rfi) && canEdit(rfi) && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <SmallBtn label={t('rfiEdit')} onPress={() => startEdit(rfi)} />
                  <SmallBtn label={busyPhoto ? '…' : (rfi.photo_url ? 'Replace photo' : '📷 Add photo')} onPress={() => setRfiPhoto(rfi)} />
                  {rfi.photo_url ? <SmallBtn label="Remove photo" onPress={() => removeRfiPhoto(rfi)} /> : null}
                </View>
              )}
              <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 6 }}>
                {t('rfiAskedBy')} {names[rfi.asked_by || ''] || rfi.author_name || '—'}{rfi.author_org && !names[rfi.asked_by || ''] ? ` (${rfi.author_org})` : ''} · {new Date(rfi.created_at).toLocaleDateString()}
              </Text>

              {target && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {rfi.forwarded_to_id ? (
                    <View style={{ backgroundColor: '#F3E5F5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: '#4A148C', fontWeight: '800', fontSize: 11 }}>
                        ✓ {t('sentTo', { org: target.ownerOrgName })}
                        {copies[rfi.id]?.rfi_no ? ` · ${copies[rfi.id].rfi_no}` : ''}
                        {copies[rfi.id] ? ` · ${t((STATUS[copies[rfi.id].status] || STATUS.open).key)}` : ''}
                      </Text>
                    </View>
                  ) : (canEdit(rfi) ? (
                    <Pressable onPress={() => sendAcross(rfi.id, false).then(load)} disabled={sendingId === rfi.id}
                      style={{ backgroundColor: '#7B1FA2', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, opacity: sendingId === rfi.id ? 0.6 : 1 }}>
                      <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>
                        {sendingId === rfi.id ? t('sending') : t('sendNowTo', { org: target.ownerOrgName })}
                      </Text>
                    </Pressable>
                  ) : null)}
                </View>
              )}

              {/* Their answer to the copy we sent — the question went to them,
                  and this is what came back. */}
              {isExpanded(rfi) && copies[rfi.id]?.answer ? (
                <View style={{ marginTop: 10, backgroundColor: '#F8F2FA', borderLeftWidth: 3, borderLeftColor: '#7B1FA2', borderRadius: 8, padding: 12 }}>
                  <Text style={{ fontWeight: '800', color: '#4A148C', fontSize: 12, marginBottom: 3 }}>{t('answerFrom', { org: target?.ownerOrgName || '' })}</Text>
                  <Text style={{ color: '#3B0A5C', lineHeight: 20 }}>{copies[rfi.id].answer}</Text>
                  <Text style={{ color: '#8E6BA8', fontSize: 11, marginTop: 5 }}>
                    {copies[rfi.id].answered_at ? new Date(copies[rfi.id].answered_at as string).toLocaleDateString() : ''}
                  </Text>
                </View>
              ) : null}

              {isExpanded(rfi) && rfi.answer ? (
                <View style={{ marginTop: 10, backgroundColor: '#F0FDF4', borderLeftWidth: 3, borderLeftColor: '#22C55E', borderRadius: 8, padding: 12 }}>
                  <Text style={{ fontWeight: '800', color: '#166534', fontSize: 12, marginBottom: 3 }}>{t('rfiAnswerLabel')}</Text>
                  <Text style={{ color: '#14532D', lineHeight: 20 }}>{rfi.answer}</Text>
                  <Text style={{ color: '#6B9080', fontSize: 11, marginTop: 5 }}>
                    {names[rfi.answered_by || ''] || '—'} · {rfi.answered_at ? new Date(rfi.answered_at).toLocaleDateString() : ''}
                  </Text>
                </View>
              ) : null}

              {isExpanded(rfi) && isManager && (
                <View style={{ marginTop: 10 }}>
                  {rfi.status !== 'closed' && (
                    <>
                      <TextInput style={[inputStyle, { minHeight: 60, textAlignVertical: 'top' }]} value={answerDraft[rfi.id] || ''}
                        onChangeText={txt => setAnswerDraft(d => ({ ...d, [rfi.id]: txt }))} placeholder={t('rfiAnswerPlaceholder')} placeholderTextColor={COLORS.subtext} multiline />
                      <Pressable onPress={() => sendAnswer(rfi)} style={{ backgroundColor: COLORS.navy, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 8 }}>
                        <Text style={{ color: 'white', fontWeight: '800' }}>{t('rfiSendAnswer')}</Text>
                      </Pressable>
                    </>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    {rfi.status === 'closed'
                      ? <SmallBtn label={t('rfiReopen')} onPress={() => setStatus(rfi, 'open')} />
                      : <SmallBtn label={t('rfiCloseRfi')} onPress={() => setStatus(rfi, 'closed')} />}
                  </View>
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

function SmallBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 }}>
      <Text style={{ color: COLORS.navy, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}
