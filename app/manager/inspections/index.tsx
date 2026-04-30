import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  CIVIL_INSPECTIONS,
  COMMERCIAL_RESIDENTIAL_INSPECTIONS,
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
  green: '#16A34A',
  greenSoft: '#DCFCE7',
  text: '#0F172A',
  subtext: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
}

type Project = {
  id: number
  name: string
  address: string | null
  status: string | null
  construction_type: string | null
}

type InspectionCounts = {
  passed: number
  total: number
}

export default function ManagerInspectionsIndex() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [userRole, setUserRole] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [countsByProject, setCountsByProject] = useState<Record<number, InspectionCounts>>({})

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setErrorMessage('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setErrorMessage('You must be signed in.')
        return
      }

      const { data: me, error: meError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (meError) { setErrorMessage(meError.message); return }

      const role = me?.role || 'worker'
      setUserRole(role)
      if (role !== 'manager') return

      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('id, name, address, status, construction_type')
        .order('name', { ascending: true })

      if (projectsError) { setErrorMessage(projectsError.message); return }

      const projectList = (projectsData || []) as Project[]
      setProjects(projectList)

      if (projectList.length > 0) {
        const ids = projectList.map(p => p.id)
        const { data: insp } = await supabase
          .from('project_inspections')
          .select('project_id, status')
          .in('project_id', ids)

        const counts: Record<number, InspectionCounts> = {}
        for (const p of projectList) {
          const list = p.construction_type === 'civil'
            ? CIVIL_INSPECTIONS
            : COMMERCIAL_RESIDENTIAL_INSPECTIONS
          counts[p.id] = { passed: 0, total: totalItems(list) }
        }
        for (const row of insp || []) {
          if (row.status === 'passed' && counts[row.project_id]) {
            counts[row.project_id].passed += 1
          }
        }
        setCountsByProject(counts)
      }
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to load projects.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>Loading projects...</Text>
      </SafeAreaView>
    )
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.red, fontWeight: '700', marginBottom: 10 }}>Error</Text>
        <Text style={{ color: COLORS.text, textAlign: 'center', marginBottom: 16 }}>{errorMessage}</Text>
        <Pressable onPress={load} style={{ backgroundColor: COLORS.navy, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 }}>
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>Retry</Text>
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
        <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
          <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800', marginBottom: 6 }}>Inspections</Text>
          <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
            Choose a project to view and update inspection status, dates, and notes.
          </Text>
        </View>

        {projects.length === 0 ? (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, padding: 20 }}>
            <Text style={{ color: COLORS.text, textAlign: 'center' }}>No projects yet.</Text>
          </View>
        ) : (
          projects.map(p => {
            const c = countsByProject[p.id]
            const fraction = c ? `${c.passed}/${c.total} passed` : '—'
            return (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/manager/inspections/${p.id}`)}
                style={{
                  backgroundColor: COLORS.card,
                  borderRadius: 22,
                  padding: 18,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  marginBottom: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <View style={{
                  width: 56, height: 56, borderRadius: 18,
                  backgroundColor: COLORS.tealSoft,
                  justifyContent: 'center', alignItems: 'center',
                  marginRight: 14,
                }}>
                  <MaterialCommunityIcons name="clipboard-check-outline" size={28} color={COLORS.teal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.navy, fontSize: 18, fontWeight: '800', marginBottom: 4 }}>
                    {p.name}
                  </Text>
                  {p.address && (
                    <Text style={{ color: COLORS.subtext, fontSize: 13, marginBottom: 4 }} numberOfLines={1}>
                      {p.address}
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {p.construction_type && (
                      <Text style={{ color: COLORS.subtext, fontSize: 12, textTransform: 'capitalize' }}>
                        {p.construction_type}
                      </Text>
                    )}
                    <Text style={{
                      color: c && c.passed > 0 ? COLORS.green : COLORS.subtext,
                      fontSize: 13, fontWeight: '700',
                    }}>
                      {fraction}
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={28} color={COLORS.subtext} />
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
