import { Picker } from '@react-native-picker/picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View
} from 'react-native'
import { WebView } from 'react-native-webview'
import { supabase } from '../../../lib/supabase'

const COLORS = {
  background: '#F6F8FB',
  card: '#FFFFFF',
  navy: '#16356B',
  teal: '#19B6D2',
  red: '#EF4444',
  text: '#0F172A',
  subtext: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
}

type WeekOption = {
  key: string
  label: string
  start: Date
  end: Date
}

type WeeklySafetyTopic = {
  id: number
  week_start: string
  topic: string
  created_by: string | null
  created_at: string
  updated_at: string
  pdf_url: string | null
}

type MeetingAckRow = {
  id: number
  worker_id: string
  week_start: string
  topic_id: number | null
  signed_name: string | null
  signed_at: string
  signature_text: string | null
}

function getCurrentWorkWeekRange(baseDate = new Date()) {
  const now = new Date(baseDate)
  const currentDay = now.getDay()
  const daysSinceFriday = (currentDay - 5 + 7) % 7

  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - daysSinceFriday)
  weekStart.setHours(0, 0, 0, 0)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  return { weekStart, weekEnd }
}

function buildWeekOptions(count = 16): WeekOption[] {
  const { weekStart: currentStart } = getCurrentWorkWeekRange()
  const options: WeekOption[] = []

  for (let i = 0; i < count; i++) {
    const start = new Date(currentStart)
    start.setDate(currentStart.getDate() - i * 7)
    start.setHours(0, 0, 0, 0)

    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)

    options.push({
      key: start.toISOString(),
      label: `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`,
      start,
      end,
    })
  }

  return options
}

function weekStartDateString(date: Date) {
  return date.toISOString().split('T')[0]
}

function formatSignedAt(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function getPreviewUrl(pdfUrl: string) {
  return pdfUrl
}

async function downloadAndSharePdf(pdfUrl: string, fileName: string) {
  const target = `${FileSystem.cacheDirectory}${fileName}`
  const result = await FileSystem.downloadAsync(pdfUrl, target)

  const available = await Sharing.isAvailableAsync()
  if (available) {
    await Sharing.shareAsync(result.uri)
    return
  }

  Alert.alert('Download Complete', `Saved to: ${result.uri}`)
}

export default function ManagerSafetyMeetingScreen() {
  const weekOptions = useMemo(() => buildWeekOptions(16), [])
  const [selectedWeekKey, setSelectedWeekKey] = useState(weekOptions[0]?.key || '')
  const [userRole, setUserRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [topicRow, setTopicRow] = useState<WeeklySafetyTopic | null>(null)
  const [rows, setRows] = useState<MeetingAckRow[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState('PDF Preview')

  const selectedWeek =
    weekOptions.find((option) => option.key === selectedWeekKey) || weekOptions[0]

  useEffect(() => {
    if (selectedWeek) {
      loadScreen(selectedWeek.start)
    }
  }, [selectedWeekKey])

  async function loadScreen(weekStart: Date) {
    setLoading(true)
    setErrorMessage('')

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        setErrorMessage('You must be signed in.')
        return
      }

      const { data: me, error: meError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (meError) {
        setErrorMessage(meError.message)
        return
      }

      const role = me?.role || 'worker'
      setUserRole(role)

      if (role !== 'manager') {
        setRows([])
        setTopicRow(null)
        return
      }

      const weekStartStr = weekStartDateString(weekStart)

      const [topicResult, rowsResult] = await Promise.all([
        supabase
          .from('weekly_safety_topics')
          .select('id, week_start, topic, created_by, created_at, updated_at, pdf_url')
          .eq('week_start', weekStartStr)
          .maybeSingle(),

        supabase
          .from('weekly_meeting_acknowledgements')
          .select('id, worker_id, week_start, topic_id, signed_name, signed_at, signature_text')
          .eq('week_start', weekStartStr)
          .order('signed_at', { ascending: true }),
      ])

      if (topicResult.error) {
        setErrorMessage(topicResult.error.message)
        return
      }

      if (rowsResult.error) {
        setErrorMessage(rowsResult.error.message)
        return
      }

      setTopicRow(topicResult.data || null)
      setRows(rowsResult.data || [])
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to load weekly meeting acknowledgements.')
    } finally {
      setLoading(false)
    }
  }

  function openPreview(url: string | null, title: string) {
    if (!url) return
    setPreviewTitle(title)
    setPreviewUrl(getPreviewUrl(url))
  }

  async function handleDownload(url: string | null, fileName: string) {
    if (!url) return
    try {
      await downloadAndSharePdf(url, fileName)
    } catch (error: any) {
      Alert.alert('Download Error', error?.message || 'Could not download PDF.')
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>
          Loading weekly meeting acknowledgements...
        </Text>
      </SafeAreaView>
    )
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ color: COLORS.red, fontWeight: '700', marginBottom: 10 }}>
          Error
        </Text>
        <Text style={{ color: COLORS.text, textAlign: 'center' }}>
          {errorMessage}
        </Text>
      </SafeAreaView>
    )
  }

  if (userRole !== 'manager') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '800', marginBottom: 10 }}>
          Manager Only
        </Text>
        <Text style={{ color: COLORS.text, textAlign: 'center' }}>
          You do not have permission to view weekly meeting acknowledgements.
        </Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
          <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800', marginBottom: 6 }}>
            Weekly Meeting Acknowledgements
          </Text>

          <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
            Select a work week to review the weekly safety topic and meeting sign-ins.
          </Text>
        </View>

        <Text style={{ color: COLORS.navy, fontSize: 18, fontWeight: '800', marginBottom: 10 }}>
          Work Week
        </Text>

        <View style={{ backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', marginBottom: 18 }}>
          <Picker
            selectedValue={selectedWeekKey}
            onValueChange={(value) => setSelectedWeekKey(String(value))}
            style={{ color: COLORS.text, backgroundColor: COLORS.card }}
          >
            {weekOptions.map((option) => (
              <Picker.Item
                key={option.key}
                label={option.label}
                value={option.key}
                color={COLORS.text}
              />
            ))}
          </Picker>
        </View>

        <View
          style={{
            backgroundColor: COLORS.card,
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: COLORS.border,
            marginBottom: 18,
          }}
        >
          <Text style={{ color: COLORS.navy, fontSize: 20, fontWeight: '800', marginBottom: 8 }}>
            Weekly Topic
          </Text>

          <Text style={{ color: COLORS.text, lineHeight: 22, marginBottom: 12 }}>
            {topicRow?.topic || 'No weekly safety topic entered for this work week.'}
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => openPreview(topicRow?.pdf_url || null, 'Weekly Meeting PDF')}
              disabled={!topicRow?.pdf_url}
              style={{
                flex: 1,
                backgroundColor: topicRow?.pdf_url ? COLORS.navy : '#CBD5E1',
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: COLORS.white, fontWeight: '800' }}>
                Preview PDF
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                handleDownload(
                  topicRow?.pdf_url || null,
                  `weekly-meeting-${topicRow?.week_start || 'week'}.pdf`
                )
              }
              disabled={!topicRow?.pdf_url}
              style={{
                flex: 1,
                backgroundColor: topicRow?.pdf_url ? COLORS.teal : '#CBD5E1',
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: COLORS.white, fontWeight: '800' }}>
                Download PDF
              </Text>
            </Pressable>
          </View>
        </View>

        {rows.length === 0 ? (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ color: COLORS.text, textAlign: 'center' }}>
              No weekly meeting sign-ins found for this work week.
            </Text>
          </View>
        ) : (
          rows.map((row) => (
            <View
              key={row.id}
              style={{
                backgroundColor: COLORS.card,
                borderRadius: 20,
                padding: 16,
                borderWidth: 1,
                borderColor: COLORS.border,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: COLORS.navy, fontSize: 18, fontWeight: '800', marginBottom: 6 }}>
                {row.signed_name || 'Unknown Worker'}
              </Text>

              <Text style={{ color: COLORS.text, marginBottom: 4 }}>
                Signed At: {formatSignedAt(row.signed_at)}
              </Text>

              <Text style={{ color: COLORS.subtext }}>
                Week Start: {row.week_start}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={!!previewUrl} animationType="slide" onRequestClose={() => setPreviewUrl(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottomWidth: 1,
              borderBottomColor: COLORS.border,
              backgroundColor: COLORS.card,
            }}
          >
            <Text style={{ color: COLORS.navy, fontSize: 18, fontWeight: '800', flex: 1, paddingRight: 12 }}>
              {previewTitle}
            </Text>

            <Pressable onPress={() => setPreviewUrl(null)}>
              <Text style={{ color: COLORS.navy, fontWeight: '800' }}>Close</Text>
            </Pressable>
          </View>

          {previewUrl ? (
            <WebView source={{ uri: previewUrl }} style={{ flex: 1 }} />
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}