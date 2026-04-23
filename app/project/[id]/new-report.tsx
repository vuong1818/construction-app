import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useNewReport } from '../../../hooks/useNewReport'

const COLORS = {
  background: '#F6F8FB',
  card: '#FFFFFF',
  navy: '#16356B',
  text: '#0F172A',
  border: '#E2E8F0',
  white: '#FFFFFF',
  subtext: '#64748B',
}

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
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const projectId = Number(id)

  const {
    reportDate,
    workCompleted,
    issues,
    materialsUsed,
    weather,
    saving,
    setReportDate,
    setWorkCompleted,
    setIssues,
    setMaterialsUsed,
    setWeather,
    handleSave,
    canSave,
  } = useNewReport({
    projectId: Number.isFinite(projectId) ? projectId : undefined,
    onSaved: () => router.back(),
  })

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Field
            label="Date"
            value={reportDate}
            onChangeText={setReportDate}
            required
            placeholder="YYYY-MM-DD"
          />

          <Field
            label="Work Completed"
            value={workCompleted}
            onChangeText={setWorkCompleted}
            multiline
            required
            placeholder="Describe work completed today"
          />

          <Field
            label="Issues / Delays"
            value={issues}
            onChangeText={setIssues}
            multiline
            placeholder="Describe any issues or delays"
          />

          <Field
            label="Materials Used"
            value={materialsUsed}
            onChangeText={setMaterialsUsed}
            multiline
            placeholder="List materials used"
          />

          <Field
            label="Weather"
            value={weather}
            onChangeText={setWeather}
            multiline
            placeholder="Describe weather conditions"
          />

          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={{
              backgroundColor: canSave ? COLORS.navy : '#94A3B8',
              borderRadius: 18,
              paddingVertical: 16,
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 16 }}>
              {saving ? 'Saving...' : 'Save Report'}
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
            Fields marked with * are required.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}