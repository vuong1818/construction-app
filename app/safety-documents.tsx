import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

type SafetyDocument = {
  id: number;
  title: string | null;
  description: string | null;
  category: string | null;
  pdf_url: string | null;
  is_active: boolean | null;
  sort_order: number | null;
};

export default function SafetyDocumentsScreen() {
  const [documents, setDocuments] = useState<SafetyDocument[]>([]);
  const [filtered, setFiltered] = useState<SafetyDocument[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  useEffect(() => {
    const q = search.trim().toLowerCase();

    if (!q) {
      setFiltered(documents);
      return;
    }

    setFiltered(
      documents.filter((doc) => {
        const title = (doc.title || '').toLowerCase();
        const category = (doc.category || '').toLowerCase();
        const description = (doc.description || '').toLowerCase();

        return (
          title.includes(q) ||
          category.includes(q) ||
          description.includes(q)
        );
      })
    );
  }, [search, documents]);

  async function loadDocuments() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('safety_documents')
        .select('id, title, description, category, pdf_url, is_active, sort_order')
        .eq('is_active', true)
        .not('pdf_url', 'is', null)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      setDocuments((data as SafetyDocument[]) || []);
      setFiltered((data as SafetyDocument[]) || []);
    } catch (error) {
      console.error('Error loading safety documents:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadDocuments();
  }

  function openDocument(item: SafetyDocument) {
    router.push({
      pathname: '/safety-document-viewer',
      params: {
        title: item.title || 'Document',
        pdfUrl: item.pdf_url || '',
      },
    });
  }

  function renderItem({ item }: { item: SafetyDocument }) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{item.title || 'Untitled Document'}</Text>

        {!!item.category && <Text style={styles.category}>{item.category}</Text>}

        {!!item.description && (
          <Text style={styles.description}>{item.description}</Text>
        )}

        <TouchableOpacity style={styles.button} onPress={() => openDocument(item)}>
          <Text style={styles.buttonText}>Open Document</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading OSHA publications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>OSHA Publications</Text>

      <TextInput
        placeholder="Search publications..."
        value={search}
        onChangeText={setSearch}
        style={styles.search}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No OSHA publications found.</Text>
        }
      />
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
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
    color: '#111',
  },
  search: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d9dce1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e6e8ec',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  category: {
    marginTop: 6,
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
  },
  description: {
    marginTop: 8,
    color: '#444',
    lineHeight: 20,
  },
  button: {
    marginTop: 12,
    backgroundColor: '#1f6feb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 24,
  },
});