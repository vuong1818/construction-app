import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { SkeletonList } from '../components/SkeletonCard'
import { useCompanyLogo } from '../hooks/useCompanyLogo'
import { useSharedProjectPresentation } from '../hooks/useProjectGrant'
import { useLanguage } from '../lib/i18n'
import { generateProjectRef, uniqueProjectRef } from '../lib/projectRef'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

type Project = {
  id: number
  name: string
  address: string | null
  status: string | null
  description: string | null
  reference_no?: string | null
  created_at?: string | null
}

const EMPTY_DRAFT = { name: '', address: '', city: '', state: '', zip: '', description: '' }

export default function ProjectsScreen() {
  const router = useRouter()
  const { logoUrl } = useCompanyLogo()
  // Which of these belong to another company, and which of THEIR rows fold
  // away because one of ours already stands for the same job. Without this a
  // subcontractor's list shows the same job twice with nothing to tell them
  // apart, and the crew files work against the wrong one.
  const { ownerByProject, hiddenProjects, workingForByProject } = useSharedProjectPresentation()
  const { t } = useLanguage()

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  // Only an owner or manager may open a job. That is the database's rule, not
  // this screen's — projects_insert checks is_manager(). Reading the role here
  // is only so a worker isn't shown a button that would fail on them.
  const [canCreate, setCanCreate] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadProjects()
    loadRole()
  }, [])

  async function loadRole() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) return
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', auth.user.id)
      .maybeSingle()
    setCanCreate(data?.role === 'manager' || data?.role === 'owner')
  }

  async function createProject() {
    const name = draft.name.trim()
    if (!name) {
      Alert.alert(t('missingInformation'), t('projectNameRequired'))
      return
    }
    setSaving(true)
    try {
      // Same reference-number convention as the web portal, made unique against
      // the refs already on screen. The DB's unique index is the real backstop.
      const ref = uniqueProjectRef(
        generateProjectRef({ name, city: draft.city }),
        projects.map(pr => pr.reference_no),
      )
      const { data: created, error } = await supabase
        .from('projects')
        .insert({
          name,
          address: draft.address.trim() || null,
          city: draft.city.trim() || null,
          state: draft.state.trim() || null,
          zip: draft.zip.trim() || null,
          description: draft.description.trim() || null,
          // Jobs opened from a phone are jobs being worked, so they start
          // active — that is also the only status this screen can show back.
          status: 'active',
          reference_no: ref,
        })
        .select('*')
        .single()
      if (error) {
        // 23505 = unique violation, which here always means the name is taken.
        Alert.alert(
          t('error'),
          error.code === '23505' ? t('projectNameTaken') : error.message,
        )
        return
      }
      if (created) setProjects(prev => [created as Project, ...prev])
      setShowAdd(false)
      setDraft(EMPTY_DRAFT)
    } catch (err: any) {
      Alert.alert(t('error'), err?.message || t('somethingWrong'))
    } finally {
      setSaving(false)
    }
  }

  async function loadProjects() {
    setLoading(true)
    setErrorMessage('')

    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('status', 'active') // field app shows only active projects
        .order('created_at', { ascending: false })

      if (error) {
        setErrorMessage(error.message)
        setProjects([])
        return
      }

      setProjects(data || [])
    } catch (error: any) {
      setErrorMessage(error?.message || t('failedToLoadProjects'))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <SkeletonList count={4} kind="project" />
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (errorMessage) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <Text style={{ color: '#EF4444', fontWeight: '700', marginBottom: 10 }}>
          {t('error')}
        </Text>
        <Text style={{ color: COLORS.text, textAlign: 'center', marginBottom: 16 }}>
          {errorMessage}
        </Text>
        <Pressable
          onPress={loadProjects}
          style={{
            backgroundColor: COLORS.navy,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: 14,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{t('retry')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View
          style={{
            backgroundColor: COLORS.navy,
            borderRadius: 28,
            padding: 22,
            marginBottom: 18,
          }}
        >
          <View
            style={{
              width: 78,
              height: 78,
              borderRadius: 22,
              backgroundColor: COLORS.card,
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'hidden',
              marginBottom: 14,
            }}
          >
            <Image
              source={
                logoUrl
                  ? { uri: logoUrl }
                  : require('../assets/images/siteofficeiq-logo.png')
              }
              style={{
                width: 58,
                height: 58,
                resizeMode: 'contain',
              }}
            />
          </View>

          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 28,
              fontWeight: '800',
              marginBottom: 6,
            }}
          >
            {t('projects')}
          </Text>

          <Text
            style={{
              color: '#D9F6FB',
              lineHeight: 22,
            }}
          >
            {t('projectsListIntro')}
          </Text>

          {canCreate ? (
            <Pressable
              onPress={() => setShowAdd(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: COLORS.teal,
                borderRadius: 16,
                paddingVertical: 14,
                marginTop: 16,
              }}
            >
              <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16, marginLeft: 6 }}>
                {t('newProject')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {projects.filter(p => !hiddenProjects.has(p.id)).map((project) => (
          <Pressable
            key={project.id}
            onPress={() => router.push(`/project/${project.id}`)}
            style={{
              backgroundColor: COLORS.card,
              borderRadius: 22,
              padding: 18,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 18,
                  backgroundColor: COLORS.tealSoft,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 14,
                }}
              >
                <MaterialCommunityIcons
                  name="briefcase-outline"
                  size={28}
                  color={COLORS.teal}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 22 }}>
                  {project.name}
                </Text>
                {(ownerByProject[project.id] || workingForByProject[project.id]) && (
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      backgroundColor: workingForByProject[project.id] ? '#EDE7F6' : '#F3E5F5',
                      borderRadius: 100,
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                      marginTop: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: workingForByProject[project.id] ? '#4527A0' : '#7B1FA2',
                        fontWeight: '800',
                        fontSize: 11,
                      }}
                    >
                      {workingForByProject[project.id]
                        ? `WORKING FOR ${workingForByProject[project.id].toUpperCase()}`
                        : `SHARED BY ${ownerByProject[project.id].toUpperCase()}`}
                    </Text>
                  </View>
                )}
                <Text style={{ color: COLORS.text, marginTop: 4 }}>
                  {`${t('addressLabel')}: ${project.address || t('noAddress')}`}
                </Text>
                <Text style={{ color: COLORS.subtext, marginTop: 2 }}>
                  {`${t('statusFieldLabel')}: ${project.status || t('noStatus')}`}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' }}
        >
          <View
            style={{
              backgroundColor: COLORS.card,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: 28,
              maxHeight: '90%',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ flex: 1, color: COLORS.navy, fontSize: 22, fontWeight: '800' }}>
                {t('newProject')}
              </Text>
              <Pressable onPress={() => setShowAdd(false)} hitSlop={12}>
                <MaterialCommunityIcons name="close" size={26} color={COLORS.subtext} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {([
                ['name', t('projectNameLabel'), false],
                ['address', t('addressLabel'), false],
                ['city', t('cityLabel'), false],
                ['state', t('stateLabel'), false],
                ['zip', t('zip'), false],
                ['description', t('descriptionLabel'), true],
              ] as [keyof typeof EMPTY_DRAFT, string, boolean][]).map(([key, label, multi]) => (
                <View key={key} style={{ marginBottom: 14 }}>
                  <Text style={{ color: COLORS.navy, fontWeight: '700', fontSize: 14, marginBottom: 6 }}>
                    {key === 'name' ? `${label} *` : label}
                  </Text>
                  <TextInput
                    value={draft[key]}
                    onChangeText={v => setDraft(prev => ({ ...prev, [key]: v }))}
                    multiline={multi}
                    autoCapitalize={key === 'state' ? 'characters' : 'words'}
                    keyboardType={key === 'zip' ? 'number-pad' : 'default'}
                    placeholderTextColor={COLORS.muted}
                    style={{
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 16,
                      color: COLORS.text,
                      backgroundColor: COLORS.background,
                      minHeight: multi ? 90 : undefined,
                      textAlignVertical: multi ? 'top' : 'center',
                    }}
                  />
                </View>
              ))}

              <Pressable
                onPress={createProject}
                disabled={saving}
                style={{
                  backgroundColor: saving ? COLORS.muted : COLORS.navy,
                  borderRadius: 18,
                  paddingVertical: 16,
                  alignItems: 'center',
                  marginTop: 4,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>
                    {t('createProject')}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}