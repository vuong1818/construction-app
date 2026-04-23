import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { supabase } from '../lib/supabase';

type AckRow = {
  id: string;
  acknowledged_at: string;
  profiles: {
    name: string | null;
    email: string | null;
  } | null;
  safety_documents: {
    title: string | null;
    category: string | null;
  } | null;
};

export default function SafetyDocumentAcknowledgementsScreen() {
  const [rows, setRows] = useState<AckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadRows();
  }, []);

  async function loadRows() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('safety_document_acknowledgements')
        .select(`
          id,
          acknowledged_at,
          profiles:user_id (
            name,
            email
          ),
          safety_documents:document_id (
            title,
            category
          )
        `)
        .order('acknowledged_at', { ascending: false });

      if (error) throw error;

      setRows((data as AckRow[]) || []);
    } catch (error) {
      console.error('Error loading acknowledgements:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadRows();
  }

  function renderItem({ item }: { item: AckRow }) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>
          {item.safety_documents?.title || 'Untitled Document'}
        </Text>

        {!!item.safety_documents?.category && (
          <Text style={styles.category}>{item.safety_documents.category}</Text>
        )}

        <Text style={styles.worker}>
          Worker: {item.profiles?.name || item.profiles?.email || 'Unknown User'}
        </Text>

        <Text style={styles.time}>
          Read on {new Date(item.acknowledged_at).toLocaleDateString()} at{' '}
          {new Date(item.acknowledged_at).toLocaleTimeString()}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading acknowledgements...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Document Read Tracking</Text>
      <Text style={styles.subheader}>
        Managers can review which workers acknowledged each safety document.
      </Text>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No acknowledgements found yet.</Text>
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
  },
  loadingText: {
    marginTop: 12,
    color: '#555',
  },
  header: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
    color: '#111',
  },
  subheader: {
    color: '#555',
    marginBottom: 14,
    lineHeight: 20,
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
    fontWeight: '800',
    color: '#111',
  },
  category: {
    marginTop: 6,
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
  },
  worker: {
    marginTop: 10,
    color: '#222',
    fontWeight: '600',
  },
  time: {
    marginTop: 8,
    color: '#2d6a4f',
    fontSize: 13,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 24,
  },
});