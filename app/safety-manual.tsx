// expo-file-system removed — using fetch + arrayBuffer for reliable binary upload
// expo-print removed — PDF generated server-side
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useLanguage } from '../lib/i18n';
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

// ─── Embedded document HTML (shown in-app so loading never fails) ─────────────
const DOCUMENT_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<style>
  body { font-family: Arial, sans-serif; font-size: 15px; line-height: 1.7; padding: 20px 18px; color: #111; }
  h1  { font-size: 22px; font-weight: 900; margin-bottom: 16px; }
  h2  { font-size: 13px; font-weight: 900; margin-top: 24px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  p   { margin-bottom: 12px; }
  ul  { margin-left: 22px; margin-bottom: 12px; }
  li  { margin-bottom: 5px; }
  hr  { border: none; border-top: 1px solid #999; margin: 24px 0; }
</style>
</head>
<body>
<h1>NGUYEN MEP, LLC</h1>
<h2>Safety Manual Acknowledgment</h2>
<p>I acknowledge that I have received, read, and understand the Company Safety Manual, including all safety policies, procedures, and OSHA-related requirements applicable to my work.</p>
<p>I understand that construction work involves inherent hazards, including but not limited to falls, electrical hazards, heavy equipment operation, trenching, and exposure to potentially dangerous materials. I agree to follow all safety rules, use required personal protective equipment (PPE), and comply with all safety instructions, training, and jobsite requirements at all times.</p>
<p>I agree to:</p>
<ul>
  <li>Follow all Company safety policies and OSHA regulations</li>
  <li>Properly use and maintain all required PPE</li>
  <li>Report unsafe conditions, incidents, or injuries immediately</li>
  <li>Stop work when conditions are unsafe and notify a supervisor</li>
</ul>
<p>I understand that failure to follow safety rules and procedures may result in disciplinary action, up to and including termination.</p>
<p>I further acknowledge that the Company provides safety guidelines, training, and supervision to promote a safe work environment. However, I understand that my safety depends on my own actions and compliance. I agree that the Company shall not be held liable for any injuries, damages, or losses resulting from my failure to follow the Safety Manual, training, or safety instructions.</p>
<p>By signing below, I confirm that I have had the opportunity to ask questions and that I fully understand and agree to comply with the contents of the Safety Manual.</p>
<hr />
<h2>Acuse de Recibo del Manual de Seguridad (Construcción)</h2>
<p>Yo reconozco que he recibido, leído y entendido el Manual de Seguridad de la Empresa, incluyendo todas las políticas, procedimientos y requisitos de OSHA aplicables a mi trabajo.</p>
<p>Entiendo que el trabajo de construcción implica riesgos inherentes, incluyendo, entre otros, caídas, riesgos eléctricos, operación de maquinaria pesada, excavaciones y exposición a materiales peligrosos. Acepto cumplir con todas las reglas de seguridad, usar el equipo de protección personal (EPP) requerido y seguir todas las instrucciones y requisitos de seguridad en todo momento.</p>
<p>Acepto:</p>
<ul>
  <li>Cumplir con todas las políticas de seguridad de la empresa y regulaciones de OSHA</li>
  <li>Usar y mantener adecuadamente todo el EPP requerido</li>
  <li>Reportar inmediatamente condiciones inseguras, incidentes o lesiones</li>
  <li>Detener el trabajo cuando existan condiciones inseguras y notificar a un supervisor</li>
</ul>
<p>Entiendo que el incumplimiento de las normas de seguridad puede resultar en medidas disciplinarias, incluyendo la terminación del empleo.</p>
<p>Asimismo, reconozco que la Empresa proporciona lineamientos, capacitación y supervisión para promover un ambiente de trabajo seguro. Sin embargo, entiendo que mi seguridad depende de mis propias acciones y cumplimiento. Acepto que la Empresa no será responsable por lesiones, daños o pérdidas que resulten de mi incumplimiento del Manual de Seguridad.</p>
<p>Al firmar abajo, confirmo que he tenido la oportunidad de hacer preguntas y que entiendo y acepto cumplir con el contenido del Manual de Seguridad.</p>
</body>
</html>`;

// ─── PDF template ─────────────────────────────────────────────────────────────
function buildPdfHtml(workerName: string, signedAt: string, sigDataUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; margin: 48px 52px; font-size: 13px; line-height: 1.65; color: #000; }
  h1 { font-size: 26px; font-weight: 900; margin-bottom: 22px; }
  h2 { font-size: 13px; font-weight: 900; margin-top: 28px; margin-bottom: 10px; text-transform: uppercase; }
  p { margin-bottom: 13px; }
  ul { margin-left: 28px; margin-bottom: 13px; }
  li { margin-bottom: 6px; }
  hr { border: none; border-top: 1px solid #000; margin: 28px 0; }
  .sig-block { margin-top: 32px; }
  .sig-row { display: flex; align-items: flex-end; margin-bottom: 14px; gap: 12px; }
  .sig-label { font-weight: 700; white-space: nowrap; }
  .sig-val { border-bottom: 1px solid #555; flex: 1; padding-bottom: 2px; min-width: 200px; }
  .sig-img { margin-top: 8px; border: 1px solid #ccc; max-width: 320px; max-height: 100px; display:block; }
  .page-num { text-align: right; color: #666; font-size: 11px; margin-top: 40px; }
</style>
</head>
<body>

<h1>NGUYEN MEP, LLC</h1>

<h2>Safety Manual Acknowledgment</h2>

<p>I acknowledge that I have received, read, and understand the Company Safety Manual, including all safety policies, procedures, and OSHA-related requirements applicable to my work.</p>

<p>I understand that construction work involves inherent hazards, including but not limited to falls, electrical hazards, heavy equipment operation, trenching, and exposure to potentially dangerous materials. I agree to follow all safety rules, use required personal protective equipment (PPE), and comply with all safety instructions, training, and jobsite requirements at all times.</p>

<p>I agree to:</p>
<ul>
  <li>Follow all Company safety policies and OSHA regulations</li>
  <li>Properly use and maintain all required PPE</li>
  <li>Report unsafe conditions, incidents, or injuries immediately</li>
  <li>Stop work when conditions are unsafe and notify a supervisor</li>
</ul>

<p>I understand that failure to follow safety rules and procedures may result in disciplinary action, up to and including termination.</p>

<p>I further acknowledge that the Company provides safety guidelines, training, and supervision to promote a safe work environment. However, I understand that my safety depends on my own actions and compliance. I agree that the Company shall not be held liable for any injuries, damages, or losses resulting from my failure to follow the Safety Manual, training, or safety instructions.</p>

<p>By signing below, I confirm that I have had the opportunity to ask questions and that I fully understand and agree to comply with the contents of the Safety Manual.</p>

<hr />

<h2>Acuse de Recibo del Manual de Seguridad (Construcción)</h2>

<p>Yo reconozco que he recibido, leído y entendido el Manual de Seguridad de la Empresa, incluyendo todas las políticas, procedimientos y requisitos de OSHA aplicables a mi trabajo.</p>

<p>Entiendo que el trabajo de construcción implica riesgos inherentes, incluyendo, entre otros, caídas, riesgos eléctricos, operación de maquinaria pesada, excavaciones y exposición a materiales peligrosos. Acepto cumplir con todas las reglas de seguridad, usar el equipo de protección personal (EPP) requerido y seguir todas las instrucciones y requisitos de seguridad en todo momento.</p>

<p>Acepto:</p>
<ul>
  <li>Cumplir con todas las políticas de seguridad de la empresa y regulaciones de OSHA</li>
  <li>Usar y mantener adecuadamente todo el EPP requerido</li>
  <li>Reportar inmediatamente condiciones inseguras, incidentes o lesiones</li>
  <li>Detener el trabajo cuando existan condiciones inseguras y notificar a un supervisor</li>
</ul>

<p>Entiendo que el incumplimiento de las normas de seguridad puede resultar en medidas disciplinarias, incluyendo la terminación del empleo.</p>

<p>Asimismo, reconozco que la Empresa proporciona lineamientos, capacitación y supervisión para promover un ambiente de trabajo seguro. Sin embargo, entiendo que mi seguridad depende de mis propias acciones y cumplimiento. Acepto que la Empresa no será responsable por lesiones, daños o pérdidas que resulten de mi incumplimiento del Manual de Seguridad, la capacitación o las instrucciones de seguridad.</p>

<p>Al firmar abajo, confirmo que he tenido la oportunidad de hacer preguntas y que entiendo y acepto cumplir con el contenido del Manual de Seguridad.</p>

<div class="sig-block">
  <div class="sig-row">
    <span class="sig-label">Name / Nombre:</span>
    <span class="sig-val">${workerName}</span>
  </div>
  <div class="sig-row">
    <span class="sig-label">Date / Fecha:</span>
    <span class="sig-val">${signedAt}</span>
  </div>
  <div>
    <span class="sig-label">Signature:</span>
    <img src="${sigDataUrl}" class="sig-img" />
  </div>
</div>

<div class="page-num">Page 2 of 2</div>
</body>
</html>
`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type ManualDoc = {
  id: number;
  title: string | null;
  pdf_url: string | null;
  document_type: string | null;
  is_active: boolean | null;
};

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function SafetyManualScreen() {
  const { t } = useLanguage();
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [manual, setManual]             = useState<ManualDoc | null>(null);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [companyEmail, setCompanyEmail] = useState<string | null>(null);

  // Signature flow state
  const [showSignModal, setShowSignModal]   = useState(false);
  const [sigStep, setSigStep]               = useState<'pad' | 'confirm'>('pad');
  const [workerName, setWorkerName]         = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  const webviewRef = useRef<WebView>(null);

  useEffect(() => { loadManual(); }, []);

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

  async function loadManual() {
    try {
      setLoading(true);
      // Use getSession() — reads local storage, no network call, won't fail with AuthSessionMissingError
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        Alert.alert(t('sessionExpired'), t('pleaseLogInAgain'), [
          { text: 'OK', onPress: () => router.back() },
        ]);
        setLoading(false);
        return;
      }

      // Pre-fill worker name from profile (silent — never crashes)
      try {
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
      } catch (e) { console.warn('Profile load skipped:', e); }

      // Load company email for auto-send (silent)
      try {
        const { data: settingsData } = await supabase
          .from('company_settings')
          .select('company_email')
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle();
        setCompanyEmail(settingsData?.company_email || null);
      } catch (e) { console.warn('Settings load skipped:', e); }

      // Look up the active safety manual document record (optional — document text is embedded)
      try {
        const { data: manualData } = await supabase
          .from('safety_documents')
          .select('id, title, pdf_url, document_type, is_active')
          .eq('document_type', 'company_safety_manual')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setManual((manualData as ManualDoc) || null);
      } catch (e) { console.warn('Manual doc lookup skipped:', e); }

      // Check if already signed this week (works with or without a manual_document_id)
      try {
        const weekStart = formatDateOnly(getStartOfWeek());
        let query = supabase
          .from('safety_manual_acknowledgements')
          .select('id, signed_name')
          .eq('worker_id', user.id)
          .eq('week_start', weekStart)
          .limit(1);

        const { data: ackData } = await query.maybeSingle();
        setAlreadySigned(!!ackData);
        if (ackData?.signed_name) setWorkerName(prev => ackData.signed_name || prev);
      } catch (e) { console.warn('Ack check skipped:', e); }

    } catch (error) {
      // Auth or unexpected error — still show document, just log
      console.error('loadManual outer error:', error);
    } finally {
      setLoading(false);
    }
  }

  // Called when WebView posts a message (signature captured or empty)
  function handleWebViewMessage(event: any) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'empty') {
        Alert.alert(t('noSignatureTitle'), t('noSignatureDrawFirst'));
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
      Alert.alert(t('missingSignature'), t('pleaseDrawSignature'));
      return;
    }

    try {
      setSaving(true);
      const { data: { session: sess } } = await supabase.auth.getSession();
      const user = sess?.user;
      if (!user) throw new Error(t('sessionExpired') + '. ' + t('pleaseLogInAgain'));

      const weekStart   = formatDateOnly(getStartOfWeek());
      const now         = new Date();
      const signedAt    = now.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      // Build upsert payload — manual_document_id is optional (null if no DB record found)
      const upsertPayload: any = {
        worker_id:      user.id,
        week_start:     weekStart,
        signed_name:    workerName.trim(),
        signature_text: signatureDataUrl,
        signed_at:      now.toISOString(),
      };
      if (manual?.id) upsertPayload.manual_document_id = manual.id;

      // Save the acknowledgement — get the row ID back so we can build the view URL
      const { data: ackData, error: upsertError } = await supabase
        .from('safety_manual_acknowledgements')
        .upsert(upsertPayload, { onConflict: 'worker_id,week_start' })
        .select('id')
        .single();
      if (upsertError) throw upsertError;

      // Build the server-side view URL (renders HTML page from stored signature)
      const pdfUrl = `https://nguyenmep.com/api/portal/view-ack?id=${ackData.id}&type=manual`;
      await supabase
        .from('safety_manual_acknowledgements')
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
            type: 'manual',
            companyEmail,
          }),
        }).catch(() => { /* silent — email failure never blocks the worker */ });
      }

      Alert.alert(t('signed'), t('safetyManualAckComplete'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      console.error('Sign error:', err);
      Alert.alert(t('error'), err?.message || t('couldNotSaveSignature'));
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" />
        <Text style={s.loadingText}>{t('loadingSafetyManual')}</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Status badge */}
      <View style={[s.badge, alreadySigned ? s.badgeGreen : s.badgeRed]}>
        <Text style={s.badgeText}>{alreadySigned ? t('acknowledgedThisWeek') : t('signatureRequiredReadBelow')}</Text>
      </View>

      {/* Document viewer:
          1. If the manager uploaded a PDF, show that (Google Docs viewer for inline PDF rendering).
          2. Otherwise fall back to the embedded English+Spanish acknowledgment HTML so workers can still sign. */}
      <View style={s.docViewerWrap}>
        {manual?.pdf_url ? (
          <WebView
            source={{ uri: `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(manual.pdf_url)}` }}
            style={s.docViewer}
            scrollEnabled
            originWhitelist={['*']}
            showsVerticalScrollIndicator
            startInLoadingState
          />
        ) : (
          <WebView
            source={{ html: DOCUMENT_HTML }}
            style={s.docViewer}
            scrollEnabled
            javaScriptEnabled={false}
            originWhitelist={['*']}
            showsVerticalScrollIndicator
          />
        )}
      </View>

      {/* Bottom bar — fixed */}
      <View style={s.bottomBar}>
        {!alreadySigned && (
          <TouchableOpacity style={s.signButton} onPress={openSignModal}>
            <Text style={s.signButtonText}>{t('signSafetyManualBtn')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.closeButton} onPress={() => router.back()}>
          <Text style={s.closeButtonText}>{t('close')}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Signature Modal ── */}
      <Modal visible={showSignModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSignModal}>
        <View style={s.modalWrap}>

          {/* Header */}
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{t('signSafetyManualHeader')}</Text>
            <TouchableOpacity onPress={closeSignModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Worker name — read-only, pulled from profile */}
          <View style={s.nameSection}>
            <Text style={s.fieldLabel}>{t('signingAs')}</Text>
            <View style={s.nameDisplay}>
              <Text style={s.nameDisplayText}>{workerName || t('unknownWorker')}</Text>
            </View>
            <Text style={s.nameSub}>{t('nameFromProfileNotice')}</Text>
          </View>

          {sigStep === 'pad' ? (
            <>
              {/* Signature instructions */}
              <View style={s.padLabelRow}>
                <Text style={s.fieldLabel}>{t('signatureLabel')}</Text>
                <Text style={s.padHint}>{t('drawSignaturePrompt')}</Text>
              </View>

              {/* Signature WebView canvas */}
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
              {/* Signature preview */}
              <View style={s.previewSection}>
                <Text style={s.fieldLabel}>{t('signaturePreview')}</Text>
                <View style={s.previewBox}>
                  {signatureDataUrl ? (
                    <Image
                      source={{ uri: signatureDataUrl }}
                      style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                    />
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => { setSigStep('pad'); setSignatureDataUrl(null); }} style={s.redrawButton}>
                  <Text style={s.redrawText}>{t('redrawSignature')}</Text>
                </TouchableOpacity>
              </View>

              {/* Confirm button */}
              <View style={s.confirmSection}>
                <TouchableOpacity
                  style={[s.confirmButton, saving && s.disabledButton]}
                  onPress={handleConfirm}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.confirmButtonText}>{t('submitGeneratePdf')}</Text>
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
  centered:    { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#555' },
  errorTitle:  { fontSize: 20, fontWeight: '800', marginBottom: 8, color: '#111' },
  errorText:   { color: '#555', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  badge:       { margin: 12, marginBottom: 0, alignSelf: 'stretch', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  badgeGreen:  { backgroundColor: '#dff6e6' },
  badgeRed:    { backgroundColor: '#fde7e7' },
  badgeText:   { fontSize: 13, fontWeight: '800', color: '#222', textAlign: 'center' },

  // Inline document viewer
  docViewerWrap: { flex: 1, margin: 12, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  docViewer:     { flex: 1, backgroundColor: '#fff' },

  bottomBar:   { padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: '#e6e8ec', backgroundColor: '#fff', gap: 10 },
  signButton:  { backgroundColor: '#16356B', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
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
