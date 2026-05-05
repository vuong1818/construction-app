import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SkeletonList } from '../components/SkeletonCard'
import { useCompanyLogo } from '../hooks/useCompanyLogo'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

type Project = {
  id: number
  name: string
  address: string | null
  status: string | null
  description: string | null
  created_at?: string | null
}

export default function ProjectsScreen() {
  const router = useRouter()
  const { logoUrl } = useCompanyLogo()
  const { t } = useLanguage()

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    setLoading(true)
    setErrorMessage('')

    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
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
                  : require('../assets/images/company-logo.png')
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
        </View>

        {projects.map((project) => (
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
    </SafeAreaView>
  )
}