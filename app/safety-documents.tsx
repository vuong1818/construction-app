import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
import { useLanguage } from '../lib/i18n';
import { supabase } from '../lib/supabase';

type SafetyDocument = {
  id: number;
  title: string | null;
  description: string | null;
  category: string | null;
  pdf_url: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  language: 'en' | 'es' | null;
};

type Lang = 'en' | 'es';

export default function SafetyDocumentsScreen() {
  const { t, language } = useLanguage();
  const [documents, setDocuments] = useState<SafetyDocument[]>([]);
  const [search, setSearch] = useState('');
  const [docLang, setDocLang] = useState<Lang>(language === 'es' ? 'es' : 'en');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((doc) => {
      if ((doc.language || 'en') !== docLang) return false;
      if (!q) return true;
      const title = (doc.title || '').toLowerCase();
      const category = (doc.category || '').toLowerCase();
      const description = (doc.description || '').toLowerCase();
      return title.includes(q) || category.includes(q) || description.includes(q);
    });
  }, [search, documents, docLang]);

  async function loadDocuments() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('safety_documents')
        .select('id, title, description, category, pdf_url, is_active, sort_order, language')
        .eq('is_active', true)
        .neq('document_type', 'company_safety_manual')
        .not('pdf_url', 'is', null)
        .order('sort_order', { ascending: true })
        .order('title', { ascending: true });

      if (error) throw error;

      setDocuments((data as SafetyDocument[]) || []);
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
        title: item.title || t('documentLabel'),
        pdfUrl: item.pdf_url || '',
      },
    });
  }

  function renderItem({ item }: { item: SafetyDocument }) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{item.title || t('untitledDocument')}</Text>

        {!!item.category && <Text style={styles.category}>{item.category}</Text>}

        {!!item.description && (
          <Text style={styles.description}>{item.description}</Text>
        )}

        <TouchableOpacity style={styles.button} onPress={() => openDocument(item)}>
          <Text style={styles.buttonText}>{t('openDocument')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const enCount = documents.filter(d => (d.language || 'en') === 'en').length;
  const esCount = documents.filter(d => d.language === 'es').length;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>{t('loadingOshaPublications')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{t('oshaPublications')}</Text>

      <View style={styles.langRow}>
        <TouchableOpacity
          style={[styles.langTab, docLang === 'en' && styles.langTabActive]}
          onPress={() => setDocLang('en')}
        >
          <Text style={[styles.langTabText, docLang === 'en' && styles.langTabTextActive]}>
            {t('english')} ({enCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.langTab, docLang === 'es' && styles.langTabActive]}
          onPress={() => setDocLang('es')}
        >
          <Text style={[styles.langTabText, docLang === 'es' && styles.langTabTextActive]}>
            {t('spanish')} ({esCount})
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        placeholder={t('searchPublications')}
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
          <Text style={styles.emptyText}>{t('noOshaPublicationsFound')}</Text>
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
  langRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#d9dce1',
    marginBottom: 12,
  },
  langTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  langTabActive: {
    backgroundColor: '#1f6feb',
  },
  langTabText: {
    color: '#444',
    fontWeight: '600',
  },
  langTabTextActive: {
    color: '#fff',
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
