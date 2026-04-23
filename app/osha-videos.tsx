import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../lib/supabase';

type VideoRow = {
  id: number;
  title?: string | null;
  name?: string | null;
  module_name?: string | null;
  module_number?: number | null;
  video_url?: string | null;
  youtube_url?: string | null;
  url?: string | null;
  description?: string | null;
  is_active?: boolean | null;
};

export default function OshaVideosScreen() {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [filtered, setFiltered] = useState<VideoRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadVideos();
  }, []);

  useEffect(() => {
    const q = search.trim().toLowerCase();

    if (!q) {
      setFiltered(videos);
      return;
    }

    setFiltered(
      videos.filter((item) => {
        const title = (
          item.title ||
          item.name ||
          item.module_name ||
          ''
        ).toLowerCase();

        const description = (item.description || '').toLowerCase();
        const moduleNumber = String(item.module_number || '');

        return (
          title.includes(q) ||
          description.includes(q) ||
          moduleNumber.includes(q)
        );
      })
    );
  }, [search, videos]);

  async function loadVideos() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('osha_training_videos')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      setVideos((data as VideoRow[]) || []);
      setFiltered((data as VideoRow[]) || []);
    } catch (error) {
      console.error('Error loading OSHA videos:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadVideos();
  }

  async function openVideo(item: VideoRow) {
    const url = item.video_url || item.youtube_url || item.url;

    if (!url) {
      Alert.alert('Missing Video', 'No video URL was found for this item.');
      return;
    }

    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Cannot Open', 'This video link could not be opened.');
      return;
    }

    await Linking.openURL(url);
  }

  function renderItem({ item }: { item: VideoRow }) {
    const title = item.title || item.name || item.module_name || 'OSHA Video';

    return (
      <View style={styles.card}>
        {!!item.module_number && (
          <Text style={styles.moduleNumber}>Module {item.module_number}</Text>
        )}

        <Text style={styles.title}>{title}</Text>

        {!!item.description && (
          <Text style={styles.description}>{item.description}</Text>
        )}

        <TouchableOpacity style={styles.button} onPress={() => openVideo(item)}>
          <Text style={styles.buttonText}>Watch Video</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading OSHA videos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>OSHA Videos</Text>

      <TextInput
        placeholder="Search videos..."
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
          <Text style={styles.emptyText}>No OSHA videos found.</Text>
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
  moduleNumber: {
    color: '#666',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
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