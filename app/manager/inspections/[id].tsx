import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRealtimeRefetch } from '../../../hooks/useRealtimeRefetch'
import {
  CIVIL_INSPECTIONS,
  COMMERCIAL_RESIDENTIAL_INSPECTIONS,
  InspectionStatus,
  STATUS_CONFIG,
  STATUS_ORDER,
  totalItems,
} from '../../../lib/inspections'
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

type Project = {
  id: number
  name: string
  construction_type: string | null
}

type InspectionRow = {
  project_id: number
  inspection_key: string
  status: InspectionStatus
  inspection_date: string | null
  notes: string | null
  updated_at?: string | null
}

type EditingItem = {
  itemKey: string
  itemLabel: string
  status: InspectionStatus
  date: string
  notes: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default function ProjectInspectionsScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const projectId = Number(id)

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [userRole, setUserRole] = useState('')
  const [project, setProject] = useState<Project | null>(null)
  const [records, setRecords] = useState<Record<string, InspectionRow>>({})

  const [editing, setEditing] = useState<EditingItem | null>(null)
  const [saving, setSaving] = useState(false)

  const inspList = useMemo(() => {
    return project?.construction_type === 'civil'
      ? CIVIL_INSPECTIONS
      : COMMERCIAL_RESIDENTIAL_INSPECTIONS
  }, [project?.construction_type])

  const total = useMemo(() => totalItems(inspList), [inspList])

  const counts = useMemo(() => {
    const c: Record<InspectionStatus, number> = { not_yet: 0, partial: 0, failed: 0, passed: 0 }
    for (const key of Object.keys(records)) {
      const s = records[key].status
      if (s in c) c[s] += 1
    }
    return c
  }, [records])

  useEffect(() => {
    if (!Number.isFinite(projectId)) {
      setErrorMessage('Invalid project.')
      setLoading(false)
      return
    }
    load()
  }, [projectId])

  // Live updates from web or other managers editing this project's inspections
  useRealtimeRefetch(
    'project_inspections',
    load,
    Number.isFinite(projectId) ? `project_id=eq.${projectId}` : undefined,
    Number.isFinite(projectId),
  )

  async function load() {
    setLoading(true)
    setErrorMessage('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setErrorMessage('You must be signed in.'); return }

      const { data: me } = await supabase
        .from('profiles').select('role').eq('id', session.user.id).single()
      const role = me?.role || 'worker'
      setUserRole(role)
      if (role !== 'manager') return

      const [{ data: proj, error: pErr }, { data: insp, error: iErr }] = await Promise.all([
        supabase.from('projects')
          .select('id, name, construction_type')
          .eq('id', projectId)
          .single(),
        supabase.from('project_inspections')
          .select('project_id, inspection_key, status, inspection_date, notes, updated_at')
          .eq('project_id', projectId),
      ])

      if (pErr) { setErrorMessage(pErr.message); return }
      if (iErr) { setErrorMessage(iErr.message); return }

      setProject(proj as Project)

      const map: Record<string, InspectionRow> = {}
      for (const r of (insp || []) as InspectionRow[]) {
        map[r.inspection_key] = r
      }
      setRecords(map)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to load inspections.')
    } finally {
      setLoading(false)
    }
  }

  function openEdit(itemKey: string, itemLabel: string) {
    const existing = records[itemKey]
    setEditing({
      itemKey,
      itemLabel,
      status: existing?.status || 'not_yet',
      date: existing?.inspection_date || '',
      notes: existing?.notes || '',
    })
  }

  function clearNote() {
    if (!editing) return
    setEditing({ ...editing, notes: '' })
  }

  async function saveItem() {
    if (!editing) return
    if (editing.date && !DATE_RE.test(editing.date)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD format, or leave blank.')
      return
    }

    setSaving(true)
    const payload = {
      project_id: projectId,
      inspection_key: editing.itemKey,
      status: editing.status,
      inspection_date: editing.date.trim() || null,
      notes: editing.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('project_inspections')
      .upsert(payload, { onConflict: 'project_id,inspection_key' })

    setSaving(false)

    if (error) {
      Alert.alert('Save failed', error.message)
      return
    }

    setRecords(prev => ({ ...prev, [editing.itemKey]: { ...payload } as InspectionRow }))
    setEditing(null)
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>Loading inspections...</Text>
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

  if (userRole !== 'manager') {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '800', marginBottom: 10 }}>Manager Only</Text>
        <Text style={{ color: COLORS.text, textAlign: 'center' }}>You do not have permission to manage inspections.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
          <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '800', marginBottom: 6 }}>
            {project?.name || 'Project'}
          </Text>
          <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
            {counts.passed} of {total} inspections passed
          </Text>
        </View>

        {/* Status summary chips */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
          {STATUS_ORDER.map(s => {
            const cfg = STATUS_CONFIG[s]
            return (
              <View key={s} style={{ flex: 1, backgroundColor: cfg.bg, borderRadius: 14, padding: 12, alignItems: 'center' }}>
                <Text style={{ color: cfg.color, fontWeight: '900', fontSize: 22, lineHeight: 26 }}>{counts[s]}</Text>
                <Text style={{ color: cfg.color, fontWeight: '700', fontSize: 11, marginTop: 4 }}>{cfg.label}</Text>
              </View>
            )
          })}
        </View>

        {/* Categories */}
        {inspList.map(cat => (
          <View key={cat.category} style={{
            backgroundColor: COLORS.card,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: COLORS.border,
            marginBottom: 16,
            overflow: 'hidden',
          }}>
            <View style={{ padding: 14, backgroundColor: COLORS.navySoft }}>
              <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 16 }}>
                {cat.icon}  {cat.category}
              </Text>
            </View>

            {cat.sections.map(sec => (
              <View key={sec.phase}>
                <Text style={{
                  color: COLORS.subtext,
                  fontWeight: '700',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  paddingHorizontal: 14,
                  paddingTop: 12,
                  paddingBottom: 6,
                }}>
                  {sec.phase}
                </Text>

                {sec.items.map(item => {
                  const rec = records[item.key]
                  const status: InspectionStatus = rec?.status || 'not_yet'
                  const cfg = STATUS_CONFIG[status]
                  const hasNote = !!(rec?.notes && rec.notes.trim())
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => openEdit(item.key, item.label)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        borderTopWidth: 1,
                        borderTopColor: COLORS.border,
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={{ color: COLORS.text, fontSize: 14, marginBottom: 4 }}>{item.label}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <View style={{
                            backgroundColor: cfg.bg,
                            paddingHorizontal: 8, paddingVertical: 2,
                            borderRadius: 100,
                          }}>
                            <Text style={{ color: cfg.color, fontWeight: '700', fontSize: 11 }}>{cfg.label}</Text>
                          </View>
                          {rec?.inspection_date && (
                            <Text style={{ color: COLORS.subtext, fontSize: 11 }}>📅 {rec.inspection_date}</Text>
                          )}
                          {hasNote && (
                            <Text style={{ color: COLORS.subtext, fontSize: 11 }}>📝 note</Text>
                          )}
                        </View>
                      </View>
                      <MaterialCommunityIcons name="pencil-outline" size={20} color={COLORS.teal} />
                    </Pressable>
                  )
                })}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Edit modal */}
      <Modal
        visible={!!editing}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.40)', justifyContent: 'flex-end' }}
        >
          <View style={{
            backgroundColor: COLORS.card,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            maxHeight: '90%',
          }}>
            <ScrollView contentContainerStyle={{ padding: 22 }}>
              <Text style={{ color: COLORS.navy, fontSize: 18, fontWeight: '800', marginBottom: 16 }}>
                {editing?.itemLabel}
              </Text>

              {/* Status buttons */}
              <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 8 }}>Status</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
                {STATUS_ORDER.map(s => {
                  const cfg = STATUS_CONFIG[s]
                  const active = editing?.status === s
                  return (
                    <Pressable
                      key={s}
                      onPress={() => editing && setEditing({ ...editing, status: s })}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 100,
                        backgroundColor: active ? cfg.color : cfg.bg,
                        borderWidth: 1,
                        borderColor: cfg.color,
                      }}
                    >
                      <Text style={{ color: active ? COLORS.white : cfg.color, fontWeight: '700', fontSize: 13 }}>
                        {cfg.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              {/* Date */}
              <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 8 }}>Inspection Date</Text>
              <TextInput
                value={editing?.date || ''}
                onChangeText={(text) => editing && setEditing({ ...editing, date: text })}
                placeholder="YYYY-MM-DD (leave blank if none)"
                placeholderTextColor={COLORS.subtext}
                autoCapitalize="none"
                style={{
                  backgroundColor: COLORS.white,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: COLORS.text,
                  marginBottom: 18,
                }}
              />

              {/* Notes */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: COLORS.navy, fontWeight: '700' }}>Notes</Text>
                {!!(editing?.notes && editing.notes.length > 0) && (
                  <Pressable onPress={clearNote}>
                    <Text style={{ color: COLORS.red, fontWeight: '700', fontSize: 13 }}>Clear note</Text>
                  </Pressable>
                )}
              </View>
              <TextInput
                value={editing?.notes || ''}
                onChangeText={(text) => editing && setEditing({ ...editing, notes: text })}
                placeholder="Optional notes for this inspection"
                placeholderTextColor={COLORS.subtext}
                multiline
                style={{
                  backgroundColor: COLORS.white,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: COLORS.text,
                  minHeight: 110,
                  textAlignVertical: 'top',
                  marginBottom: 18,
                }}
              />

              {/* Actions */}
              <View style={{ gap: 10 }}>
                <Pressable
                  onPress={saveItem}
                  disabled={saving}
                  style={{
                    backgroundColor: saving ? '#94A3B8' : COLORS.navy,
                    borderRadius: 18,
                    paddingVertical: 16,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 16 }}>
                    {saving ? 'Saving...' : 'Save'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setEditing(null)}
                  style={{ borderRadius: 18, paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={{ color: COLORS.subtext, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}
