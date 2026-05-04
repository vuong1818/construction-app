import { Picker } from '@react-native-picker/picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { formatProjectAddress } from '../../../lib/formatAddress'
import { geocodeAddress, metersToMiles, milesToMeters } from '../../../lib/geocoding'
import { useLanguage, type TranslationKey } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'

const COLORS = {
  background: '#D6E8FF',
  card: '#FFFFFF',
  navy: '#16356B',
  teal: '#19B6D2',
  tealSoft: '#E7F9FC',
  navySoft: '#EAF0F8',
  red: '#EF4444',
  text: '#0F172A',
  subtext: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
}

// Match web/lib/inspections.js values exactly
const WORK_TYPES = [
  'Plumbing',
  'Electrical',
  'HVAC / Mechanical',
  'Backflow',
  'Building',
  'Construction Management',
  'Turn Key',
]

const CONSTRUCTION_TYPES: { value: string; key: TranslationKey }[] = [
  { value: 'commercial',  key: 'ctCommercial' },
  { value: 'residential', key: 'ctResidential' },
  { value: 'civil',       key: 'ctCivil' },
]
const PROJECT_STATUSES: { value: string; key: TranslationKey }[] = [
  { value: 'planning',  key: 'psPlanning' },
  { value: 'active',    key: 'psActive' },
  { value: 'completed', key: 'psCompleted' },
]

const PERMIT_FIELDS: { key: PermitKey; labelKey: TranslationKey }[] = [
  { key: 'permit_building',    labelKey: 'permitBuilding' },
  { key: 'permit_electrical',  labelKey: 'permitElectrical' },
  { key: 'permit_mechanical',  labelKey: 'permitMechanical' },
  { key: 'permit_plumbing',    labelKey: 'permitPlumbing' },
  { key: 'permit_backflow',    labelKey: 'permitBackflow' },
  { key: 'permit_civil',       labelKey: 'permitCivil' },
]

type PermitKey =
  | 'permit_building'
  | 'permit_electrical'
  | 'permit_mechanical'
  | 'permit_plumbing'
  | 'permit_backflow'
  | 'permit_civil'

type ProjectRow = {
  id: number
  name: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  description: string | null
  status: string | null
  construction_type: string | null
  work_types: string[] | null
  latitude: number | null
  longitude: number | null
  geofence_radius_meters: number | null
  owner_name: string | null
  owner_company: string | null
  owner_address: string | null
} & Record<PermitKey, string | null>

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 6, marginTop: 4 }}>
      {children}
    </Text>
  )
}

function TextField({
  value, onChangeText, placeholder, multiline, keyboardType,
}: {
  value: string
  onChangeText: (t: string) => void
  placeholder?: string
  multiline?: boolean
  keyboardType?: 'default' | 'numeric' | 'email-address'
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={COLORS.subtext}
      multiline={multiline}
      keyboardType={keyboardType || 'default'}
      autoCapitalize={multiline ? 'sentences' : 'words'}
      style={{
        backgroundColor: COLORS.white,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: COLORS.text,
        marginBottom: 14,
        minHeight: multiline ? 90 : undefined,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  )
}

export default function ProjectEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const projectId = Number(id)
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isManager, setIsManager] = useState(false)
  const [project, setProject] = useState<ProjectRow | null>(null)
  // Separate string state for the radius input — avoids the miles<->meters
  // round-trip rounding that breaks free-form typing.
  const [radiusInput, setRadiusInput] = useState('0.50')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setErrorMessage('')

    try {
      if (!Number.isFinite(projectId)) {
        setErrorMessage(t('invalidProject'))
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setErrorMessage(t('mustBeSignedIn')); return }

      const { data: me } = await supabase
        .from('profiles').select('role').eq('id', session.user.id).single()
      const manager = (me?.role || 'worker') === 'manager'
      setIsManager(manager)
      if (!manager) return

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()
      if (error) { setErrorMessage(error.message); return }
      const row = data as ProjectRow
      setProject(row)
      // Initialize radius input from the loaded value (or default 0.5 mi if unset)
      setRadiusInput(
        row.geofence_radius_meters != null
          ? (metersToMiles(row.geofence_radius_meters) ?? 0.5).toFixed(2)
          : '0.50'
      )
    } catch (e: any) {
      setErrorMessage(e?.message || t('failedToLoadProject'))
    } finally {
      setLoading(false)
    }
  }

  function setField<K extends keyof ProjectRow>(key: K, value: ProjectRow[K]) {
    setProject(prev => (prev ? { ...prev, [key]: value } : prev))
  }

  function toggleWorkType(t: string) {
    if (!project) return
    const current = project.work_types || []
    const next = current.includes(t) ? current.filter(x => x !== t) : [...current, t]
    setField('work_types', next)
  }

  async function handleGeocode() {
    if (!project || geocoding) return
    setGeocoding(true)
    try {
      // Geocode against the full address (street + city + state + zip)
      const result = await geocodeAddress(formatProjectAddress(project))
      setProject(prev => prev ? { ...prev, latitude: result.lat, longitude: result.lng } : prev)
      // If radius wasn't set, default the input to 0.5 mi
      if (!radiusInput || radiusInput === '') setRadiusInput('0.50')
      Alert.alert(t('locationSet'), result.placeName)
    } catch (e: any) {
      Alert.alert(t('geocodingFailed'), e?.message || t('couldNotFindAddress'))
    } finally {
      setGeocoding(false)
    }
  }

  async function save() {
    if (!project) return
    if (!project.name?.trim()) {
      Alert.alert(t('missingName'), t('projectNameRequired'))
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: project.name.trim(),
        address: project.address?.trim() || null,
        city:    project.city?.trim()    || null,
        state:   project.state?.trim()   || null,
        zip:     project.zip?.trim()     || null,
        description: project.description?.trim() || null,
        status: project.status || 'active',
        construction_type: project.construction_type || null,
        work_types: project.work_types || [],
        permit_building: project.permit_building?.trim() || null,
        permit_electrical: project.permit_electrical?.trim() || null,
        permit_mechanical: project.permit_mechanical?.trim() || null,
        permit_plumbing: project.permit_plumbing?.trim() || null,
        permit_backflow: project.permit_backflow?.trim() || null,
        permit_civil: project.permit_civil?.trim() || null,
        owner_name:    project.owner_name?.trim()    || null,
        owner_company: project.owner_company?.trim() || null,
        owner_address: project.owner_address?.trim() || null,
        latitude: project.latitude,
        longitude: project.longitude,
        // Read radius from the dedicated input string (miles), convert at save time
        geofence_radius_meters:
          radiusInput === '' || radiusInput == null ? null : milesToMeters(radiusInput),
      }
      const { error } = await supabase.from('projects').update(payload).eq('id', projectId)
      if (error) throw error
      Alert.alert(t('saved'), t('projectUpdated'), [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (e: any) {
      Alert.alert(t('saveFailed'), e?.message || t('couldNotSaveProject'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>{t('loadingProject')}</Text>
      </SafeAreaView>
    )
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.red, fontWeight: '700', marginBottom: 10 }}>{t('error')}</Text>
        <Text style={{ color: COLORS.text, textAlign: 'center', marginBottom: 16 }}>{errorMessage}</Text>
        <Pressable onPress={() => router.back()} style={{ backgroundColor: COLORS.navy, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 }}>
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>{t('back')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (!isManager) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '800', marginBottom: 10 }}>{t('managerOnly')}</Text>
        <Text style={{ color: COLORS.text, textAlign: 'center' }}>{t('noPermissionEditProject')}</Text>
      </SafeAreaView>
    )
  }

  if (!project) return null

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          {/* Header */}
          <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
            <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '800', marginBottom: 6 }}>
              {t('editProject')}
            </Text>
            <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
              {t('editProjectIntro')}
            </Text>
          </View>

          {/* Project Information */}
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, padding: 18, marginBottom: 16 }}>
            <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 17, marginBottom: 12 }}>
              {t('projectInformation')}
            </Text>

            <FieldLabel>{`${t('projectName')} *`}</FieldLabel>
            <TextField value={project.name || ''} onChangeText={v => setField('name', v)} placeholder={t('projectNamePlaceholder')} />

            <FieldLabel>{t('streetAddress')}</FieldLabel>
            <TextField value={project.address || ''} onChangeText={v => setField('address', v)} placeholder={t('streetAddressPlaceholder')} />

            <FieldLabel>{t('cityLabel')}</FieldLabel>
            <TextField value={project.city || ''} onChangeText={v => setField('city', v)} placeholder={t('cityPlaceholder')} />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel>{t('stateLabel')}</FieldLabel>
                <TextField value={project.state || ''} onChangeText={v => setField('state', v.toUpperCase())} placeholder={t('statePlaceholder')} />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel>{t('zip')}</FieldLabel>
                <TextField value={project.zip || ''} onChangeText={v => setField('zip', v)} placeholder={t('zipPlaceholder')} keyboardType="numeric" />
              </View>
            </View>

            <FieldLabel>{t('descriptionLabel')}</FieldLabel>
            <TextField value={project.description || ''} onChangeText={v => setField('description', v)} placeholder={t('descriptionPlaceholder')} multiline />

            <FieldLabel>{t('status')}</FieldLabel>
            <View style={{
              backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
              borderRadius: 14, marginBottom: 14, overflow: 'hidden',
            }}>
              <Picker
                selectedValue={project.status || 'active'}
                onValueChange={v => setField('status', v)}
                itemStyle={Platform.OS === 'ios' ? { color: COLORS.text, fontSize: 18 } : undefined}
                style={{ color: COLORS.text, backgroundColor: COLORS.white }}
              >
                {PROJECT_STATUSES.map(s => (
                  <Picker.Item key={s.value} label={t(s.key)} value={s.value} color={COLORS.text} />
                ))}
              </Picker>
            </View>

            <FieldLabel>{t('constructionType')}</FieldLabel>
            <View style={{
              backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
              borderRadius: 14, marginBottom: 4, overflow: 'hidden',
            }}>
              <Picker
                selectedValue={project.construction_type || ''}
                onValueChange={v => setField('construction_type', v || null)}
                itemStyle={Platform.OS === 'ios' ? { color: COLORS.text, fontSize: 18 } : undefined}
                style={{ color: COLORS.text, backgroundColor: COLORS.white }}
              >
                <Picker.Item label={t('notSet')} value="" color={COLORS.text} />
                {CONSTRUCTION_TYPES.map(c => (
                  <Picker.Item key={c.value} label={t(c.key)} value={c.value} color={COLORS.text} />
                ))}
              </Picker>
            </View>
          </View>

          {/* Types of Work */}
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, padding: 18, marginBottom: 16 }}>
            <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 17, marginBottom: 12 }}>
              {t('typesOfWork')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {WORK_TYPES.map(workType => {
                const active = (project.work_types || []).includes(workType)
                return (
                  <Pressable
                    key={workType}
                    onPress={() => toggleWorkType(workType)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100,
                      backgroundColor: active ? COLORS.navy : COLORS.white,
                      borderWidth: 1, borderColor: active ? COLORS.navy : COLORS.border,
                    }}
                  >
                    <Text style={{ color: active ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 13 }}>
                      {workType}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {/* Owner Information */}
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, padding: 18, marginBottom: 16 }}>
            <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 17, marginBottom: 4 }}>
              {t('ownerInformation')}
            </Text>
            <Text style={{ color: COLORS.subtext, fontSize: 12, marginBottom: 12, lineHeight: 17 }}>
              {t('ownerInfoIntro')}
            </Text>
            <FieldLabel>{t('ownerName')}</FieldLabel>
            <TextField value={project.owner_name || ''} onChangeText={v => setField('owner_name', v)} />
            <FieldLabel>{t('ownerCompany')}</FieldLabel>
            <TextField value={project.owner_company || ''} onChangeText={v => setField('owner_company', v)} />
            <FieldLabel>{t('ownerAddress')}</FieldLabel>
            <TextField value={project.owner_address || ''} onChangeText={v => setField('owner_address', v)} multiline placeholder={t('ownerAddressPlaceholder')} />
          </View>

          {/* Permit Numbers */}
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, padding: 18, marginBottom: 16 }}>
            <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 17, marginBottom: 12 }}>
              {t('permitNumbers')}
            </Text>
            {PERMIT_FIELDS.map(({ key, labelKey }) => (
              <View key={key}>
                <FieldLabel>{t(labelKey)}</FieldLabel>
                <TextField
                  value={(project[key] || '') as string}
                  onChangeText={v => setField(key, v)}
                  placeholder="—"
                />
              </View>
            ))}
          </View>

          {/* Jobsite Location */}
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, padding: 18, marginBottom: 16 }}>
            <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 17, marginBottom: 6 }}>
              {t('jobsiteLocation')}
            </Text>
            <Text style={{ color: COLORS.subtext, fontSize: 13, marginBottom: 14, lineHeight: 18 }}>
              {t('jobsiteIntro')}
            </Text>

            <FieldLabel>{t('coordinatesFromAddress')}</FieldLabel>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <Pressable
                onPress={handleGeocode}
                disabled={geocoding || !formatProjectAddress(project).trim()}
                style={{
                  flex: 1,
                  backgroundColor: geocoding || !formatProjectAddress(project).trim() ? '#94A3B8' : COLORS.teal,
                  borderRadius: 14, paddingVertical: 12, alignItems: 'center',
                }}
              >
                <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 14 }}>
                  {geocoding ? t('geocodingEllipsis') : t('geocodeFromAddress')}
                </Text>
              </Pressable>
              {project.latitude != null && project.longitude != null && (
                <Pressable
                  onPress={() => { setField('latitude', null); setField('longitude', null) }}
                  style={{
                    backgroundColor: '#FEF2F2', borderRadius: 14, paddingHorizontal: 16, justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: COLORS.red, fontWeight: '700' }}>{t('clear')}</Text>
                </Pressable>
              )}
            </View>
            <View style={{ backgroundColor: COLORS.background, borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <Text style={{
                color: project.latitude != null ? COLORS.text : COLORS.subtext,
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                fontSize: 13,
              }}>
                {project.latitude != null && project.longitude != null
                  ? `${project.latitude.toFixed(6)}, ${project.longitude.toFixed(6)}`
                  : t('notYetGeocoded')}
              </Text>
            </View>

            <FieldLabel>{t('geofenceRadius')}</FieldLabel>
            <TextField
              value={radiusInput}
              onChangeText={setRadiusInput}
              placeholder="0.50"
              keyboardType="numeric"
            />
          </View>

          {/* Save / Cancel */}
          <View style={{ gap: 10 }}>
            <Pressable
              onPress={save}
              disabled={saving}
              style={{
                backgroundColor: saving ? '#94A3B8' : COLORS.navy,
                borderRadius: 18, paddingVertical: 16, alignItems: 'center',
              }}
            >
              <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 16 }}>
                {saving ? t('saving') : t('saveChanges')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              style={{ borderRadius: 18, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: COLORS.subtext, fontWeight: '700', fontSize: 15 }}>{t('cancel')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
