import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { useRealtimeRefetch } from '../../../hooks/useRealtimeRefetch'
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'
import ImageView from 'react-native-image-viewing'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { COLORS } from '../../../lib/theme'
import { objectPath, signedUrl } from '../../../lib/storageUrl'
import { SignedImage } from '../../../components/SignedImage'
import { forwardToSharedJobsite, loadForwardedRfis, loadForwardedRfiPhotos, useForwardTarget, type ForwardedRfi, type ForwardedRfiPhoto } from '../../../lib/sharedJobsite'
import { isManagerRole } from '../../../lib/roles'

// RFI (Request For Information): a field question the office/manager must answer.
// Any worker assigned to the project can raise one; managers answer. Tracked
// open → answered → closed. Separate from daily Reports (a log, not a Q&A thread).
//
// Photos: an RFI carries as many as it needs, on both sides of the exchange.
// They are rows in project_photos (source_table = 'rfis'), the way report
// photos are — source 'rfi' for the question, 'rfi_answer' for the answer. The
// legacy rfis.photo_url column is kept in step by triggers and never written
// here.
type Rfi = {
  id: number; subject: string; question: string | null; plan_ref: string | null
  status: 'open' | 'answered' | 'closed'; answer: string | null
  rfi_no: string | null; photo_url: string | null
  asked_by: string | null; answered_by: string | null; answered_at: string | null; created_at: string
  forwarded_to_id: number | null; author_name: string | null; author_org: string | null
}

type RfiPhoto = {
  id: number; source_id: number; source: string | null
  file_path: string | null; file_url: string | null; caption: string | null
  uploaded_by: string | null; created_at: string
}

type Side = 'question' | 'answer'

const PHOTO_BUCKET = 'rfi-photos'
const THUMB = 104

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
  const [photos, setPhotos] = useState<Record<number, RfiPhoto[]>>({})
  const [names, setNames] = useState<Record<string, string>>({})
  const [uid, setUid] = useState<string | null>(null)
  const [isManager, setIsManager] = useState(false)
  // The project OWNER's org: files about a project live under its prefix, so
  // a company the job was shared with can read them. See web
  // lib/projectStoragePath.js for the reasoning.
  const [ownerOrg, setOwnerOrg] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [subject, setSubject] = useState('')
  const [question, setQuestion] = useState('')
  const [planRef, setPlanRef] = useState('')
  const [saving, setSaving] = useState(false)
  const [answerDraft, setAnswerDraft] = useState<Record<number, string>>({})
  // Chosen but not yet uploaded: the form's photos go up once the RFI has an
  // id; an answer's go up with the answer.
  const [staged, setStaged] = useState<ImagePicker.ImagePickerAsset[]>([])
  const [answerStaged, setAnswerStaged] = useState<Record<number, ImagePicker.ImagePickerAsset[]>>({})
  const [busyPhotoId, setBusyPhotoId] = useState<number | null>(null)
  // Full-size viewer: the same pinch-zoom lightbox the gallery and job kit use.
  // It takes plain uris, so the tapped set is signed on open, and it opens on
  // the photo that was tapped with the rest of that set a swipe away.
  const [viewer, setViewer] = useState<{ images: { uri: string }[]; index: number } | null>(null)
  async function openPhotos(photos: { file_path: string | null; file_url: string | null }[], index: number, ownerOrg: string | null = null) {
    const urls = await Promise.all(
      photos.map(ph => signedUrl(PHOTO_BUCKET, ph.file_path || ph.file_url, ownerOrg ? { ownerOrg } : undefined)),
    )
    const images = urls.filter(Boolean).map(uri => ({ uri: uri as string }))
    if (!images.length) return
    // A photo that would not sign drops out, so the tapped one is found again
    // by counting what survived ahead of it.
    const before = urls.slice(0, index).filter(Boolean).length
    setViewer({ images, index: Math.min(before, images.length - 1) })
  }
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
  const [copyPhotos, setCopyPhotos] = useState<Record<number, ForwardedRfiPhoto[]>>({})

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

  const questionPhotos = (rfi: Rfi) => (photos[rfi.id] || []).filter(p => p.source !== 'rfi_answer')
  const answerPhotos   = (rfi: Rfi) => (photos[rfi.id] || []).filter(p => p.source === 'rfi_answer')

  // ── Photos ────────────────────────────────────────────────────────────────
  // Camera takes one; the library lets the crew pick several at once.
  function pickAssets(): Promise<ImagePicker.ImagePickerAsset[]> {
    return new Promise((resolve) => {
      Alert.alert(t('rfiAddPhotos'), undefined, [
        { text: t('takePhoto'), onPress: async () => resolve(await runPicker('camera')) },
        { text: t('chooseFromLibrary'), onPress: async () => resolve(await runPicker('library')) },
        { text: t('cancel'), style: 'cancel', onPress: () => resolve([]) },
      ])
    })
  }
  async function runPicker(source: 'camera' | 'library'): Promise<ImagePicker.ImagePickerAsset[]> {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { flash(t('rfiPermissionDenied')); return [] }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsMultipleSelection: true })
    if (result.canceled || !result.assets?.length) return []
    return result.assets
  }

  /**
   * Upload assets against an RFI and write a pot row for each. Returns how
   * many failed; the caller decides how loud to be about it.
   */
  async function uploadRfiPhotos(rfiId: number, assets: ImagePicker.ImagePickerAsset[], side: Side): Promise<number> {
    let failed = 0
    let i = 0
    for (const asset of assets) {
      try {
        const ext = (asset.fileName?.split('.').pop() || asset.uri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
        const name = `rfi-${rfiId}-${Date.now()}-${i++}.${ext}`
        // Under the owner's prefix when known; otherwise the storage wrapper
        // prefixes our own org, exactly as every other upload here does.
        const path = ownerOrg ? `${ownerOrg}/${projectId}/${name}` : `${projectId}/${name}`
        const resp = await fetch(asset.uri)
        if (!resp.ok) throw new Error('Could not read the photo file.')
        const buf = await resp.arrayBuffer()
        const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, buf, { contentType: asset.mimeType || 'image/jpeg', upsert: false })
        if (upErr) throw new Error(upErr.message)
        // Both: the path is what we sign; the url is what the gallery and the
        // phones still on the old build read.
        const fileUrl = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl
        const { error: rowErr } = await supabase.from('project_photos').insert({
          project_id: projectId,
          source_table: 'rfis',
          source_id: rfiId,
          source: side === 'answer' ? 'rfi_answer' : 'rfi',
          file_path: path,
          file_url: fileUrl,
          uploaded_by: uid,
        })
        if (rowErr) {
          await supabase.storage.from(PHOTO_BUCKET).remove([path]).catch(() => {})
          throw new Error(rowErr.message)
        }
      } catch (e: any) {
        console.warn('RFI photo upload failed:', e?.message || e)
        failed++
      }
    }
    return failed
  }

  // Photos added straight onto an existing RFI's card.
  async function addPhotosTo(rfi: Rfi, side: Side) {
    const assets = await pickAssets()
    if (!assets.length) return
    setBusyPhotoId(rfi.id)
    const failed = await uploadRfiPhotos(rfi.id, assets, side)
    setBusyPhotoId(null)
    flash(failed ? t('rfiPhotosFailed', { n: failed }) : t('rfiPhotosAdded', { n: assets.length }))
    // A copy already on their jobsite gets the new question photos too.
    if (side === 'question' && rfi.forwarded_to_id && target) sendAcross(rfi.id, true)
    load()
  }

  function removePhoto(ph: RfiPhoto) {
    Alert.alert(t('rfiRemovePhotoTitle'), undefined, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('remove'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('project_photos').delete().eq('id', ph.id)
        if (error) { flash(error.message); return }
        const p = objectPath(ph.file_path || ph.file_url)
        if (p) await supabase.storage.from(PHOTO_BUCKET).remove([p]).catch(() => {})
        flash(t('rfiPhotoRemoved')); load()
      } },
    ])
  }

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const myId = session?.user?.id || null
    setUid(myId)
    if (myId) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', myId).single()
      const role = (prof as any)?.role
      setIsManager(isManagerRole(role))
    }
    const [{ data }, { data: phRows }, { data: proj }] = await Promise.all([
      supabase.from('rfis').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('project_photos')
        .select('id, source_id, source, file_path, file_url, caption, uploaded_by, created_at')
        .eq('project_id', projectId).eq('source_table', 'rfis')
        .order('created_at', { ascending: true }),
      supabase.from('projects').select('org_id').eq('id', projectId).maybeSingle(),
    ])
    const list = (data as Rfi[]) || []
    setRows(list)
    const byRfi: Record<number, RfiPhoto[]> = {}
    for (const ph of ((phRows as RfiPhoto[]) || [])) (byRfi[ph.source_id] ||= []).push(ph)
    setPhotos(byRfi)
    setOwnerOrg((proj as any)?.org_id ?? null)
    const theirs = await loadForwardedRfis(list)
    setCopies(theirs)
    setCopyPhotos(await loadForwardedRfiPhotos(theirs))
    const ids = [...new Set(list.flatMap(r => [r.asked_by, r.answered_by]).filter(Boolean) as string[])]
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      setNames(Object.fromEntries(((profs as any[]) || []).map(p => [p.id, p.full_name])))
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  // rfis only started publishing in 20260809000003 — before that this channel
  // opened and delivered nothing. Photos arrive on their own table.
  const rtFilter = Number.isFinite(projectId) ? `project_id=eq.${projectId}` : undefined
  useRealtimeRefetch('rfis', load, rtFilter, Number.isFinite(projectId))
  useRealtimeRefetch('project_photos', load, rtFilter, Number.isFinite(projectId))

  function resetForm() { setSubject(''); setQuestion(''); setPlanRef(''); setStaged([]); setEditingId(null) }

  function startEdit(rfi: Rfi) {
    setSubject(rfi.subject || '')
    setQuestion(rfi.question || '')
    setPlanRef(rfi.plan_ref || '')
    setStaged([])
    setEditingId(rfi.id)
    setShowForm(true)
  }

  async function submit() {
    if (!subject.trim()) { flash(t('rfiSubjectRequired')); return }
    setSaving(true)
    const fields = {
      subject: subject.trim(),
      question: question.trim() || null, plan_ref: planRef.trim() || null,
    }
    let error: { message: string } | null = null
    let savedId: number | null = editingId
    if (editingId) {
      ;({ error } = await supabase.from('rfis').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', editingId))
    } else {
      const res = await supabase.from('rfis').insert({ project_id: projectId, asked_by: uid, ...fields }).select('id').single()
      error = res.error
      savedId = (res.data as any)?.id ?? null
    }
    if (error) { setSaving(false); flash(error.message); return }

    // Photos go up once the row exists to hang them on.
    let failed = 0
    if (staged.length && savedId) failed = await uploadRfiPhotos(savedId, staged, 'question')
    setSaving(false)

    const wasForwarded = editingId ? !!rows.find(r => r.id === editingId)?.forwarded_to_id : false
    const wasEditing = !!editingId
    resetForm(); setShowForm(false)
    if (!wasEditing && target && willSend && savedId) {
      await sendAcross(savedId, false)
    } else {
      flash(wasEditing ? t('rfiUpdated') : t('rfiSubmitted'))
      // An edit to an RFI already over there follows it quietly.
      if (wasEditing && wasForwarded && target && savedId) await sendAcross(savedId, true)
    }
    if (failed) Alert.alert(t('rfiPhotosFailed', { n: failed }))
    load()
  }

  async function sendAnswer(rfi: Rfi) {
    const text = (answerDraft[rfi.id] || '').trim()
    const assets = answerStaged[rfi.id] || []
    if (!text && !assets.length) { flash(t('rfiAnswerRequired')); return }
    const { error } = await supabase.from('rfis').update({
      answer: text || null, status: 'answered', answered_by: uid,
      answered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', rfi.id)
    if (error) { flash(error.message); return }
    let failed = 0
    if (assets.length) {
      setBusyPhotoId(rfi.id)
      failed = await uploadRfiPhotos(rfi.id, assets, 'answer')
      setBusyPhotoId(null)
    }
    setAnswerDraft(d => ({ ...d, [rfi.id]: '' }))
    setAnswerStaged(d => ({ ...d, [rfi.id]: [] }))
    flash(failed ? `${t('rfiAnswerSent')} · ${t('rfiPhotosFailed', { n: failed })}` : t('rfiAnswerSent'))
    load()
  }

  async function stageForAnswer(rfi: Rfi) {
    const assets = await pickAssets()
    if (!assets.length) return
    setAnswerStaged(d => ({ ...d, [rfi.id]: [...(d[rfi.id] || []), ...assets] }))
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

  const editingRfi = editingId ? rows.find(r => r.id === editingId) : undefined

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
            <Field label={t('rfiPhotos')}>
              {/* Already on the RFI being edited: removed straight away, since they are saved. */}
              {editingRfi ? <PhotoRow photos={questionPhotos(editingRfi)} onRemove={removePhoto} onOpen={i => openPhotos(questionPhotos(editingRfi), i)} /> : null}
              {/* Chosen now: previewed from the device, uploaded when the RFI is saved. */}
              <StagedRow assets={staged} onRemove={i => setStaged(s => s.filter((_, j) => j !== i))} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                <AddPhotosBtn label={t('rfiAddPhotos')} onPress={async () => { const a = await pickAssets(); if (a.length) setStaged(s => [...s, ...a]) }} />
                {staged.length > 0 ? <Text style={{ color: COLORS.subtext, fontSize: 12 }}>{t('rfiPhotosOnSave', { n: staged.length })}</Text> : null}
              </View>
            </Field>
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
          const qPhotos = questionPhotos(rfi)
          const aPhotos = answerPhotos(rfi)
          const photoCount = qPhotos.length + aPhotos.length
          const busy = busyPhotoId === rfi.id
          const theirPhotos = copyPhotos[rfi.id] || []
          const pendingAnswer = answerStaged[rfi.id] || []
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
                {!isExpanded(rfi) && photoCount > 0 ? <Text style={{ fontSize: 13, color: COLORS.subtext }}>📎{photoCount > 1 ? ` ${photoCount}` : ''}</Text> : null}
                {!isExpanded(rfi) && rfi.answer ? <Text style={{ color: '#166534', fontSize: 11, fontWeight: '700' }}>{t('rfiAnswerLabel')}</Text> : null}
              </Pressable>
              {isExpanded(rfi) && rfi.plan_ref ? <Text style={{ color: COLORS.teal, fontWeight: '700', fontSize: 12, marginTop: 6 }}>📐 {rfi.plan_ref}</Text> : null}
              {isExpanded(rfi) && rfi.question ? <Text style={{ color: COLORS.text, marginTop: 6, lineHeight: 20 }}>{rfi.question}</Text> : null}
              {isExpanded(rfi) ? <PhotoRow photos={qPhotos} onRemove={canEdit(rfi) ? removePhoto : undefined} onOpen={i => openPhotos(qPhotos, i)} /> : null}
              {isExpanded(rfi) && canEdit(rfi) && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <SmallBtn label={t('rfiEdit')} onPress={() => startEdit(rfi)} />
                  <AddPhotosBtn label={busy ? '…' : t('rfiAddPhotos')} onPress={() => addPhotosTo(rfi, 'question')} disabled={busy} />
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
              {isExpanded(rfi) && (copies[rfi.id]?.answer || theirPhotos.length > 0) ? (
                <View style={{ marginTop: 10, backgroundColor: '#F8F2FA', borderLeftWidth: 3, borderLeftColor: '#7B1FA2', borderRadius: 8, padding: 12 }}>
                  <Text style={{ fontWeight: '800', color: '#4A148C', fontSize: 12, marginBottom: 3 }}>{t('answerFrom', { org: target?.ownerOrgName || '' })}</Text>
                  {copies[rfi.id]?.answer ? <Text style={{ color: '#3B0A5C', lineHeight: 20 }}>{copies[rfi.id].answer}</Text> : null}
                  <PhotoRow photos={theirPhotos} ownerOrg={target?.ownerOrg || null} onOpen={i => openPhotos(theirPhotos, i, target?.ownerOrg || null)} />
                  <Text style={{ color: '#8E6BA8', fontSize: 11, marginTop: 5 }}>
                    {copies[rfi.id]?.answered_at ? new Date(copies[rfi.id].answered_at as string).toLocaleDateString() : ''}
                  </Text>
                </View>
              ) : null}

              {isExpanded(rfi) && (rfi.answer || aPhotos.length > 0) ? (
                <View style={{ marginTop: 10, backgroundColor: '#F0FDF4', borderLeftWidth: 3, borderLeftColor: '#22C55E', borderRadius: 8, padding: 12 }}>
                  <Text style={{ fontWeight: '800', color: '#166534', fontSize: 12, marginBottom: 3 }}>{t('rfiAnswerLabel')}</Text>
                  {rfi.answer ? <Text style={{ color: '#14532D', lineHeight: 20 }}>{rfi.answer}</Text> : null}
                  <PhotoRow photos={aPhotos} onRemove={isManager ? removePhoto : undefined} onOpen={i => openPhotos(aPhotos, i)} />
                  <Text style={{ color: '#6B9080', fontSize: 11, marginTop: 5 }}>
                    {names[rfi.answered_by || ''] || '—'} · {rfi.answered_at ? new Date(rfi.answered_at).toLocaleDateString() : ''}
                  </Text>
                  {isManager && rfi.status !== 'closed' ? (
                    <View style={{ marginTop: 8 }}>
                      <AddPhotosBtn label={busy ? '…' : t('rfiAddToAnswer')} onPress={() => addPhotosTo(rfi, 'answer')} disabled={busy} />
                    </View>
                  ) : null}
                </View>
              ) : null}

              {isExpanded(rfi) && isManager && (
                <View style={{ marginTop: 10 }}>
                  {rfi.status !== 'closed' && (
                    <>
                      <TextInput style={[inputStyle, { minHeight: 60, textAlignVertical: 'top' }]} value={answerDraft[rfi.id] || ''}
                        onChangeText={txt => setAnswerDraft(d => ({ ...d, [rfi.id]: txt }))} placeholder={t('rfiAnswerPlaceholder')} placeholderTextColor={COLORS.subtext} multiline />
                      {/* Photos for the answer — a marked-up sheet, a detail — go up with it. */}
                      <StagedRow assets={pendingAnswer} size={80} onRemove={i => setAnswerStaged(d => ({ ...d, [rfi.id]: (d[rfi.id] || []).filter((_, j) => j !== i) }))} />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                        <AddPhotosBtn label={t('rfiAttachToAnswer')} onPress={() => stageForAnswer(rfi)} />
                        {pendingAnswer.length > 0 ? <Text style={{ color: COLORS.subtext, fontSize: 12 }}>{t('rfiPhotosWithAnswer', { n: pendingAnswer.length })}</Text> : null}
                      </View>
                      <Pressable onPress={() => sendAnswer(rfi)} disabled={busy} style={{ backgroundColor: COLORS.navy, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 8, opacity: busy ? 0.6 : 1 }}>
                        <Text style={{ color: 'white', fontWeight: '800' }}>{busy ? t('sending') : t('rfiSendAnswer')}</Text>
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

      {/* Full-size view: pinch to zoom, double-tap to zoom, swipe between the
          set's photos, swipe down to close. */}
      <ImageView
        images={viewer?.images || []}
        imageIndex={viewer?.index || 0}
        visible={!!viewer}
        onRequestClose={() => setViewer(null)}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
      />

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

function AddPhotosBtn({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'flex-start', opacity: disabled ? 0.6 : 1 }}>
      <MaterialCommunityIcons name="camera-outline" size={18} color={COLORS.navy} />
      <Text style={{ color: COLORS.navy, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}

/** Stored photos as thumbnails; tap to open, ✕ to remove when allowed. */
function PhotoRow({ photos, onRemove, onOpen, ownerOrg = null, size = THUMB }: {
  photos: { id: number; file_path: string | null; file_url: string | null }[]
  onRemove?: (ph: any) => void
  onOpen: (index: number) => void
  ownerOrg?: string | null
  size?: number
}) {
  if (!photos.length) return null
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {photos.map((ph, i) => {
        const value = (ph.file_path || ph.file_url) as string
        return (
          <View key={ph.id} style={{ width: size, height: size, position: 'relative' }}>
            <Pressable onPress={() => onOpen(i)}>
              <SignedImage bucket={PHOTO_BUCKET} value={value} ownerOrg={ownerOrg} style={{ width: size, height: size, borderRadius: 8, backgroundColor: COLORS.background }} resizeMode="cover" />
            </Pressable>
            {onRemove ? (
              <Pressable onPress={() => onRemove(ph)} hitSlop={6} style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(183,28,28,0.9)', borderRadius: 999, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: 'white', fontWeight: '800', fontSize: 12, lineHeight: 14 }}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

/** Photos picked on the device and not yet uploaded. */
function StagedRow({ assets, onRemove, size = THUMB }: { assets: ImagePicker.ImagePickerAsset[]; onRemove: (i: number) => void; size?: number }) {
  if (!assets.length) return null
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {assets.map((a, i) => (
        <View key={`${a.uri}-${i}`} style={{ width: size, height: size, position: 'relative' }}>
          <Image source={{ uri: a.uri }} style={{ width: size, height: size, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border }} resizeMode="cover" />
          <Pressable onPress={() => onRemove(i)} hitSlop={6} style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(13,27,62,0.85)', borderRadius: 999, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: 'white', fontWeight: '800', fontSize: 12, lineHeight: 14 }}>✕</Text>
          </Pressable>
        </View>
      ))}
    </View>
  )
}
