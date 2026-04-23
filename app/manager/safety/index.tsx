import * as DocumentPicker from 'expo-document-picker'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { supabase } from '../../../lib/supabase'

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg:         '#D6E8FF',
  card:       '#FFFFFF',
  navy:       '#16356B',
  navySoft:   '#EAF0F8',
  teal:       '#19B6D2',
  tealSoft:   '#E7F9FC',
  green:      '#22C55E',
  greenSoft:  '#ECFDF5',
  red:        '#EF4444',
  redSoft:    '#FEF2F2',
  yellow:     '#F9A825',
  yellowSoft: '#FFF8E1',
  text:       '#0F172A',
  sub:        '#64748B',
  border:     '#E2E8F0',
  white:      '#FFFFFF',
}

// ─── Types ────────────────────────────────────────────────────────────────────
type ManualDoc = {
  id: number
  title: string | null
  pdf_url: string | null
}

type ManualAck = {
  id: number
  signed_name: string | null
  signed_at: string | null
  pdf_url: string | null
  signature_text: string | null
  week_start: string | null
}

type SafetyDoc = {
  id: number
  title: string | null
  category: string | null
  pdf_url: string | null
}

type WeeklyTopic = {
  id: number
  week_start: string
  topic: string | null
  pdf_url: string | null
  video_url: string | null
}

type MeetingAck = {
  id: number
  signed_name: string | null
  signed_at: string | null
  pdf_url: string | null
  signature_text: string | null
  week_start: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getWeekStart(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function initial(name: string | null): string {
  return (name || '?').charAt(0).toUpperCase()
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: C.navy, fontSize: 20, fontWeight: '900' }}>{title}</Text>
      {subtitle ? <Text style={{ color: C.sub, fontSize: 13, marginTop: 2 }}>{subtitle}</Text> : null}
    </View>
  )
}

function AckCard({
  name, signedAt, pdfUrl, onView, onDelete,
}: { name: string | null; signedAt: string | null; pdfUrl: string | null; onView: () => void; onDelete: () => void }) {
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.navy, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: C.white, fontWeight: '900', fontSize: 17 }}>{initial(name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>{name || 'Unknown Worker'}</Text>
          <Text style={{ color: C.sub, fontSize: 12 }}>Signed {fmtDate(signedAt)}</Text>
        </View>
        <View style={{ backgroundColor: C.greenSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ color: C.green, fontWeight: '800', fontSize: 12 }}>✓ Signed</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {pdfUrl ? (
          <Pressable onPress={onView} style={{ flex: 1, backgroundColor: C.navy, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: C.white, fontWeight: '800', fontSize: 13 }}>📄  View Signed PDF</Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.sub, fontSize: 12 }}>PDF not available</Text>
          </View>
        )}
        <Pressable
          onPress={onDelete}
          style={{ backgroundColor: C.redSoft, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: C.red, fontWeight: '800', fontSize: 13 }}>🗑</Text>
        </Pressable>
      </View>
    </View>
  )
}

function CountBadge({ count, total }: { count: number; total: number }) {
  return (
    <View style={{ backgroundColor: count > 0 ? C.greenSoft : '#F1F5F9', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
      <Text style={{ fontWeight: '900', fontSize: 14, color: count > 0 ? C.green : C.sub }}>{count} / {total}</Text>
    </View>
  )
}

function DocChip({
  doc, selected, onPress,
}: { doc: SafetyDoc; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: selected ? C.navy : C.card,
        borderRadius: 14, borderWidth: 1,
        borderColor: selected ? C.navy : C.border,
        padding: 12, marginRight: 10, width: 160,
      }}
    >
      <Text style={{ color: selected ? C.white : C.navy, fontWeight: '800', fontSize: 13, marginBottom: 4 }} numberOfLines={2}>
        {doc.title || 'Untitled'}
      </Text>
      <Text style={{ color: selected ? '#A8C8E8' : C.sub, fontSize: 11 }} numberOfLines={1}>
        {doc.category || 'Document'}
      </Text>
    </Pressable>
  )
}

// ─── Open PDF in browser ──────────────────────────────────────────────────────
async function openPdf(url: string) {
  try {
    await Linking.openURL(url)
  } catch {
    Alert.alert('Error', 'Could not open PDF.')
  }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ManagerSafetyScreen() {
  const weekStart = getWeekStart()

  // Loading
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // PDF viewer
  // ── Safety Manual ──
  const [manual, setManual]         = useState<ManualDoc | null>(null)
  const [uploading, setUploading]   = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [manualAcks, setManualAcks] = useState<ManualAck[]>([])
  const [workerCount, setWorkerCount] = useState(0)

  // ── Weekly Meeting ──
  const [topic, setTopic]         = useState<WeeklyTopic | null>(null)
  const [meetingAcks, setMeetingAcks] = useState<MeetingAck[]>([])

  // Signature viewer
  const [viewingAck, setViewingAck]         = useState<ManualAck | MeetingAck | null>(null)
  const [viewingAckType, setViewingAckType] = useState<'manual' | 'meeting'>('manual')

  // Topic editor
  const [editing, setEditing]             = useState(false)
  const [topicText, setTopicText]         = useState('')
  const [savingTopic, setSavingTopic]     = useState(false)
  const [selectedDoc, setSelectedDoc]     = useState<SafetyDoc | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<SafetyDoc | null>(null)
  const [safetyDocs, setSafetyDocs]       = useState<SafetyDoc[]>([])
  const [safetyVideos, setSafetyVideos]   = useState<SafetyDoc[]>([])

  useEffect(() => { loadAll() }, [])

  async function onRefresh() {
    setRefreshing(true)
    await loadAll()
    setRefreshing(false)
  }

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadManual(), loadManualAcks(), loadTopic(), loadMeetingAcks(), loadWorkerCount(), loadSafetyResources()])
    setLoading(false)
  }

  async function loadWorkerCount() {
    const { count } = await supabase
      .from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'worker')
    setWorkerCount(count || 0)
  }

  async function loadManual() {
    const { data } = await supabase
      .from('safety_documents')
      .select('id, title, pdf_url')
      .eq('document_type', 'company_safety_manual')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setManual(data || null)
  }

  async function loadManualAcks() {
    const { data } = await supabase
      .from('safety_manual_acknowledgements')
      .select('id, signed_name, signed_at, pdf_url, signature_text, week_start')
      .eq('week_start', weekStart)
      .order('signed_at', { ascending: false })
    setManualAcks((data as ManualAck[]) || [])
  }

  async function loadTopic() {
    const { data } = await supabase
      .from('weekly_safety_topics')
      .select('id, week_start, topic, pdf_url, video_url')
      .eq('week_start', weekStart)
      .maybeSingle()
    setTopic(data || null)
  }

  async function loadMeetingAcks() {
    const { data } = await supabase
      .from('weekly_meeting_acknowledgements')
      .select('id, signed_name, signed_at, pdf_url, signature_text, week_start')
      .eq('week_start', weekStart)
      .order('signed_at', { ascending: false })
    setMeetingAcks((data as MeetingAck[]) || [])
  }

  async function loadSafetyResources() {
    const { data } = await supabase
      .from('safety_documents')
      .select('id, title, category, pdf_url')
      .eq('is_active', true)
      .neq('document_type', 'company_safety_manual')
      .not('pdf_url', 'is', null)
      .order('sort_order', { ascending: true })

    const all = (data as SafetyDoc[]) || []
    const catLower = (d: SafetyDoc) => (d.category || '').toLowerCase()
    setSafetyVideos(all.filter(d => catLower(d).includes('video') || catLower(d).includes('osha video')))
    setSafetyDocs(all.filter(d => !catLower(d).includes('video')))
  }

  // ── Upload manual ──
  async function pickAndUploadManual() {
    try {
      setUploading(true)
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true })
      if (result.canceled) return
      const file = result.assets?.[0]
      if (!file?.uri) throw new Error('No file selected.')

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const safeName = (file.name || 'safety-manual.pdf').replace(/\s+/g, '-')
      const filePath = `manuals/${Date.now()}-${safeName}`
      const ab = await (await fetch(file.uri)).arrayBuffer()

      const { error: upErr } = await supabase.storage.from('safety-pdfs').upload(filePath, ab, { contentType: 'application/pdf' })
      if (upErr) throw upErr

      // Signed URL — works regardless of bucket visibility (10-year expiry)
      const { data: signedData, error: signedErr } = await supabase.storage
        .from('safety-pdfs')
        .createSignedUrl(filePath, 315360000)
      if (signedErr) throw signedErr

      await supabase.from('safety_documents').update({ is_active: false }).eq('document_type', 'company_safety_manual').eq('is_active', true)
      const { error: insErr } = await supabase.from('safety_documents').insert({
        document_type: 'company_safety_manual', title: file.name || 'Safety Manual',
        description: 'Current active company safety manual', category: 'Manual',
        source_type: 'external_pdf', pdf_url: signedData.signedUrl, is_active: true,
      })
      if (insErr) throw insErr

      Alert.alert('Uploaded', 'Safety manual uploaded.')
      await loadManual()
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not upload.')
    } finally {
      setUploading(false)
    }
  }

  async function deleteManual() {
    if (!manual) return
    Alert.alert('Delete Manual', 'Are you sure you want to delete the current safety manual?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            setDeleting(true)
            if (manual.pdf_url?.includes('/safety-pdfs/')) {
              const path = manual.pdf_url.split('/safety-pdfs/')[1]
              if (path) await supabase.storage.from('safety-pdfs').remove([path])
            }
            await supabase.from('safety_documents').delete().eq('id', manual.id)
            setManual(null)
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Could not delete.')
          } finally {
            setDeleting(false)
          }
        },
      },
    ])
  }

  // ── Save weekly topic ──
  function openEditor() {
    setTopicText(topic?.topic || '')
    // Pre-select existing attached doc/video so manager sees what's currently attached
    setSelectedDoc(topic?.pdf_url ? (safetyDocs.find(d => d.pdf_url === topic.pdf_url) || null) : null)
    setSelectedVideo(topic?.video_url ? (safetyVideos.find(d => d.pdf_url === topic.video_url) || null) : null)
    setEditing(true)
  }

  async function saveTopic() {
    if (!topicText.trim()) { Alert.alert('Required', 'Enter a topic description.'); return }
    try {
      setSavingTopic(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const payload: any = {
        week_start: weekStart,
        topic: topicText.trim(),
        created_by: user.id,
        pdf_url: selectedDoc?.pdf_url ?? topic?.pdf_url ?? null,
        video_url: selectedVideo?.pdf_url ?? topic?.video_url ?? null,
      }

      if (topic?.id) {
        await supabase.from('weekly_safety_topics').update(payload).eq('id', topic.id)
      } else {
        await supabase.from('weekly_safety_topics').insert(payload)
      }

      await loadTopic()
      setEditing(false)
      Alert.alert('Saved', 'Weekly topic saved.')
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not save topic.')
    } finally {
      setSavingTopic(false)
    }
  }

  function viewPdf(url: string, _title: string) {
    openPdf(url)
  }

  async function deleteManualAck(ack: ManualAck) {
    Alert.alert(
      'Delete Acknowledgement',
      `Remove ${ack.signed_name || 'this worker'}'s safety manual signature? They will need to re-sign this week.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('safety_manual_acknowledgements').delete().eq('id', ack.id)
            if (error) { Alert.alert('Error', error.message); return }
            setManualAcks(prev => prev.filter(a => a.id !== ack.id))
          },
        },
      ]
    )
  }

  async function deleteMeetingAck(ack: MeetingAck) {
    Alert.alert(
      'Delete Sign-In',
      `Remove ${ack.signed_name || 'this worker'}'s meeting sign-in? They will need to re-sign this week.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('weekly_meeting_acknowledgements').delete().eq('id', ack.id)
            if (error) { Alert.alert('Error', error.message); return }
            setMeetingAcks(prev => prev.filter(a => a.id !== ack.id))
          },
        },
      ]
    )
  }

  // --- Render ---
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={C.navy} />
        <Text style={{ marginTop: 12, color: C.sub, fontSize: 14 }}>Loading safety data</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.navy} />}
      >
        <Text style={{ color: C.navy, fontSize: 26, fontWeight: '900', marginBottom: 4 }}>Safety Compliance</Text>
        <Text style={{ color: C.sub, fontSize: 13, marginBottom: 24 }}>
          Week of {weekStart} - {workerCount} active worker{workerCount !== 1 ? 's' : ''}
        </Text>

        {/* SECTION 1 - SAFETY MANUAL */}
        <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 18, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <SectionHeader title="Safety Manual" subtitle="Current company safety manual" />
            <CountBadge count={manualAcks.length} total={workerCount} />
          </View>

          {manual ? (
            <View style={{ backgroundColor: C.greenSoft, borderRadius: 14, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.green, fontWeight: '800', fontSize: 14 }}>Manual Active</Text>
                <Text style={{ color: C.text, fontSize: 13, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>{manual.title || 'Safety Manual'}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {manual.pdf_url ? (
                  <Pressable onPress={() => viewPdf(manual.pdf_url!, manual.title || 'Manual')}
                    style={{ backgroundColor: C.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ color: C.white, fontWeight: '800', fontSize: 12 }}>View</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={deleteManual} disabled={deleting}
                  style={{ backgroundColor: C.redSoft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ color: C.red, fontWeight: '800', fontSize: 12 }}>{deleting ? '...' : 'Delete'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ backgroundColor: C.yellowSoft, borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <Text style={{ color: C.yellow, fontWeight: '800', fontSize: 14 }}>No Manual Uploaded</Text>
              <Text style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>Upload a PDF so workers can read and sign it.</Text>
            </View>
          )}

          <Pressable onPress={pickAndUploadManual} disabled={uploading}
            style={{ backgroundColor: C.navy, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginBottom: 18 }}>
            <Text style={{ color: C.white, fontWeight: '900', fontSize: 15 }}>
              {uploading ? 'Uploading...' : manual ? 'Replace Manual' : 'Upload Manual'}
            </Text>
          </Pressable>

          {manualAcks.length > 0 ? (
            <>
              <Text style={{ color: C.navy, fontWeight: '800', fontSize: 15, marginBottom: 10 }}>
                Signed This Week ({manualAcks.length})
              </Text>
              {manualAcks.map(ack => (
                <AckCard
                  key={ack.id}
                  name={ack.signed_name}
                  signedAt={ack.signed_at}
                  pdfUrl="yes"
                  onView={() => { setViewingAck(ack); setViewingAckType('manual') }}
                  onDelete={() => deleteManualAck(ack)}
                />
              ))}
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Text style={{ color: C.sub, fontSize: 14 }}>No signatures yet this week</Text>
            </View>
          )}
        </View>

        {/* SECTION 2 - WEEKLY MEETING */}
        <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 18, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <SectionHeader title="Weekly Meeting" subtitle={`Safety topic - ${weekStart}`} />
            <CountBadge count={meetingAcks.length} total={workerCount} />
          </View>

          {topic ? (
            <View style={{ backgroundColor: C.tealSoft, borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <Text style={{ color: C.teal, fontWeight: '800', fontSize: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>This Week Topic</Text>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 8 }}>{topic.topic}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {topic.pdf_url ? (
                  <Pressable onPress={() => viewPdf(topic.pdf_url!, 'Safety Topic')}
                    style={{ flex: 1, backgroundColor: C.teal, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                    <Text style={{ color: C.white, fontWeight: '800', fontSize: 13 }}>📄 Reference PDF</Text>
                  </Pressable>
                ) : null}
                {topic.video_url ? (
                  <Pressable onPress={() => viewPdf(topic.video_url!, 'Training Video')}
                    style={{ flex: 1, backgroundColor: C.navy, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                    <Text style={{ color: C.white, fontWeight: '800', fontSize: 13 }}>▶ Training Video</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={{ backgroundColor: C.yellowSoft, borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <Text style={{ color: C.yellow, fontWeight: '800', fontSize: 14 }}>No Topic Set</Text>
              <Text style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>Set a topic so workers can read and sign in.</Text>
            </View>
          )}

          <Pressable onPress={openEditor}
            style={{ backgroundColor: C.teal, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginBottom: 18 }}>
            <Text style={{ color: C.white, fontWeight: '900', fontSize: 15 }}>
              {topic ? 'Edit Topic' : "Set This Week's Topic"}
            </Text>
          </Pressable>

          {meetingAcks.length > 0 ? (
            <>
              <Text style={{ color: C.navy, fontWeight: '800', fontSize: 15, marginBottom: 10 }}>
                Signed In This Week ({meetingAcks.length})
              </Text>
              {meetingAcks.map(ack => (
                <AckCard
                  key={ack.id}
                  name={ack.signed_name}
                  signedAt={ack.signed_at}
                  pdfUrl="yes"
                  onView={() => { setViewingAck(ack); setViewingAckType('meeting') }}
                  onDelete={() => deleteMeetingAck(ack)}
                />
              ))}
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Text style={{ color: C.sub, fontSize: 14 }}>No sign-ins yet this week</Text>
            </View>
          )}
        </View>

        {/* SECTION 3 - SAFETY RESOURCES */}
        {(safetyDocs.length > 0 || safetyVideos.length > 0) && (
          <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 18, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
            <SectionHeader title="Safety Resources" subtitle="Documents and training videos" />
            {safetyDocs.length > 0 && (
              <>
                <Text style={{ color: C.navy, fontWeight: '800', fontSize: 14, marginBottom: 10 }}>Documents</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {safetyDocs.map(doc => (
                    <DocChip key={doc.id} doc={doc} selected={selectedDoc?.id === doc.id}
                      onPress={() => { if (doc.pdf_url) viewPdf(doc.pdf_url, doc.title || 'Document') }} />
                  ))}
                </ScrollView>
              </>
            )}
            {safetyVideos.length > 0 && (
              <>
                <Text style={{ color: C.navy, fontWeight: '800', fontSize: 14, marginBottom: 10 }}>Training Videos</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {safetyVideos.map(doc => (
                    <DocChip key={doc.id} doc={doc} selected={selectedDoc?.id === doc.id}
                      onPress={() => { if (doc.pdf_url) viewPdf(doc.pdf_url, doc.title || 'Video') }} />
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        )}

      </ScrollView>

      {/* MODAL - View Signature */}
      <Modal
        visible={!!viewingAck}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setViewingAck(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderColor: C.border }}>
            <Pressable onPress={() => setViewingAck(null)}>
              <Text style={{ color: C.red, fontWeight: '700', fontSize: 16 }}>Close</Text>
            </Pressable>
            <Text style={{ color: C.navy, fontWeight: '900', fontSize: 17 }}>
              {viewingAckType === 'meeting' ? 'Meeting Sign-In' : 'Manual Acknowledgement'}
            </Text>
            <Pressable onPress={() => {
              if (!viewingAck) return
              const url = `https://nguyenmep.com/portal/view-ack?id=${viewingAck.id}&type=${viewingAckType}`
              Linking.openURL(url)
            }}>
              <Text style={{ color: C.teal, fontWeight: '700', fontSize: 16 }}>🖨 Print</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            {viewingAck && (
              <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 22, borderWidth: 1, borderColor: C.border }}>
                <Text style={{ color: C.navy, fontSize: 20, fontWeight: '900', marginBottom: 2 }}>Nguyen MEP, LLC</Text>
                <Text style={{ color: C.teal, fontSize: 13, fontWeight: '700', marginBottom: 20 }}>
                  {viewingAckType === 'meeting' ? 'Weekly Safety Meeting Sign-In' : 'Safety Manual Acknowledgement'}
                </Text>

                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: C.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Worker Name</Text>
                  <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', borderBottomWidth: 1, borderColor: C.border, paddingBottom: 6 }}>{viewingAck.signed_name || '—'}</Text>
                </View>
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: C.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Date & Time Signed</Text>
                  <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', borderBottomWidth: 1, borderColor: C.border, paddingBottom: 6 }}>{fmtDate(viewingAck.signed_at)}</Text>
                </View>
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ color: C.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Week Of</Text>
                  <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', borderBottomWidth: 1, borderColor: C.border, paddingBottom: 6 }}>{viewingAck.week_start || '—'}</Text>
                </View>

                <Text style={{ color: C.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Signature</Text>
                {viewingAck.signature_text ? (
                  <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden', backgroundColor: '#FAFAFA', padding: 8 }}>
                    <Image
                      source={{ uri: viewingAck.signature_text }}
                      style={{ width: '100%', height: 120 }}
                      resizeMode="contain"
                    />
                  </View>
                ) : (
                  <Text style={{ color: C.sub, fontStyle: 'italic', fontSize: 14 }}>No signature image on file</Text>
                )}

                <Text style={{ color: C.sub, fontSize: 12, textAlign: 'center', marginTop: 24 }}>
                  Nguyen MEP Safety Compliance · nguyenmep.com
                </Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* MODAL - Edit Weekly Topic */}
      <Modal visible={editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderColor: C.border }}>
            <Pressable onPress={() => setEditing(false)}>
              <Text style={{ color: C.red, fontWeight: '700', fontSize: 16 }}>Cancel</Text>
            </Pressable>
            <Text style={{ color: C.navy, fontWeight: '900', fontSize: 18 }}>Weekly Topic</Text>
            <Pressable onPress={saveTopic} disabled={savingTopic}>
              <Text style={{ color: savingTopic ? C.sub : C.teal, fontWeight: '900', fontSize: 16 }}>
                {savingTopic ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 18 }}>
            <Text style={{ color: C.navy, fontWeight: '800', fontSize: 15, marginBottom: 8 }}>Topic Description</Text>
            <TextInput
              value={topicText}
              onChangeText={setTopicText}
              multiline
              numberOfLines={4}
              placeholder="e.g. Fall protection and harness inspection"
              placeholderTextColor={C.sub}
              style={{
                backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border,
                padding: 14, color: C.text, fontSize: 15, minHeight: 100,
                textAlignVertical: 'top', marginBottom: 20,
              }}
            />
            {safetyDocs.length > 0 && (
              <>
                <Text style={{ color: C.navy, fontWeight: '800', fontSize: 15, marginBottom: 4 }}>📄 Attach Reference Document (optional)</Text>
                <Text style={{ color: C.sub, fontSize: 12, marginBottom: 12 }}>Workers will see a link to this PDF when they sign in.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {safetyDocs.map(doc => (
                    <DocChip key={doc.id} doc={doc} selected={selectedDoc?.id === doc.id}
                      onPress={() => setSelectedDoc(prev => prev?.id === doc.id ? null : doc)} />
                  ))}
                </ScrollView>
                {selectedDoc && (
                  <View style={{ backgroundColor: C.tealSoft, borderRadius: 14, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ flex: 1, color: C.teal, fontWeight: '700', fontSize: 14 }}>📄 {selectedDoc.title}</Text>
                    <Pressable onPress={() => setSelectedDoc(null)}>
                      <Text style={{ color: C.red, fontWeight: '800' }}>Remove</Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}
            {safetyVideos.length > 0 && (
              <>
                <Text style={{ color: C.navy, fontWeight: '800', fontSize: 15, marginBottom: 4, marginTop: 4 }}>▶ Attach Training Video (optional)</Text>
                <Text style={{ color: C.sub, fontSize: 12, marginBottom: 12 }}>Workers will see a link to this video when they sign in.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {safetyVideos.map(doc => (
                    <DocChip key={doc.id} doc={doc} selected={selectedVideo?.id === doc.id}
                      onPress={() => setSelectedVideo(prev => prev?.id === doc.id ? null : doc)} />
                  ))}
                </ScrollView>
                {selectedVideo && (
                  <View style={{ backgroundColor: C.navySoft, borderRadius: 14, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ flex: 1, color: C.navy, fontWeight: '700', fontSize: 14 }}>▶ {selectedVideo.title}</Text>
                    <Pressable onPress={() => setSelectedVideo(null)}>
                      <Text style={{ color: C.red, fontWeight: '800' }}>Remove</Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}
