import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLanguage } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { currentWorkWeekStart, fmtLocalDate } from '../lib/workWeek';

type Profile = {
  id: string;
  role: 'worker' | 'manager' | string;
};

type WeeklyTopic = {
  id: number;
  week_start?: string | null;
  topic?: string | null;
  title?: string | null;
  created_at?: string | null;
};

export default function SafetyScreen() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [manualSigned, setManualSigned] = useState(false);
  const [meetingSigned, setMeetingSigned] = useState(false);
  const [currentTopic, setCurrentTopic] = useState<WeeklyTopic | null>(null);
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  const isWorker = profile?.role === 'worker';
  const fullyCompliant = manualSigned && meetingSigned;

  // Reload every time the screen regains focus (e.g. returning from the weekly
  // meeting screen after signing) so the status pills reflect the new ack.
  useFocusEffect(
    useCallback(() => {
      loadSafetyStatus();
    }, [])
  );

  async function onRefresh() {
    setRefreshing(true);
    await loadSafetyStatus();
    setRefreshing(false);
  }

  async function loadSafetyStatus() {
    try {
      setLoading(true);

      // Use getSession() — reads local storage, no network call, won't fail offline
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { setLoading(false); return; }

      // Load profile (silent — never crash the status screen)
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('id', user.id)
          .single();
        if (profileData) setProfile(profileData as Profile);
      } catch (e) { console.warn('Profile load skipped:', e); }

      const weekStart = fmtLocalDate(await currentWorkWeekStart());

      // Check manual signed — by worker_id + week_start only (works even without a manual document record)
      try {
        const { data: manualAck } = await supabase
          .from('safety_manual_acknowledgements')
          .select('id')
          .eq('worker_id', user.id)
          .eq('week_start', weekStart)
          .limit(1)
          .maybeSingle();
        setManualSigned(!!manualAck);
      } catch (e) { console.warn('Manual ack check skipped:', e); }

      // Load weekly topic
      let topicId: number | null = null;
      try {
        const { data: topicData } = await supabase
          .from('weekly_safety_topics')
          .select('*')
          .eq('week_start', weekStart)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setCurrentTopic((topicData as WeeklyTopic) || null);
        topicId = topicData?.id || null;
      } catch (e) { console.warn('Topic load skipped:', e); }

      // Company safety manual PDF (own org's, else the SiteOfficeIQ preset) — view only.
      try {
        const { data: manualDoc } = await supabase
          .from('safety_documents')
          .select('pdf_url')
          .eq('document_type', 'company_safety_manual')
          .eq('is_active', true)
          .order('is_preset', { ascending: true })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setManualUrl((manualDoc as any)?.pdf_url || null);
      } catch (e) { console.warn('Manual URL load skipped:', e); }

      // Check meeting signed — by worker_id + week_start (+ topic_id if available)
      try {
        let query = supabase
          .from('weekly_meeting_acknowledgements')
          .select('id')
          .eq('worker_id', user.id)
          .eq('week_start', weekStart)
          .limit(1);
        if (topicId) query = query.eq('topic_id', topicId);
        const { data: meetingData } = await query.maybeSingle();
        setMeetingSigned(!!meetingData);
      } catch (e) { console.warn('Meeting ack check skipped:', e); }

    } catch (error) {
      console.error('Error loading safety status:', error);
    } finally {
      setLoading(false);
    }
  }

  const complianceText = useMemo(() => {
    if (fullyCompliant) return t('fullyCompliantMessage');
    if (!manualSigned && !meetingSigned) return t('needsBothMessage');
    if (!manualSigned) return t('needsManualMessage');
    return t('needsMeetingMessage');
  }, [fullyCompliant, manualSigned, meetingSigned, t]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>{t('loadingSafetyStatus')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.header}>{t('safety')}</Text>

      <View
        style={[
          styles.statusCard,
          fullyCompliant ? styles.statusCardGreen : styles.statusCardRed,
        ]}
      >
        <View style={styles.statusTopRow}>
          <Text style={styles.statusDot}>{fullyCompliant ? '🟢' : '🔴'}</Text>
          <Text style={styles.statusTitle}>
            {fullyCompliant ? t('safetyCompliant') : t('safetyActionRequired')}
          </Text>
        </View>

        <Text style={styles.statusText}>{complianceText}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('requiredSafetyActions')}</Text>

        <View style={styles.requirementCard}>
          <View style={styles.requirementRow}>
            <View style={styles.requirementTextWrap}>
              <Text style={styles.requirementTitle}>{t('weeklySafetySignIn')}</Text>
              <Text style={styles.requirementSubtitle}>
                {t('weeklySafetySignInSubtitle')}
              </Text>
            </View>
            <View
              style={[
                styles.pill,
                fullyCompliant ? styles.pillComplete : styles.pillIncomplete,
              ]}
            >
              <Text style={styles.pillText}>
                {fullyCompliant ? t('completed') : t('required')}
              </Text>
            </View>
          </View>

          <View style={styles.topicBox}>
            <Text style={styles.topicLabel}>{t('thisWeeksTopic')}</Text>
            <Text style={styles.topicText}>
              {currentTopic
                ? (currentTopic.topic || currentTopic.title || t('weeklySafetyTopic'))
                : t('noTopicPostedYet')}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/weekly-safety-meeting')}
          >
            <Text style={styles.primaryButtonText}>
              {fullyCompliant ? t('openSafetySignIn') : t('signSafetyNow')}
            </Text>
          </TouchableOpacity>
        </View>

      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('safetyResources')}</Text>

        {manualUrl ? (
          <TouchableOpacity
            style={styles.manualResource}
            onPress={() => router.push({ pathname: '/safety-document-viewer', params: { title: t('safetyManual'), pdfUrl: manualUrl } })}
          >
            <Text style={styles.manualResourceText}>📖  {t('viewSafetyManual')}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.resourceTabsRow}>
          <TouchableOpacity
            style={styles.resourceTab}
            onPress={() => router.push('/safety-documents')}
          >
            <Text style={styles.resourceTabText}>{t('oshaPublications')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resourceTab}
            onPress={() => router.push('/osha-videos')}
          >
            <Text style={styles.resourceTabText}>{t('oshaVideos')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    backgroundColor: '#f7f8fa',
  },
  loadingWrap: {
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
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    marginBottom: 14,
  },
  statusCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
  },
  statusCardGreen: {
    backgroundColor: '#ecfdf3',
    borderColor: '#b7ebc6',
  },
  statusCardRed: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusDot: {
    fontSize: 20,
    marginRight: 8,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
  },
  statusText: {
    color: '#333',
    lineHeight: 21,
  },
  clockInWarningBox: {
    marginTop: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f5b5bd',
  },
  clockInWarningText: {
    color: '#8a1c2f',
    fontWeight: '700',
    lineHeight: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
    marginBottom: 12,
  },
  requirementCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e6e8ec',
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  requirementTextWrap: {
    flex: 1,
  },
  requirementTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111',
  },
  requirementSubtitle: {
    marginTop: 4,
    color: '#555',
    lineHeight: 20,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillComplete: {
    backgroundColor: '#dff6e6',
  },
  pillIncomplete: {
    backgroundColor: '#fde7e7',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#222',
  },
  topicBox: {
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  topicLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  topicText: {
    color: '#222',
    lineHeight: 20,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  manualResource: {
    backgroundColor: '#1f6feb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  manualResourceText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  resourceTabsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  resourceTab: {
    flex: 1,
    backgroundColor: '#1f6feb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  resourceTabText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});