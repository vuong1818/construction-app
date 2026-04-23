import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '../lib/supabase';

type ManualDoc = {
  id: number;
  title: string | null;
  pdf_url: string | null;
  document_type: string | null;
  is_active: boolean | null;
};

export default function SafetyManualScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [manual, setManual] = useState<ManualDoc | null>(null);
  const [alreadySigned, setAlreadySigned] = useState(false);

  useEffect(() => {
    loadManual();
  }, []);

  async function loadManual() {
    try {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error('User not authenticated');

      const { data: manualData, error: manualError } = await supabase
        .from('safety_documents')
        .select('id, title, pdf_url, document_type, is_active')
        .eq('document_type', 'company_safety_manual')
        .eq('is_active', true)
        .not('pdf_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (manualError && manualError.code !== 'PGRST116') {
        throw manualError;
      }

      if (!manualData) {
        setManual(null);
        return;
      }

      setManual(manualData as ManualDoc);

      const { data: ackData, error: ackError } = await supabase
        .from('safety_manual_acknowledgements')
        .select('id')
        .eq('user_id', user.id)
        .eq('manual_document_id', manualData.id)
        .limit(1)
        .maybeSingle();

      if (ackError && ackError.code !== 'PGRST116') {
        throw ackError;
      }

      setAlreadySigned(!!ackData);
    } catch (error) {
      console.error('Error loading safety manual:', error);
      Alert.alert('Error', 'Could not load safety manual.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignManual() {
    if (!manual?.id) {
      Alert.alert('Error', 'No active safety manual found.');
      return;
    }

    try {
      setSaving(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('safety_manual_acknowledgements')
        .upsert(
          [
            {
              user_id: user.id,
              manual_document_id: manual.id,
              signed_at: new Date().toISOString(),
            },
          ],
          {
            onConflict: 'user_id,manual_document_id',
          }
        );

      if (error) throw error;

      setAlreadySigned(true);

      Alert.alert('Success', 'Safety Manual acknowledgement completed.', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      console.error('Error signing safety manual:', error);
      Alert.alert(
        'Error',
        error?.message || 'Could not complete safety manual acknowledgement.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading safety manual...</Text>
      </View>
    );
  }

  if (!manual?.pdf_url) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>No Active Safety Manual</Text>
        <Text style={styles.errorText}>
          The manager has not uploaded an active safety manual yet.
        </Text>

        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const viewerUrl = `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(
    manual.pdf_url
  )}`;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{manual.title || 'Safety Manual'}</Text>

      <View style={styles.statusRow}>
        <View style={[styles.badge, alreadySigned ? styles.badgeGreen : styles.badgeRed]}>
          <Text style={styles.badgeText}>
            {alreadySigned ? 'Acknowledged' : 'Not Yet Signed'}
          </Text>
        </View>
      </View>

      <View style={styles.viewerWrap}>
        <WebView source={{ uri: viewerUrl }} style={styles.webview} />
      </View>

      <View style={styles.bottomBar}>
        {!alreadySigned && (
          <TouchableOpacity
            style={[styles.signButton, saving && styles.disabledButton]}
            onPress={handleSignManual}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.signButtonText}>Sign Safety Manual</Text>
            )}
          </TouchableOpacity>
        )}

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
  centered: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#555',
  },
  header: {
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    color: '#111',
  },
  statusRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeGreen: {
    backgroundColor: '#dff6e6',
  },
  badgeRed: {
    backgroundColor: '#fde7e7',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#222',
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
    gap: 10,
  },
  signButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  signButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
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
  errorTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    color: '#111',
  },
  errorText: {
    color: '#555',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
});