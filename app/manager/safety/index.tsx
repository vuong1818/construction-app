import * as DocumentPicker from 'expo-document-picker';
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
import { supabase } from '../../../lib/supabase';

type ManualDoc = {
  id: number;
  title: string | null;
  pdf_url: string | null;
  document_type: string | null;
  is_active: boolean | null;
};

export default function ManagerSafetyIndexScreen() {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [manual, setManual] = useState<ManualDoc | null>(null);

  useEffect(() => {
    loadManual();
  }, []);

  async function loadManual() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('safety_documents')
        .select('id, title, pdf_url, document_type, is_active')
        .eq('document_type', 'company_safety_manual')
        .eq('is_active', true)
        .not('pdf_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      setManual((data as ManualDoc) || null);
    } catch (error) {
      console.error('Error loading manager safety manual:', error);
      Alert.alert('Error', 'Could not load the current safety manual.');
    } finally {
      setLoading(false);
    }
  }

  async function pickAndUploadManual() {
    try {
      setUploading(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        setUploading(false);
        return;
      }

      const file = result.assets?.[0];

      if (!file?.uri) {
        throw new Error('No file selected.');
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error('User not authenticated');

      const safeName = (file.name || 'safety-manual.pdf').replace(/\s+/g, '-');
      const filePath = `manuals/${Date.now()}-${safeName}`;

      const response = await fetch(file.uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('safety-pdfs')
        .upload(filePath, arrayBuffer, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('safety-pdfs')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      const { error: deactivateError } = await supabase
        .from('safety_documents')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('document_type', 'company_safety_manual')
        .eq('is_active', true);

      if (deactivateError) throw deactivateError;

      const { error: insertError } = await supabase
        .from('safety_documents')
        .insert({
          document_type: 'company_safety_manual',
          title: file.name || 'Safety Manual',
          description: 'Current active company safety manual',
          category: 'Manual',
          source_type: 'external_pdf',
          pdf_url: publicUrl,
          is_active: true,
          updated_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;

      Alert.alert('Success', 'Safety manual uploaded successfully.');
      await loadManual();
    } catch (error: any) {
      console.error('Error uploading safety manual:', error);
      Alert.alert('Error', error?.message || 'Could not upload safety manual.');
    } finally {
      setUploading(false);
    }
  }

  async function deleteCurrentManual() {
    if (!manual) return;

    try {
      setDeleting(true);

      if (manual.pdf_url?.includes('/storage/v1/object/public/safety-pdfs/')) {
        const path = manual.pdf_url.split('/storage/v1/object/public/safety-pdfs/')[1];

        if (path) {
          const { error: storageDeleteError } = await supabase.storage
            .from('safety-pdfs')
            .remove([path]);

          if (storageDeleteError) {
            console.error('Storage delete warning:', storageDeleteError);
          }
        }
      }

      const { error: deleteRowError } = await supabase
        .from('safety_documents')
        .delete()
        .eq('id', manual.id);

      if (deleteRowError) throw deleteRowError;

      Alert.alert('Deleted', 'Safety manual deleted.');
      setManual(null);
    } catch (error: any) {
      console.error('Error deleting safety manual:', error);
      Alert.alert('Error', error?.message || 'Could not delete safety manual.');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading safety settings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Manager Safety</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current Safety Manual</Text>

        {manual ? (
          <>
            <Text style={styles.manualTitle}>{manual.title || 'Safety Manual'}</Text>
            <Text style={styles.manualStatus}>Active manual available for workers.</Text>

            <TouchableOpacity
              style={styles.viewButton}
              onPress={() =>
                router.push({
                  pathname: '/safety-document-viewer',
                  params: {
                    title: manual.title || 'Safety Manual',
                    pdfUrl: manual.pdf_url || '',
                  },
                })
              }
            >
              <Text style={styles.buttonText}>View Current Manual</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deleteButton, deleting && styles.disabledButton]}
              onPress={deleteCurrentManual}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Delete Current Manual</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.emptyText}>No active safety manual uploaded yet.</Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.uploadButton, uploading && styles.disabledButton]}
        onPress={pickAndUploadManual}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Upload New Safety Manual PDF</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => router.push('/manager/safety/meeting')}
      >
        <Text style={styles.secondaryButtonText}>Manage Weekly Meeting</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f8fa',
    padding: 16,
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
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 16,
    color: '#111',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e6e8ec',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
    marginBottom: 10,
  },
  manualTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
  },
  manualStatus: {
    color: '#2d6a4f',
    marginBottom: 12,
    fontWeight: '600',
  },
  emptyText: {
    color: '#666',
  },
  uploadButton: {
    backgroundColor: '#1f6feb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  viewButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  deleteButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.7,
  },
});