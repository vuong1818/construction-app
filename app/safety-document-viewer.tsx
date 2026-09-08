import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLanguage } from '../lib/i18n';
import { signedUrl } from '../lib/storageUrl';

// Same rule as the safety manual: iOS renders a PDF itself, Android needs
// Google's viewer, and Google can only rasterise a url it can reach — never a
// private signed one. Getting that wrong shows a blank white page.
function pdfViewerUri(url: string): string {
  const isPrivate = /\/storage\/v1\/object\/(sign|authenticated)\//.test(url) || /[?&]token=/.test(url);
  if (Platform.OS === 'ios' || isPrivate) return url;
  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
}

export default function SafetyDocumentViewer() {
  const { t } = useLanguage();
  const params = useLocalSearchParams<{
    title?: string;
    pdfUrl?: string;
  }>();

  const title = params.title || t('documentLabel');
  // What arrives here is whatever the row holds: an osha.gov link for a preset,
  // or a path inside our storage for anything uploaded. A path is not a URL —
  // handing one to a viewer produced "No preview available", and handing one to
  // Linking.openURL did nothing at all. Resolving it here means every screen
  // that opens a document can keep passing the raw column.
  const raw = params.pdfUrl || '';
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const url = await signedUrl('safety-pdfs', raw).catch(() => null);
      if (!alive) return;
      setPdfUrl(url);
      setResolving(false);
    })();
    return () => { alive = false; };
  }, [raw]);

  const viewerUrl = pdfUrl ? pdfViewerUri(pdfUrl) : '';

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.header}>{title}</Text>
      </View>

      <View style={styles.viewerWrap}>
        {resolving ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#00B4D8" />
          </View>
        ) : pdfUrl ? (
          <WebView source={{ uri: viewerUrl }} style={styles.webview} />
        ) : (
          // Say what went wrong. A blank viewer reads as a broken app; this
          // reads as a document that needs re-uploading, which is the truth.
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Text style={{ color: '#516079', fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
              {t('documentCouldNotOpen')}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.bottomBar}>
        {/* A document that will not render inline must still be readable. */}
        {!!pdfUrl && (
          <TouchableOpacity onPress={() => Linking.openURL(pdfUrl)} style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: '#00B4D8', fontWeight: '700', fontSize: 13 }}>Open outside the app ↗</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <Text style={styles.closeButtonText}>{t('close')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  header: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
  },
  viewerWrap: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  bottomBar: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e6e8ec',
    backgroundColor: '#fff',
  },
  closeButton: {
    backgroundColor: '#1f2937',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});