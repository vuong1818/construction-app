import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRealtimeRefetch } from '../../hooks/useRealtimeRefetch'
import { useLanguage } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'

type Open = {
  id: number
  user_name: string | null
  project_id: number | null
  clock_in_time: string | null
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_in_snapshot_url: string | null
  clock_in_offsite: boolean | null
}

function since(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function timeOf(iso: string | null): string {
  try { return iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '' } catch { return '' }
}

export default function CrewStatusScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [notAllowed, setNotAllowed] = useState(false)
  const [rows, setRows] = useState<Open[]>([])
  const [projects, setProjects] = useState<Record<number, string>>({})
  const [preview, setPreview] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { router.replace('/'); return }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    if (!['manager', 'owner'].includes((me as any)?.role)) { setNotAllowed(true); setLoading(false); return }

    const { data } = await supabase
      .from('time_entries')
      .select('id, user_name, project_id, clock_in_time, clock_in_lat, clock_in_lng, clock_in_snapshot_url, clock_in_offsite')
      .is('clock_out_time', null)
      .order('clock_in_time', { ascending: true })
    const list = (data as Open[]) || []
    setRows(list)
    const ids = Array.from(new Set(list.map(r => r.project_id).filter((x): x is number => x != null)))
    if (ids.length) {
      const { data: ps } = await supabase.from('projects').select('id, name').in('id', ids)
      const map: Record<number, string> = {}
      for (const p of (ps || [])) map[(p as any).id] = (p as any).name
      setProjects(map)
    }
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch('time_entries', load, undefined, !loading)

  if (loading) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center' }}><ActivityIndicator color={COLORS.teal} /></SafeAreaView>
  }
  if (notAllowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, padding: 20 }}>
        <Text style={{ color: COLORS.text, fontWeight: '700' }}>Managers only.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}><Text style={{ color: COLORS.navy, fontWeight: '700' }}>{t('back')}</Text></Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
      <View style={{ backgroundColor: COLORS.navy, paddingHorizontal: 20, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: '900' }}>{t('crewStatus')}</Text>
          <Text style={{ color: '#A8C4EE', fontSize: 13, marginTop: 2 }}>{rows.length} {t('onTheClockNow').toLowerCase()}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        {rows.length === 0 ? (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 32, alignItems: 'center' }}>
            <MaterialCommunityIcons name="account-clock-outline" size={48} color={COLORS.muted} />
            <Text style={{ color: COLORS.subtext, marginTop: 12 }}>{t('noneClockedIn')}</Text>
          </View>
        ) : rows.map(r => {
          const hasLoc = r.clock_in_lat != null && r.clock_in_lng != null
          return (
            <View key={r.id} style={{ backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 14, flexDirection: 'row', gap: 12 }}>
              {r.clock_in_snapshot_url ? (
                <Pressable onPress={() => setPreview(r.clock_in_snapshot_url)}>
                  <Image source={{ uri: r.clock_in_snapshot_url }} style={{ width: 64, height: 64, borderRadius: 10, borderWidth: r.clock_in_offsite ? 2 : 1, borderColor: r.clock_in_offsite ? '#E57373' : COLORS.border }} />
                </Pressable>
              ) : (
                <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: COLORS.navySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="map-marker-off-outline" size={26} color={COLORS.subtext} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={{ color: COLORS.navy, fontSize: 16, fontWeight: '800' }}>{r.user_name || '—'}</Text>
                  {r.clock_in_offsite ? (
                    <View style={{ backgroundColor: '#FDECEA', borderRadius: 100, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ color: '#C62828', fontSize: 10, fontWeight: '800' }}>{t('offsiteBadge')}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: COLORS.text, fontSize: 13, marginTop: 2 }}>{r.project_id != null ? (projects[r.project_id] || '—') : '—'}</Text>
                <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 2 }}>
                  {t('clockedInSinceLabel')} {timeOf(r.clock_in_time)} · {since(r.clock_in_time)}
                </Text>
                {hasLoc ? (
                  <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${r.clock_in_lat},${r.clock_in_lng}`)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <Ionicons name="location" size={14} color={COLORS.teal} />
                    <Text style={{ color: COLORS.teal, fontSize: 13, fontWeight: '700' }}>{t('openInMaps')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )
        })}
      </ScrollView>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable onPress={() => setPreview(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          {preview ? <Image source={{ uri: preview }} style={{ width: '100%', height: '70%', borderRadius: 12 }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
