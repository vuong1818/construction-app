import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../lib/i18n'
import { isManagerRole } from '../../lib/roles'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'

// Manager entry point for Job Kits. Job kits are per-project, so this lists the
// projects and opens each project's job kit (build/manage in edit mode).
type Project = { id: number; name: string; status: string | null; address: string | null }

function statusColor(status: string | null) {
  switch ((status || '').toLowerCase()) {
    case 'active':    return { bg: COLORS.greenSoft, text: COLORS.green }
    case 'completed': return { bg: COLORS.navySoft, text: COLORS.navy }
    case 'bidding':   return { bg: COLORS.yellowSoft, text: COLORS.yellow }
    default:          return { bg: '#F1F5F9', text: COLORS.subtext }
  }
}

export default function ManagerJobKitsScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (uid) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
      setAllowed(isManagerRole((prof as any)?.role))
    } else setAllowed(false)
    await load()
  }

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('projects').select('id, name, status, address').order('name', { ascending: true })
    setProjects((data as Project[]) || [])
    setLoading(false)
  }

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  if (loading || allowed === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.teal} />
      </SafeAreaView>
    )
  }

  if (!allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', padding: 28 }}>
        <MaterialCommunityIcons name="lock-outline" size={48} color={COLORS.border} />
        <Text style={{ color: COLORS.subtext, marginTop: 10 }}>{t('managerOnly')}</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={{ fontSize: 24, fontWeight: '900', color: COLORS.navy, marginBottom: 2 }}>{t('jobKits')}</Text>
        <Text style={{ color: COLORS.subtext, marginBottom: 16 }}>{t('jobKitsSubtitle')}</Text>

        {projects.length === 0 ? (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginTop: 20 }}>
            <MaterialCommunityIcons name="toolbox-outline" size={44} color={COLORS.border} />
            <Text style={{ color: COLORS.subtext, marginTop: 10 }}>{t('noProjectsYet')}</Text>
          </View>
        ) : projects.map(p => {
          const s = statusColor(p.status)
          return (
            <Pressable
              key={p.id}
              onPress={() => router.push(`/project/${p.id}/job-kit`)}
              style={{ backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.tealSoft, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="package-variant-closed" size={22} color={COLORS.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 15 }} numberOfLines={1}>{p.name}</Text>
                {p.address ? <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 1 }} numberOfLines={1}>{p.address}</Text> : null}
              </View>
              {p.status ? (
                <View style={{ backgroundColor: s.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color: s.text, fontWeight: '800', fontSize: 11 }}>{p.status.toUpperCase()}</Text>
                </View>
              ) : null}
              <Text style={{ color: COLORS.border, fontSize: 20 }}>›</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </SafeAreaView>
  )
}
