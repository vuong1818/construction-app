import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLanguage } from '../lib/i18n';

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
  const pdfUrl = params.pdfUrl || '';

  const viewerUrl = pdfViewerUri(pdfUrl);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.header}>{title}</Text>
      </View>

      <View style={styles.viewerWrap}>
        <WebView source={{ uri: viewerUrl }} style={styles.webview} />
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