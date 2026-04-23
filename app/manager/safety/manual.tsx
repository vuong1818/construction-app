import { Picker } from '@react-native-picker/picker'
import { decode as atob } from 'base-64'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  
  ScrollView,
  Text,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { supabase } from '../../../lib/supabase'

const COLORS = {
  background: '#D6E8FF',
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

type ManualAckRow = {
  id: number
  worker_id: string
  week_start: string
  signed_name: string | null
  signed_at: string
  signature_text: string | null
  pdf_url: string | null
}

type SafetyDocument = {
  id: number
  document_type: string
  title: string
  file_url: string | null
  storage_path: string | null
  is_active: boolean
}

function getCurrentWorkWeekRange(baseDate = new Date()) {
  const now = new Date()
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

async function uploadPdfToSafetyDocuments(uri: string, storagePath: string) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }

  const byteArray = new Uint8Array(byteNumbers)

  const { error } = await supabase.storage
    .from('safety-documents')
    .upload(storagePath, byteArray, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (error) {
    throw new Error(error.message)
  }

  const { data } = supabase.storage
    .from('safety-documents')
    .getPublicUrl(storagePath)

  return {
    publicUrl: data.publicUrl,
    storagePath,
  }
}

export default function ManagerSafetyManualScreen() {
  const weekOptions = useMemo(() => buildWeekOptions(16), [])
  const [selectedWeekKey, setSelectedWeekKey] = useState(weekOptions[0]?.key || '')
  const [userRole, setUserRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [rows, setRows] = useState<ManualAckRow[]>([])
  const [manualDoc, setManualDoc] = useState<SafetyDocument | null>(null)
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
        return
      }

      const weekStartStr = weekStartDateString(weekStart)

      const [docResult, rowsResult] = await Promise.all([
        supabase
          .from('safety_documents')
          .select('id, document_type, title, file_url, storage_path, is_active')
          .eq('document_type', 'company_safety_manual')
          .eq('is_active', true)
          .maybeSingle(),

        supabase
          .from('safety_manual_acknowledgements')
          .select('id, worker_id, week_start, signed_name, signed_at, signature_text, pdf_url')
          .eq('week_start', weekStartStr)
          .order('signed_at', { ascending: true }),
      ])

      if (docResult.error) {
        setErrorMessage(docResult.error.message)
        return
      }

      if (rowsResult.error) {
        setErrorMessage(rowsResult.error.message)
        return
      }

      setManualDoc(docResult.data || null)
      setRows(rowsResult.data || [])
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to load safety manual acknowledgements.')
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

  async function handleUploadManual() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      })

      if (result.canceled || !result.assets?.length) {
        return
      }

      const asset = result.assets[0]
      if (!asset.uri) {
        Alert.alert('Upload Error', 'No file selected.')
        return
      }

      setUploading(true)

      const storagePath = 'company-safety-manual/current-manual.pdf'
      const uploaded = await uploadPdfToSafetyDocuments(asset.uri, storagePath)

      await supabase
        .from('safety_documents')
        .update({ is_active: false })
        .eq('document_type', 'company_safety_manual')

      const title =
        asset.name?.replace(/\.pdf$/i, '') || 'Construction Safety Manual'

      const { error } = await supabase
        .from('safety_documents')
        .insert({
          document_type: 'company_safety_manual',
          title,
          file_url: uploaded.publicUrl,
          storage_path: storagePath,
          is_active: true,
        })

      if (error) {
        Alert.alert('Database Error', error.message)
        return
      }

      Alert.alert('Success', 'Active safety manual updated.')
      await loadScreen(selectedWeek.start)
    } catch (error: any) {
      Alert.alert('Upload Error', error?.message || 'Could not upload safety manual.')
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}
      >
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>
          Loading safety manual acknowledgements...
        </Text>
      </SafeAreaView>
    )
  }

  if (errorMessage) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}
      >
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
      <SafeAreaView
        style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}
      >
        <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '800', marginBottom: 10 }}>
          Manager Only
        </Text>
        <Text style={{ color: COLORS.text, textAlign: 'center' }}>
          You do not have permission to view safety manual acknowledgements.
        </Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View
          style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}
        >
          <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800', marginBottom: 6 }}>
            Safety Manual Acknowledgements
          </Text>

          <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
            Manage the active company safety manual and review weekly acknowledgements.
          </Text>
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
            Active Safety Manual
          </Text>

          <Text style={{ color: COLORS.text, lineHeight: 22, marginBottom: 12 }}>
            {manualDoc?.title || 'No active company safety manual configured.'}
          </Text>

          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => openPreview(manualDoc?.file_url || null, manualDoc?.title || 'Safety Manual')}
                disabled={!manualDoc?.file_url}
                style={{
                  flex: 1,
                  backgroundColor: manualDoc?.file_url ? COLORS.navy : '#CBD5E1',
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: COLORS.white, fontWeight: '800' }}>
                  Preview Manual
                </Text>
              </Pressable>

              <Pressable
                onPress={() =>
                  handleDownload(
                    manualDoc?.file_url || null,
                    'company-safety-manual.pdf'
                  )
                }
                disabled={!manualDoc?.file_url}
                style={{
                  flex: 1,
                  backgroundColor: manualDoc?.file_url ? COLORS.teal : '#CBD5E1',
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: COLORS.white, fontWeight: '800' }}>
                  Download Manual
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleUploadManual}
              disabled={uploading}
              style={{
                backgroundColor: uploading ? '#94A3B8' : COLORS.navy,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: COLORS.white, fontWeight: '800' }}>
                {uploading ? 'Uploading...' : manualDoc ? 'Replace Active Manual' : 'Upload Active Manual'}
              </Text>
            </Pressable>
          </View>
        </View>

        <Text style={{ color: COLORS.navy, fontSize: 18, fontWeight: '800', marginBottom: 10 }}>
          Work Week
        </Text>

        <View
          style={{
            backgroundColor: COLORS.card,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            overflow: 'hidden',
            marginBottom: 18,
          }}
        >
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

        {rows.length === 0 ? (
          <View
            style={{
              backgroundColor: COLORS.card,
              borderRadius: 20,
              padding: 18,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, textAlign: 'center' }}>
              No safety manual acknowledgements found for this work week.
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

              <Text style={{ color: COLORS.subtext, marginBottom: 12 }}>
                Week Start: {row.week_start}
              </Text>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => openPreview(row.pdf_url, `${row.signed_name || 'Worker'} Manual PDF`)}
                  disabled={!row.pdf_url}
                  style={{
                    flex: 1,
                    backgroundColor: row.pdf_url ? COLORS.navy : '#CBD5E1',
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
                      row.pdf_url,
                      `safety-manual-${row.week_start}-${(row.signed_name || 'worker')
                        .replace(/\s+/g, '-')
                        .toLowerCase()}.pdf`
                    )
                  }
                  disabled={!row.pdf_url}
                  style={{
                    flex: 1,
                    backgroundColor: row.pdf_url ? COLORS.teal : '#CBD5E1',
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

          {previewUrl ? <WebView source={{ uri: previewUrl }} style={{ flex: 1 }} /> : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}