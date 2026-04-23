// expo-file-system removed — using fetch + arrayBuffer for reliable binary upload
// expo-print removed — view rendered server-side
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '../lib/supabase';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Signature pad HTML ───────────────────────────────────────────────────────
const SIGNATURE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; -webkit-user-select:none; user-select:none; }
    html, body { width:100%; height:100%; background:#F8FAFC; overflow:hidden; }
    #wrap { display:flex; flex-direction:column; width:100%; height:100%; }
    canvas {
      flex:1; width:100%; background:white;
      border-bottom:1px solid #E2E8F0;
      display:block; cursor:crosshair;
    }
    .bar {
      display:flex; align-items:center; gap:8px;
      padding:10px 12px; background:#F1F5F9;
    }
    .hint { flex:1; font-size:13px; color:#64748B; font-family:Arial,sans-serif; }
    button {
      padding:9px 18px; border:none; border-radius:8px;
      font-size:13px; font-weight:700; cursor:pointer; font-family:Arial,sans-serif;
    }
    .clear { background:#EF4444; color:#fff; }
    .save  { background:#16356B; color:#fff; }
  </style>
</head>
<body>
<div id="wrap">
  <canvas id="sig"></canvas>
  <div class="bar">
    <span class="hint">Sign with your finger</span>
    <button class="clear" ontouchend="clearSig(event)">Clear</button>
    <button class="save"  ontouchend="saveSig(event)">Done</button>
  </div>
</div>
<script>
  var canvas = document.getElementById('sig');
  var ctx    = canvas.getContext('2d');
  var drawing = false;
  var hasDrawn = false;
  var lastX = 0, lastY = 0;
  var ratio  = window.devicePixelRatio || 1;

  function resize() {
    var rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }

  window.addEventListener('resize', resize);
  resize();

  function pos(e) {
    var rect  = canvas.getBoundingClientRect();
    var touch = e.changedTouches ? e.changedTouches[0] : e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    drawing = true;
    var p = pos(e);
    lastX = p.x; lastY = p.y;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }, { passive: false });

  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (!drawing) return;
    hasDrawn = true;
    var p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }, { passive: false });

  canvas.addEventListener('touchend', function(e) {
    e.preventDefault();
    drawing = false;
  }, { passive: false });

  function clearSig(e) {
    if (e) e.preventDefault();
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    hasDrawn = false;
  }

  function saveSig(e) {
    if (e) e.preventDefault();
    if (!hasDrawn) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'empty' }));
      return;
    }
    var data = canvas.toDataURL('image/png');
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'signature', data: data }));
  }
</script>
</body>
</html>
`;

// ─── PDF template ─────────────────────────────────────────────────────────────
function buildPdfHtml(
  workerName: string,
  topic: string,
  weekStart: string,
  signedAt: string,
  sigDataUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; margin: 48px 52px; font-size: 13px; line-height: 1.65; color: #000; }
  h1 { font-size: 26px; font-weight: 900; margin-bottom: 6px; }
  .subtitle { font-size: 15px; color: #444; margin-bottom: 22px; }
  h2 { font-size: 13px; font-weight: 900; margin-top: 28px; margin-bottom: 10px; text-transform: uppercase; }
  p { margin-bottom: 13px; }
  ul { margin-left: 28px; margin-bottom: 13px; }
  li { margin-bottom: 6px; }
  hr { border: none; border-top: 1px solid #000; margin: 28px 0; }
  .topic-box { background: #f5f5f5; border-left: 4px solid #16356B; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px; }
  .topic-label { font-size: 11px; font-weight: 900; text-transform: uppercase; color: #555; margin-bottom: 4px; }
  .topic-text { font-size: 16px; font-weight: 700; color: #111; }
  .sig-block { margin-top: 32px; }
  .sig-row { display: flex; align-items: flex-end; margin-bottom: 14px; gap: 12px; }
  .sig-label { font-weight: 700; white-space: nowrap; }
  .sig-val { border-bottom: 1px solid #555; flex: 1; padding-bottom: 2px; min-width: 200px; }
  .sig-img { margin-top: 8px; border: 1px solid #ccc; max-width: 320px; max-height: 100px; display:block; }
</style>
</head>
<body>

<h1>NGUYEN MEP, LLC</h1>
<div class="subtitle">Weekly Safety Meeting Acknowledgement</div>

<div class="topic-box">
  <div class="topic-label">This Week's Safety Topic</div>
  <div class="topic-text">${topic}</div>
</div>

<p>I acknowledge that I attended and participated in the weekly safety meeting for the week of <strong>${weekStart}</strong>. I have reviewed and understood the safety topic presented, and I agree to apply this knowledge in my day-to-day work activities.</p>

<p>I understand that:</p>
<ul>
  <li>Regular safety meetings are required as part of my employment</li>
  <li>I am responsible for understanding and applying the safety information provided</li>
  <li>I must ask questions if any safety information is unclear to me</li>
  <li>Failure to attend or acknowledge weekly safety meetings may affect my ability to clock in</li>
</ul>

<p>By signing below, I confirm that I have attended this week's safety meeting and understood the topic discussed.</p>

<hr />

<h2>Reconocimiento de Reunión Semanal de Seguridad</h2>

<p>Reconozco que asistí y participé en la reunión semanal de seguridad de la semana del <strong>${weekStart}</strong>. He revisado y comprendido el tema de seguridad presentado, y acepto aplicar este conocimiento en mis actividades laborales diarias.</p>

<p>Entiendo que:</p>
<ul>
  <li>Las reuniones de seguridad regulares son un requisito de mi empleo</li>
  <li>Soy responsable de comprender y aplicar la información de seguridad proporcionada</li>
  <li>Debo hacer preguntas si alguna información de seguridad no me queda clara</li>
  <li>No asistir o no reconocer las reuniones de seguridad semanales puede afectar mi capacidad de registrar mi entrada</li>
</ul>

<div class="sig-block">
  <div class="sig-row">
    <span class="sig-label">Name / Nombre:</span>
    <span class="sig-val">${workerName}</span>
  </div>
  <div class="sig-row">
    <span class="sig-label">Week of / Semana de:</span>
    <span class="sig-val">${weekStart}</span>
  </div>
  <div class="sig-row">
    <span class="sig-label">Date Signed / Fecha:</span>
    <span class="sig-val">${signedAt}</span>
  </div>
  <div>
    <span class="sig-label">Signature / Firma:</span>
    <img src="${sigDataUrl}" class="sig-img" />
  </div>
</div>

</body>
</html>
`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type WeeklyTopic = {
  id: number;
  week_start: string;
  topic: string | null;
  pdf_url: string | null;
  video_url: string | null;
};

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function WeeklySafetyMeetingScreen() {
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [topicRow, setTopicRow]             = useState<WeeklyTopic | null>(null);
  const [alreadySigned, setAlreadySigned]   = useState(false);
  const [companyEmail, setCompanyEmail]     = useState<string | null>(null);

  // Signature flow
  const [showSignModal, setShowSignModal]   = useState(false);
  const [sigStep, setSigStep]               = useState<'pad' | 'confirm'>('pad');
  const [workerName, setWorkerName]         = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  const webviewRef = useRef<WebView>(null);

  useEffect(() => { loadMeeting(); }, []);

  function getStartOfWeek(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + diff);
    return d;
  }

  function formatDateOnly(date: Date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  async function loadMeeting() {
    try {
      setLoading(true);

      // Use getSession() — reads local storage, won't fail with AuthSessionMissingError
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Session expired. Please log in again.');

      // Pre-fill worker name from profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, first_name, last_name')
        .eq('id', user.id)
        .maybeSingle();

      const name =
        profileData?.full_name ||
        [profileData?.first_name, profileData?.last_name].filter(Boolean).join(' ') ||
        '';
      if (name) setWorkerName(name);

      // Load company email for auto-send
      const { data: settingsData } = await supabase
        .from('company_settings')
        .select('company_email')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();
      setCompanyEmail(settingsData?.company_email || null);

      const weekStart = formatDateOnly(getStartOfWeek());

      const { data: topicData, error: topicError } = await supabase
        .from('weekly_safety_topics')
        .select('id, week_start, topic, pdf_url, video_url')
        .eq('week_start', weekStart)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (topicError && topicError.code !== 'PGRST116') throw topicError;
      setTopicRow((topicData as WeeklyTopic) || null);

      if (topicData?.id) {
        const { data: ackData, error: ackError } = await supabase
          .from('weekly_meeting_acknowledgements')
          .select('id, signed_name')
          .eq('worker_id', user.id)
          .eq('topic_id', topicData.id)
          .eq('week_start', weekStart)
          .limit(1)
          .maybeSingle();

        if (ackError && ackError.code !== 'PGRST116') throw ackError;
        setAlreadySigned(!!ackData);
        if (ackData?.signed_name) setWorkerName(ackData.signed_name);
      } else {
        setAlreadySigned(false);
      }
    } catch (error) {
      console.error('Error loading weekly meeting:', error);
      Alert.alert('Error', 'Could not load weekly safety meeting.');
    } finally {
      setLoading(false);
    }
  }

  // WebView signature message handler
  function handleWebViewMessage(event: any) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'empty') {
        Alert.alert('No Signature', 'Please draw your signature before tapping Done.');
        return;
      }
      if (msg.type === 'signature') {
        setSignatureDataUrl(msg.data);
        setSigStep('confirm');
      }
    } catch (e) {
      console.error('WebView message parse error', e);
    }
  }

  function openSignModal() {
    setSigStep('pad');
    setSignatureDataUrl(null);
    setShowSignModal(true);
  }

  function closeSignModal() {
    setShowSignModal(false);
    setSigStep('pad');
    setSignatureDataUrl(null);
  }

  async function handleConfirm() {
    if (!signatureDataUrl) {
      Alert.alert('Missing Signature', 'Please draw your signature.');
      return;
    }
    if (!topicRow?.id) {
      Alert.alert('Error', 'No weekly safety topic found.');
      return;
    }

    try {
      setSaving(true);

      const { data: { session: sess } } = await supabase.auth.getSession();
      const user = sess?.user;
      if (!user) throw new Error('Session expired. Please log in again.');

      const weekStart = topicRow.week_start;
      const topic = topicRow.topic || 'Weekly Safety Meeting';
      const now = new Date();
      const signedAt = now.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      // Save the acknowledgement and get the row ID to build the view URL
      const { data: ackData, error: upsertError } = await supabase
        .from('weekly_meeting_acknowledgements')
        .upsert(
          {
            worker_id:      user.id,
            topic_id:       topicRow.id,
            week_start:     weekStart,
            signed_name:    workerName.trim(),
            signature_text: signatureDataUrl,
            signed_at:      now.toISOString(),
          },
          { onConflict: 'worker_id,topic_id,week_start' }
        )
        .select('id')
        .single();
      if (upsertError) throw upsertError;

      // Build the server-side view URL (renders HTML page from stored signature)
      const pdfUrl = `https://nguyenmep.com/api/portal/view-ack?id=${ackData.id}&type=meeting`;
      await supabase
        .from('weekly_meeting_acknowledgements')
        .update({ pdf_url: pdfUrl })
        .eq('id', ackData.id);

      setAlreadySigned(true);
      closeSignModal();

      // Fire-and-forget background email — no user interaction required
      if (companyEmail) {
        fetch('https://nguyenmep.com/api/portal/notify-safety', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workerName: workerName.trim(),
            signedAt,
            pdfUrl,
            type: 'meeting',
            companyEmail,
            topic,
            weekStart,
          }),
        }).catch(() => { /* silent — email failure never blocks the worker */ });
      }

      Alert.alert('Signed', 'Weekly Safety Meeting acknowledgement complete.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      console.error('Sign error:', err);
      Alert.alert('Error', err?.message || 'Could not save signature.');
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" />
        <Text style={s.loadingText}>Loading weekly safety meeting...</Text>
      </View>
    );
  }

  if (!topicRow) {
    return (
      <View style={s.centered}>
        <Text style={s.errorTitle}>No Weekly Topic Posted</Text>
        <Text style={s.errorText}>
          A manager has not posted this week's safety topic yet. Check back later.
        </Text>
        <TouchableOpacity style={s.closeButton} onPress={() => router.back()}>
          <Text style={s.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Topic card */}
        <View style={s.topicCard}>
          <Text style={s.topicLabel}>This Week's Topic</Text>
          <Text style={s.topicText}>{topicRow.topic || 'Weekly Safety Topic'}</Text>
        </View>

        {/* Status badge */}
        <View style={[s.badge, alreadySigned ? s.badgeGreen : s.badgeRed]}>
          <Text style={s.badgeText}>
            {alreadySigned ? '✓ Acknowledged This Week' : '⚠ Signature Required'}
          </Text>
        </View>

        {/* Reference document / video links */}
        {topicRow.pdf_url ? (
          <TouchableOpacity
            style={s.openPdfButton}
            onPress={() => Linking.openURL(topicRow.pdf_url!)}
          >
            <Text style={s.openPdfIcon}>📄</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.openPdfText}>Open Reference Document</Text>
              <Text style={s.openPdfSub}>Opens in your browser</Text>
            </View>
            <Text style={s.openPdfArrow}>›</Text>
          </TouchableOpacity>
        ) : null}

        {topicRow.video_url ? (
          <TouchableOpacity
            style={[s.openPdfButton, { borderColor: '#19B6D2' }]}
            onPress={() => Linking.openURL(topicRow.video_url!)}
          >
            <Text style={s.openPdfIcon}>▶️</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.openPdfText, { color: '#19B6D2' }]}>Watch Training Video</Text>
              <Text style={s.openPdfSub}>Opens in your browser</Text>
            </View>
            <Text style={s.openPdfArrow}>›</Text>
          </TouchableOpacity>
        ) : null}

        {!topicRow.pdf_url && !topicRow.video_url && (
          <View style={s.noPdfBox}>
            <Text style={s.noPdfText}>No reference document or video attached for this topic.</Text>
          </View>
        )}

        {!alreadySigned && (
          <View style={s.instructionBox}>
            <Text style={s.instructionText}>
              Review the topic above, then tap "Sign Weekly Meeting" below to acknowledge attendance.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={s.bottomBar}>
        {!alreadySigned && (
          <TouchableOpacity style={s.signButton} onPress={openSignModal}>
            <Text style={s.signButtonText}>Sign Weekly Meeting</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.closeButton} onPress={() => router.back()}>
          <Text style={s.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>

      {/* ── Signature Modal ── */}
      <Modal
        visible={showSignModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeSignModal}
      >
        <View style={s.modalWrap}>

          {/* Header */}
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Sign Weekly Safety Meeting</Text>
            <TouchableOpacity
              onPress={closeSignModal}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Worker name — read-only from profile */}
          <View style={s.nameSection}>
            <Text style={s.fieldLabel}>Signing As</Text>
            <View style={s.nameDisplay}>
              <Text style={s.nameDisplayText}>{workerName || 'Unknown Worker'}</Text>
            </View>
            <Text style={s.nameSub}>
              Name is pulled from your profile. Contact your manager to update it.
            </Text>
          </View>

          {sigStep === 'pad' ? (
            <>
              <View style={s.padLabelRow}>
                <Text style={s.fieldLabel}>Signature</Text>
                <Text style={s.padHint}>Draw your signature in the box below</Text>
              </View>

              <View style={s.canvasWrap}>
                <WebView
                  ref={webviewRef}
                  source={{ html: SIGNATURE_HTML }}
                  style={[s.canvas, { opacity: 0.99 }]}
                  scrollEnabled={false}
                  bounces={false}
                  onMessage={handleWebViewMessage}
                  javaScriptEnabled
                  originWhitelist={['*']}
                  androidHardwareAccelerationDisabled
                />
              </View>
            </>
          ) : (
            <>
              <View style={s.previewSection}>
                <Text style={s.fieldLabel}>Signature Preview</Text>
                <View style={s.previewBox}>
                  {signatureDataUrl ? (
                    <Image
                      source={{ uri: signatureDataUrl }}
                      style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                    />
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => { setSigStep('pad'); setSignatureDataUrl(null); }}
                  style={s.redrawButton}
                >
                  <Text style={s.redrawText}>Redraw Signature</Text>
                </TouchableOpacity>
              </View>

              <View style={s.confirmSection}>
                <TouchableOpacity
                  style={[s.confirmButton, saving && s.disabledButton]}
                  onPress={handleConfirm}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.confirmButtonText}>Submit & Generate PDF</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#D6E8FF' },
  scroll:      { padding: 16, gap: 12 },
  centered:    { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#555' },
  errorTitle:  { fontSize: 20, fontWeight: '800', marginBottom: 8, color: '#111' },
  errorText:   { color: '#555', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  topicCard:   { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  topicLabel:  { fontSize: 11, fontWeight: '800', color: '#64748B', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  topicText:   { color: '#0F172A', lineHeight: 24, fontWeight: '700', fontSize: 17 },
  badge:       { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  badgeGreen:  { backgroundColor: '#dff6e6' },
  badgeRed:    { backgroundColor: '#fde7e7' },
  badgeText:   { fontSize: 13, fontWeight: '800', color: '#222' },

  // Open PDF row
  openPdfButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 },
  openPdfIcon:   { fontSize: 28 },
  openPdfText:   { fontSize: 15, fontWeight: '800', color: '#16356B' },
  openPdfSub:    { fontSize: 12, color: '#64748B', marginTop: 2 },
  openPdfArrow:  { fontSize: 22, color: '#94A3B8', fontWeight: '700' },

  noPdfBox:    { borderRadius: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', padding: 16 },
  noPdfText:   { color: '#555', textAlign: 'center' },

  // Instruction
  instructionBox:  { backgroundColor: '#FFF8E1', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#FFE082' },
  instructionText: { color: '#7B5800', fontSize: 13, lineHeight: 20, fontWeight: '600', textAlign: 'center' },

  bottomBar:   { padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: '#e6e8ec', backgroundColor: '#fff', gap: 10 },
  signButton:  { backgroundColor: '#dc2626', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  signButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  closeButton: { backgroundColor: '#1f2937', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  closeButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // Modal
  modalWrap:   { flex: 1, backgroundColor: '#D6E8FF' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#16356B', paddingHorizontal: 20, paddingVertical: 16 },
  modalTitle:  { color: '#fff', fontSize: 18, fontWeight: '800' },
  modalClose:  { color: '#fff', fontSize: 20, fontWeight: '700' },

  // Name
  nameSection:     { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  fieldLabel:      { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  nameDisplay:     { backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 6 },
  nameDisplayText: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  nameSub:         { fontSize: 11, color: '#94A3B8' },

  // Pad
  padLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  padHint:     { fontSize: 12, color: '#94A3B8' },
  canvasWrap:  { flex: 1, marginHorizontal: 16, marginBottom: 16, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0' },
  canvas:      { flex: 1, backgroundColor: '#fff' },

  // Preview
  previewSection: { padding: 16, flex: 1 },
  previewBox:     { height: 160, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', marginBottom: 12 },
  redrawButton:   { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  redrawText:     { color: '#64748B', fontWeight: '700', fontSize: 13 },

  // Confirm
  confirmSection:    { padding: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#fff' },
  confirmButton:     { backgroundColor: '#16356B', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  confirmButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  disabledButton:    { opacity: 0.65 },
});
