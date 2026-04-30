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

const CONSTRUCTION_TYPES = ['commercial', 'residential', 'civil']
const PROJECT_STATUSES = ['planning', 'active', 'completed']

const PERMIT_FIELDS: { key: PermitKey; label: string }[] = [
  { key: 'permit_building',    label: 'Building' },
  { key: 'permit_electrical',  label: 'Electrical' },
  { key: 'permit_mechanical',  label: 'Mechanical' },
  { key: 'permit_plumbing',    label: 'Plumbing' },
  { key: 'permit_backflow',    label: 'Backflow' },
  { key: 'permit_civil',       label: 'Civil' },
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
        setErrorMessage('Invalid project.')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setErrorMessage('You must be signed in.'); return }

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
      setErrorMessage(e?.message || 'Failed to load project.')
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
      Alert.alert('Location set', result.placeName)
    } catch (e: any) {
      Alert.alert('Geocoding failed', e?.message || 'Could not find that address.')
    } finally {
      setGeocoding(false)
    }
  }

  async function save() {
    if (!project) return
    if (!project.name?.trim()) {
      Alert.alert('Missing name', 'Project name is required.')
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
        latitude: project.latitude,
        longitude: project.longitude,
        // Read radius from the dedicated input string (miles), convert at save time
        geofence_radius_meters:
          radiusInput === '' || radiusInput == null ? null : milesToMeters(radiusInput),
      }
      const { error } = await supabase.from('projects').update(payload).eq('id', projectId)
      if (error) throw error
      Alert.alert('Saved', 'Project updated.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Could not save project.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>Loading project...</Text>
      </SafeAreaView>
    )
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.red, fontWeight: '700', marginBottom: 10 }}>Error</Text>
        <Text style={{ color: COLORS.text, textAlign: 'center', marginBottom: 16 }}>{errorMessage}</Text>
        <Pressable onPress={() => router.back()} style={{ backgroundColor: COLORS.navy, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 }}>
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>Back</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (!isManager) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '800', marginBottom: 10 }}>Manager Only</Text>
        <Text style={{ color: COLORS.text, textAlign: 'center' }}>You do not have permission to edit this project.</Text>
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
              Edit Project
            </Text>
            <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
              Update project info, permits, and the jobsite location used for clock-in geofencing.
            </Text>
          </View>

          {/* Project Information */}
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, padding: 18, marginBottom: 16 }}>
            <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 17, marginBottom: 12 }}>
              Project Information
            </Text>

            <FieldLabel>Name *</FieldLabel>
            <TextField value={project.name || ''} onChangeText={t => setField('name', t)} placeholder="Project name" />

            <FieldLabel>Street Address</FieldLabel>
            <TextField value={project.address || ''} onChangeText={t => setField('address', t)} placeholder="123 Main St" />

            <FieldLabel>City</FieldLabel>
            <TextField value={project.city || ''} onChangeText={t => setField('city', t)} placeholder="Dallas" />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel>State</FieldLabel>
                <TextField value={project.state || ''} onChangeText={t => setField('state', t.toUpperCase())} placeholder="TX" />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel>Zip</FieldLabel>
                <TextField value={project.zip || ''} onChangeText={t => setField('zip', t)} placeholder="75201" keyboardType="numeric" />
              </View>
            </View>

            <FieldLabel>Description</FieldLabel>
            <TextField value={project.description || ''} onChangeText={t => setField('description', t)} placeholder="Scope, notes, etc." multiline />

            <FieldLabel>Status</FieldLabel>
            <View style={{
              backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
              borderRadius: 14, marginBottom: 14, overflow: 'hidden',
            }}>
              <Picker selectedValue={project.status || 'active'} onValueChange={v => setField('status', v)}>
                {PROJECT_STATUSES.map(s => (
                  <Picker.Item key={s} label={s.charAt(0).toUpperCase() + s.slice(1)} value={s} />
                ))}
              </Picker>
            </View>

            <FieldLabel>Construction Type</FieldLabel>
            <View style={{
              backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
              borderRadius: 14, marginBottom: 4, overflow: 'hidden',
            }}>
              <Picker selectedValue={project.construction_type || ''} onValueChange={v => setField('construction_type', v || null)}>
                <Picker.Item label="— Not set —" value="" />
                {CONSTRUCTION_TYPES.map(t => (
                  <Picker.Item key={t} label={t.charAt(0).toUpperCase() + t.slice(1)} value={t} />
                ))}
              </Picker>
            </View>
          </View>

          {/* Types of Work */}
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, padding: 18, marginBottom: 16 }}>
            <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 17, marginBottom: 12 }}>
              Types of Work
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {WORK_TYPES.map(t => {
                const active = (project.work_types || []).includes(t)
                return (
                  <Pressable
                    key={t}
                    onPress={() => toggleWorkType(t)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100,
                      backgroundColor: active ? COLORS.navy : COLORS.white,
                      borderWidth: 1, borderColor: active ? COLORS.navy : COLORS.border,
                    }}
                  >
                    <Text style={{ color: active ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 13 }}>
                      {t}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {/* Permit Numbers */}
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, padding: 18, marginBottom: 16 }}>
            <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 17, marginBottom: 12 }}>
              Permit Numbers
            </Text>
            {PERMIT_FIELDS.map(({ key, label }) => (
              <View key={key}>
                <FieldLabel>{label}</FieldLabel>
                <TextField
                  value={(project[key] || '') as string}
                  onChangeText={t => setField(key, t)}
                  placeholder="—"
                />
              </View>
            ))}
          </View>

          {/* Jobsite Location */}
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, padding: 18, marginBottom: 16 }}>
            <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 17, marginBottom: 6 }}>
              Jobsite Location
            </Text>
            <Text style={{ color: COLORS.subtext, fontSize: 13, marginBottom: 14, lineHeight: 18 }}>
              Used to detect off-site clock-ins. If a worker clocks in beyond the radius, they're prompted for a reason.
            </Text>

            <FieldLabel>Coordinates (from project address above)</FieldLabel>
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
                  {geocoding ? 'Geocoding…' : '📍 Geocode from address'}
                </Text>
              </Pressable>
              {project.latitude != null && project.longitude != null && (
                <Pressable
                  onPress={() => { setField('latitude', null); setField('longitude', null) }}
                  style={{
                    backgroundColor: '#FEF2F2', borderRadius: 14, paddingHorizontal: 16, justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: COLORS.red, fontWeight: '700' }}>Clear</Text>
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
                  : 'Not yet geocoded'}
              </Text>
            </View>

            <FieldLabel>Geofence radius (miles)</FieldLabel>
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
                {saving ? 'Saving…' : 'Save Changes'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              style={{ borderRadius: 18, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: COLORS.subtext, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
