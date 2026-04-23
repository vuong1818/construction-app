import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

export default function SafetyDocumentViewer() {
  const params = useLocalSearchParams<{
    title?: string;
    pdfUrl?: string;
  }>();

  const title = params.title || 'Document';
  const pdfUrl = params.pdfUrl || '';

  const viewerUrl = `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(
    pdfUrl
  )}`;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.header}>{title}</Text>
      </View>

      <View style={styles.viewerWrap}>
        <WebView source={{ uri: viewerUrl }} style={styles.webview} />
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <Text style={styles.closeButtonText}>Close</Text>
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