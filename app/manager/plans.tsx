import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#D6E8FF',
  card: '#FFFFFF',
  navy: '#16356B',
  navySoft: '#EAF0F8',
  teal: '#19B6D2',
  tealSoft: '#E7F9FC',
  green: '#22C55E',
  greenSoft: '#ECFDF5',
  red: '#EF4444',
  redSoft: '#FEF2F2',
  yellow: '#F9A825',
  yellowSoft: '#FFF8E1',
  text: '#0F172A',
  sub: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Project = {
  id: number
  name: string
  address: string | null
  status: string | null
  description: string | null
  created_at: string
}

type Plan = {
  id: number
  project_id: number
  file_name: string        // storage filename
  original_name: string | null  // display name
  file_path: string        // storage path (used for signed URL + delete)
  plan_type: string | null
  created_at: string
}

const PLAN_TYPE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  architectural: { bg: '#E3F2FD', color: '#1565C0', label: 'Architectural' },
  civil:         { bg: '#E0F2F1', color: '#00695C', label: 'Civil' },
  structural:    { bg: '#FCE4EC', color: '#AD1457', label: 'Structural' },
  electrical:    { bg: '#FFF8E1', color: '#F57F17', label: 'Electrical' },
  mechanical:    { bg: '#EDE7F6', color: '#4527A0', label: 'Mechanical' },
  plumbing:      { bg: '#E1F5FE', color: '#0277BD', label: 'Plumbing' },
  redline:       { bg: '#FFEBEE', color: '#C62828', label: 'Redline' },
  landscape:     { bg: '#E8F5E9', color: '#2E7D32', label: 'Landscape' },
  other:         { bg: '#F4F7FA', color: '#555555', label: 'Other' },
  mep:           { bg: '#EDE7F6', color: '#4527A0', label: 'MEP' },
}

const STATUS_OPTIONS = ['Active', 'Bidding', 'On Hold', 'Completed']

function statusColor(status: string | null) {
  switch ((status || '').toLowerCase()) {
    case 'active':    return { bg: C.greenSoft,  text: C.green  }
    case 'completed': return { bg: C.navySoft,   text: C.navy   }
    case 'bidding':   return { bg: C.yellowSoft, text: C.yellow }
    default:          return { bg: '#F1F5F9',    text: C.sub    }
  }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ManagerPlansScreen() {
  const router = useRouter()

  const [projects, setProjects]       = useState<Project[]>([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)

  // Plans per project (expanded in-place)
  const [expandedId, setExpandedId]   = useState<number | null>(null)
  const [plans, setPlans]             = useState<Plan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [uploading, setUploading]     = useState(false)

  // New project modal
  const [showCreate, setShowCreate]   = useState(false)
  const [saving, setSaving]           = useState(false)
  const [name, setName]               = useState('')
  const [address, setAddress]         = useState('')
  const [statusIdx, setStatusIdx]     = useState(0)
  const [description, setDescription] = useState('')

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, address, status, description, created_at')
      .order('created_at', { ascending: false })
    if (error) {
      Alert.alert('Could not load projects', error.message)
    } else {
      setProjects((data as Project[]) || [])
    }
    setLoading(false)
  }

  async function onRefresh() {
    setRefreshing(true)
    await loadProjects()
    if (expandedId !== null) await loadPlans(expandedId)
    setRefreshing(false)
  }

  // ── Plans ──────────────────────────────────────────────────────────────────
  async function toggleExpand(projectId: number) {
    if (expandedId === projectId) {
      setExpandedId(null)
      setPlans([])
      return
    }
    setExpandedId(projectId)
    await loadPlans(projectId)
  }

  async function loadPlans(projectId: number) {
    setPlansLoading(true)
    const { data } = await supabase
      .from('project_plans')
      .select('id, project_id, name, plan_type, file_path, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    const rows: Plan[] = (data || []).map((p: any) => ({
      id: p.id,
      project_id: p.project_id,
      file_name: p.file_path ? p.file_path.split('/').pop() : (p.name || 'plan.pdf'),
      original_name: p.name || null,
      file_path: p.file_path || '',
      plan_type: p.plan_type ?? null,
      created_at: p.created_at,
    }))
    setPlans(rows)
    setPlansLoading(false)
  }

  type PlanType =
    | 'architectural' | 'civil' | 'structural'
    | 'electrical' | 'mechanical' | 'plumbing'
    | 'redline' | 'landscape' | 'other'

  function promptForPlanTypeAndUpload(projectId: number) {
    Alert.alert('Plan Type', 'What kind of plan is this?', [
      { text: 'Architectural', onPress: () => uploadPlan(projectId, 'architectural') },
      { text: 'Civil',         onPress: () => uploadPlan(projectId, 'civil') },
      { text: 'Structural',    onPress: () => uploadPlan(projectId, 'structural') },
      { text: 'Electrical',    onPress: () => uploadPlan(projectId, 'electrical') },
      { text: 'Mechanical',    onPress: () => uploadPlan(projectId, 'mechanical') },
      { text: 'Plumbing',      onPress: () => uploadPlan(projectId, 'plumbing') },
      { text: 'Redline',       onPress: () => uploadPlan(projectId, 'redline') },
      { text: 'Landscape',     onPress: () => uploadPlan(projectId, 'landscape') },
      { text: 'Other',         onPress: () => uploadPlan(projectId, 'other') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  async function uploadPlan(projectId: number, planType: PlanType) {
    try {
      setUploading(true)
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      })
      if (result.canceled) return
      const file = result.assets?.[0]
      if (!file?.uri) throw new Error('No file selected.')

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Not authenticated.')
      const token = session.access_token

      const safeName = (file.name || 'plan.pdf')
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '')
      const storageFileName = `project-${projectId}-${Date.now()}-${safeName}`
      const filePath = `project-${projectId}/${storageFileName}`

      const uploadResult = await FileSystem.uploadAsync(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/project-plans/${filePath}`,
        file.uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/pdf',
            'x-upsert': 'true',
          },
        }
      )
      if (uploadResult.status >= 400) throw new Error(`Upload failed: ${uploadResult.body}`)

      const fileUrl = supabase.storage.from('project-plans').getPublicUrl(filePath).data.publicUrl
      const { error: dbErr } = await supabase.from('project_plans').insert({
        project_id: projectId,
        name: file.name || 'Plan',
        plan_type: planType,
        file_url: fileUrl,
        file_path: filePath,
      })
      if (dbErr) throw dbErr

      Alert.alert('Uploaded', 'Plan uploaded successfully.')
      await loadPlans(projectId)
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not upload plan.')
    } finally {
      setUploading(false)
    }
  }

  async function viewPlan(plan: Plan) {
    try {
      const { data, error } = await supabase.storage
        .from('project-plans')
        .createSignedUrl(plan.file_path, 3600)
      if (error || !data?.signedUrl) throw new Error('Could not generate link.')
      await Linking.openURL(data.signedUrl)
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not open plan.')
    }
  }

  async function deletePlan(plan: Plan) {
    Alert.alert('Delete Plan', `Delete "${plan.original_name || plan.file_name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await supabase.storage.from('project-plans').remove([plan.file_path])
            const { error } = await supabase.from('project_plans').delete().eq('id', plan.id)
            if (error) throw error
            setPlans(prev => prev.filter(p => p.id !== plan.id))
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Could not delete plan.')
          }
        },
      },
    ])
  }

  // ── Create Project ─────────────────────────────────────────────────────────
  function openCreate() {
    setName('')
    setAddress('')
    setStatusIdx(0)
    setDescription('')
    setShowCreate(true)
  }

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert('Required', 'Project name is required.')
      return
    }
    try {
      setSaving(true)
      // Insert + return the new row so we can add it to local state immediately,
      // independent of whether the subsequent reload succeeds.
      const { data: created, error } = await supabase
        .from('projects')
        .insert({
          name: name.trim(),
          address: address.trim() || null,
          status: STATUS_OPTIONS[statusIdx],
          description: description.trim() || null,
        })
        .select('id, name, address, status, description, created_at')
        .single()
      if (error) throw error
      if (created) {
        setProjects((prev) => [created as Project, ...prev])
      }
      setShowCreate(false)
      Alert.alert('Created', `"${name.trim()}" has been created.`)
      // Best-effort refresh in the background; new row is already visible regardless
      loadProjects().catch((err) =>
        console.warn('Project list refresh failed:', err?.message),
      )
    } catch (err: any) {
      Alert.alert('Could not create project', err?.message || 'Unknown error.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteProject(project: Project) {
    Alert.alert(
      'Delete Project',
      `Delete "${project.name}"? Plans stored here will be removed. Photos and reports are kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              // Remove plan files from storage
              const { data: planFiles } = await supabase
                .from('project_files')
                .select('file_path')
                .eq('project_id', project.id)
                .eq('bucket_name', 'project-plans')
              if (planFiles?.length) {
                await supabase.storage.from('project-plans').remove(planFiles.map(f => f.file_path))
              }
              await supabase.from('project_files').delete().eq('project_id', project.id).eq('bucket_name', 'project-plans')
              await supabase.from('projects').delete().eq('id', project.id)
              setProjects(prev => prev.filter(p => p.id !== project.id))
              if (expandedId === project.id) { setExpandedId(null); setPlans([]) }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Could not delete project.')
            }
          },
        },
      ]
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={C.teal} />
        <Text style={{ marginTop: 12, color: C.sub }}>Loading projects...</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Create button */}
        <Pressable
          onPress={openCreate}
          style={{ backgroundColor: C.teal, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 16 }}
        >
          <Text style={{ color: C.white, fontWeight: '800', fontSize: 16 }}>+ Create New Project</Text>
        </Pressable>

        {projects.length === 0 ? (
          <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🏗️</Text>
            <Text style={{ color: C.navy, fontWeight: '800', fontSize: 18, marginBottom: 6 }}>No Projects Yet</Text>
            <Text style={{ color: C.sub, textAlign: 'center' }}>Tap "Create New Project" to add your first project.</Text>
          </View>
        ) : (
          projects.map(project => {
            const sc = statusColor(project.status)
            const isOpen = expandedId === project.id
            return (
              <View
                key={project.id}
                style={{ backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, marginBottom: 12, overflow: 'hidden' }}
              >
                {/* Project header */}
                <View style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontWeight: '800', fontSize: 16 }}>{project.name}</Text>
                      {project.address ? (
                        <Text style={{ color: C.sub, fontSize: 13, marginTop: 2 }}>{project.address}</Text>
                      ) : null}
                    </View>
                    <View style={{ backgroundColor: sc.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 }}>
                      <Text style={{ color: sc.text, fontWeight: '800', fontSize: 12 }}>{project.status || 'Unknown'}</Text>
                    </View>
                  </View>

                  {project.description ? (
                    <Text style={{ color: C.sub, fontSize: 13, marginBottom: 10, lineHeight: 18 }} numberOfLines={2}>
                      {project.description}
                    </Text>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => router.push(`/project/${project.id}`)}
                      style={{ flex: 1, backgroundColor: C.tealSoft, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
                    >
                      <Text style={{ color: C.teal, fontWeight: '800', fontSize: 13 }}>📁 Open Project</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => deleteProject(project)}
                      style={{ width: 44, backgroundColor: C.redSoft, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}
                    >
                      <Text style={{ color: C.red, fontSize: 18 }}>🗑</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Plans section (expanded inline) */}
                {isOpen && (
                  <View style={{ borderTopWidth: 1, borderTopColor: C.border, padding: 14, backgroundColor: '#FAFBFD' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                      <Text style={{ flex: 1, color: C.navy, fontWeight: '800', fontSize: 14 }}>Project Plans</Text>
                      <Pressable
                        onPress={() => promptForPlanTypeAndUpload(project.id)}
                        disabled={uploading}
                        style={{ backgroundColor: C.teal, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, opacity: uploading ? 0.6 : 1 }}
                      >
                        {uploading
                          ? <ActivityIndicator color={C.white} size="small" />
                          : <Text style={{ color: C.white, fontWeight: '800', fontSize: 12 }}>⬆ Upload Plan</Text>
                        }
                      </Pressable>
                    </View>

                    {plansLoading ? (
                      <ActivityIndicator color={C.teal} style={{ marginVertical: 12 }} />
                    ) : plans.length === 0 ? (
                      <Text style={{ color: C.sub, textAlign: 'center', paddingVertical: 12, fontSize: 13 }}>
                        No plans uploaded yet.
                      </Text>
                    ) : (
                      plans.map(plan => {
                        const badge = plan.plan_type ? PLAN_TYPE_BADGE[plan.plan_type] : null
                        return (
                          <View
                            key={plan.id}
                            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border, gap: 10 }}
                          >
                            <Text style={{ fontSize: 22 }}>📄</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                                {plan.original_name || plan.file_name}
                              </Text>
                              {badge && (
                                <View style={{ alignSelf: 'flex-start', marginTop: 4, backgroundColor: badge.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 }}>
                                  <Text style={{ color: badge.color, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>
                                    {badge.label.toUpperCase()}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Pressable
                              onPress={() => viewPlan(plan)}
                              style={{ backgroundColor: C.navySoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                            >
                              <Text style={{ color: C.navy, fontWeight: '800', fontSize: 12 }}>View</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => deletePlan(plan)}
                              style={{ backgroundColor: C.redSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                            >
                              <Text style={{ color: C.red, fontWeight: '800', fontSize: 12 }}>Delete</Text>
                            </Pressable>
                          </View>
                        )
                      })
                    )}
                  </View>
                )}
              </View>
            )
          })
        )}
      </ScrollView>

      {/* ── Create Project Modal ── */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                <Text style={{ flex: 1, fontSize: 22, fontWeight: '900', color: C.navy }}>New Project</Text>
                <Pressable onPress={() => setShowCreate(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={{ fontSize: 22, color: C.sub }}>✕</Text>
                </Pressable>
              </View>

              {/* Name */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Project Name *
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Smith Residence — Rough Plumbing"
                placeholderTextColor={C.sub}
                style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text, marginBottom: 16 }}
              />

              {/* Address */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Address
              </Text>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="123 Main St, Dallas, TX 75001"
                placeholderTextColor={C.sub}
                style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text, marginBottom: 16 }}
              />

              {/* Status */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Status
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {STATUS_OPTIONS.map((s, i) => (
                  <Pressable
                    key={s}
                    onPress={() => setStatusIdx(i)}
                    style={{
                      paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
                      backgroundColor: statusIdx === i ? C.navy : C.card,
                      borderWidth: 1, borderColor: statusIdx === i ? C.navy : C.border,
                    }}
                  >
                    <Text style={{ color: statusIdx === i ? C.white : C.sub, fontWeight: '700', fontSize: 14 }}>{s}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Description */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Description
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Scope of work, notes, etc."
                placeholderTextColor={C.sub}
                multiline
                numberOfLines={4}
                style={{
                  backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text,
                  minHeight: 100, textAlignVertical: 'top', marginBottom: 24,
                }}
              />

              <Pressable
                onPress={handleCreate}
                disabled={saving || !name.trim()}
                style={{
                  backgroundColor: saving || !name.trim() ? '#94A3B8' : C.navy,
                  borderRadius: 16, paddingVertical: 16, alignItems: 'center',
                }}
              >
                {saving
                  ? <ActivityIndicator color={C.white} />
                  : <Text style={{ color: C.white, fontWeight: '800', fontSize: 16 }}>Create Project</Text>
                }
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}
