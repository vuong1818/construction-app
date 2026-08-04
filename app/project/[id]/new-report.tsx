import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import DatePickerField from '../../../components/DatePickerField'
import { useNewReport } from '../../../hooks/useNewReport'
import { useLanguage } from '../../../lib/i18n'
import { COLORS } from '../../../lib/theme'
import { supabase } from '../../../lib/supabase'
import { pickAndUploadPhotos, reportUpload } from '../../../services/photoUpload'

function Field({
  label,
  value,
  onChangeText,
  multiline = false,
  required = false,
  placeholder,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  multiline?: boolean
  required?: boolean
  placeholder?: string
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 8 }}>
        {label} {required ? '*' : ''}
      </Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={COLORS.subtext}
        style={{
          backgroundColor: COLORS.card,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 12,
          minHeight: multiline ? 110 : 50,
          textAlignVertical: multiline ? 'top' : 'center',
          color: COLORS.text,
        }}
      />
    </View>
  )
}

export default function NewReportScreen() {
  const params = useLocalSearchParams<{
    id: string; reportId?: string; reportDate?: string;
    workCompleted?: string; issues?: string; materialsUsed?: string; weather?: string;
  }>()
  const router = useRouter()
  const projectId = Number(params.id)
  const { t } = useLanguage()

  // When a reportId is passed the screen edits that report (values seeded from params).
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)
  const reportId = one(params.reportId) ? Number(one(params.reportId)) : undefined
  const initial = reportId
    ? {
        reportDate: one(params.reportDate),
        workCompleted: one(params.workCompleted),
        issues: one(params.issues),
        materialsUsed: one(params.materialsUsed),
        weather: one(params.weather),
      }
    : undefined

  // Photos are staged locally until the report is saved, because a new report
  // has no id to attach them to yet. On save we upload them against the id the
  // hook hands back. Editing an existing report uploads straight away.
  const [staged, setStaged] = useState<ImagePicker.ImagePickerAsset[]>([])
  const [uploading, setUploading] = useState(false)

  async function addPhotos(from: 'camera' | 'library') {
    if (reportId) {
      setUploading(true)
      const { data: { user } } = await supabase.auth.getUser()
      const res = await pickAndUploadPhotos(from, {
        projectId, sourceTable: 'daily_reports', sourceId: reportId, folder: `reports/${reportId}`,
      }, user?.id ?? null)
      setUploading(false)
      reportUpload(res)
      return
    }
    // New report: just collect them.
    let result: ImagePicker.ImagePickerResult
    if (from === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) { Alert.alert('Camera access required', 'Enable camera access in Settings to take photos.'); return }
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) { Alert.alert('Photo access required', 'Enable photo access in Settings to attach photos.'); return }
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true })
    }
    if (result.canceled || !result.assets?.length) return
    setStaged(prev => [...prev, ...result.assets])
  }

  function pickSource() {
    Alert.alert('Add photos', 'Take a new photo or choose from your library.', [
      { text: 'Take Photo', onPress: () => addPhotos('camera') },
      { text: 'Choose from Library', onPress: () => addPhotos('library') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const {
    reportDate,
    workCompleted,
    issues,
    weather,
    saving,
    setReportDate,
    setWorkCompleted,
    setIssues,
    setWeather,
    handleSave,
    canSave,
  } = useNewReport({
    projectId: Number.isFinite(projectId) ? projectId : undefined,
    reportId,
    initial,
    // Upload anything staged now that the report has an id, then leave.
    onSaved: async (savedId?: number) => {
      if (staged.length && savedId) {
        setUploading(true)
        const { data: { user } } = await supabase.auth.getUser()
        let ok = 0
        const failures: string[] = []
        for (const asset of staged) {
          try {
            const ext = (asset.fileName?.split('.').pop() || asset.uri.split('.').pop() || 'jpg').toLowerCase()
            const filePath = `project-${projectId}/reports/${savedId}/report-${savedId}-${Date.now()}-${ok + failures.length}.${ext}`
            const resp = await fetch(asset.uri)
            if (!resp.ok) throw new Error('Could not read the photo file.')
            const buf = await resp.arrayBuffer()
            const { error: upErr } = await supabase.storage.from('project-photos')
              .upload(filePath, buf, { contentType: asset.mimeType || 'image/jpeg', upsert: false })
            if (upErr) throw new Error(upErr.message)
            const fileUrl = supabase.storage.from('project-photos').getPublicUrl(filePath).data.publicUrl
            const { error: dbErr } = await supabase.from('project_photos').insert({
              project_id: projectId, source_table: 'daily_reports', source_id: savedId,
              source: 'mobile', file_path: filePath, file_url: fileUrl, uploaded_by: user?.id ?? null,
            })
            if (dbErr) {
              await supabase.storage.from('project-photos').remove([filePath]).catch(() => {})
              throw new Error(dbErr.message)
            }
            ok++
          } catch (e: any) {
            failures.push(e?.message || 'Unknown error')
          }
        }
        setUploading(false)
        if (failures.length) {
          // Don't navigate away on a failed upload — the report saved, but the
          // crew needs to know the photos did not, while they can still retry.
          Alert.alert('Report saved, photos failed', `${ok} of ${staged.length} uploaded.

${failures[0]}`)
          setStaged([])
          return
        }
      }
      router.back()
    },
  })

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 8 }}>
              {`${t('date')} *`}
            </Text>
            <DatePickerField value={reportDate} onChange={setReportDate} />
          </View>

          <Field
            label={t('workCompleted')}
            value={workCompleted}
            onChangeText={setWorkCompleted}
            multiline
            required
            placeholder={t('workCompletedPlaceholder')}
          />

          <Field
            label={t('issuesDelays')}
            value={issues}
            onChangeText={setIssues}
            multiline
            placeholder={t('issuesPlaceholder')}
          />

          <Field
            label={t('weather')}
            value={weather}
            onChangeText={setWeather}
            multiline
            placeholder={t('weatherPlaceholder')}
          />

          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 8 }}>Photos</Text>
            <Pressable
              onPress={pickSource}
              disabled={uploading}
              style={{
                backgroundColor: COLORS.card,
                borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.border,
                borderRadius: 16, paddingVertical: 18, alignItems: 'center',
              }}
            >
              <Text style={{ color: COLORS.navy, fontWeight: '700' }}>
                {uploading ? 'Uploading…' : '+ Add Photos'}
              </Text>
              <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 4 }}>
                Take a photo or choose from your library
              </Text>
            </Pressable>

            {staged.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                {staged.map((a, i) => (
                  <Pressable
                    key={`${a.uri}-${i}`}
                    onLongPress={() => setStaged(prev => prev.filter((_, j) => j !== i))}
                    style={{ marginRight: 8 }}
                  >
                    <Image source={{ uri: a.uri }} style={{ width: 82, height: 82, borderRadius: 12 }} />
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {staged.length > 0 && (
              <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 6 }}>
                {staged.length} photo{staged.length === 1 ? '' : 's'} will upload when you save. Long-press one to remove it.
              </Text>
            )}
          </View>

          <Pressable
            onPress={handleSave}
            disabled={!canSave || uploading}
            style={{
              backgroundColor: canSave ? COLORS.navy : '#94A3B8',
              borderRadius: 18,
              paddingVertical: 16,
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 16 }}>
              {saving ? t('saving') : t('saveReport')}
            </Text>
          </Pressable>

          <Text
            style={{
              color: COLORS.subtext,
              marginTop: 12,
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            {t('requiredFieldsNote')}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
