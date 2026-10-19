import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import ImageView from 'react-native-image-viewing'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRealtimeRefetch } from '../../hooks/useRealtimeRefetch'
import { useLanguage } from '../../lib/i18n'
import { SignedImage } from '../../components/SignedImage'
import { isManagerRole, isSupervisorPlus } from '../../lib/roles'
import { signedUrl } from '../../lib/storageUrl'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'

type Open = {
  id: number
  user_id: string
  user_name: string | null
  project_id: number | null
  clock_in_time: string | null
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_in_snapshot_url: string | null
  clock_in_offsite: boolean | null
}
type Worker = { id: string; full_name: string | null }
type Project = { id: number; name: string }

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
  // Clock-in snapshot, full size and pinch-zoomable: a face you are checking
  // against a name needs to be looked at closely.
  const [preview, setPreview] = useState<string | null>(null)
  async function openSnapshot(value: string | null) {
    if (!value) return
    const uri = await signedUrl('time-entry-snapshots', value)
    if (uri) setPreview(uri)
  }

  // Clocking someone in or out from here. A manager may do it for anyone in
  // the company; a supervisor only on the projects they are assigned to, and
  // the database says no otherwise. The buttons therefore show for both and
  // the refusal, when it comes, is the server's own sentence.
  const [canAct, setCanAct] = useState(false)
  const [busy, setBusy] = useState<number | 'in' | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [jobs, setJobs] = useState<Project[]>([])
  const [pickWorker, setPickWorker] = useState<string | null>(null)
  const [pickJob, setPickJob] = useState<number | null>(null)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { router.replace('/'); return }
    const { data: me } = await supabase.from('profiles').select('role, org_id').eq('id', session.user.id).single()
    const role = (me as any)?.role as string | undefined
    if (!isSupervisorPlus(role)) { setNotAllowed(true); setLoading(false); return }
    setCanAct(isManagerRole(role) || role === 'supervisor')

    const { data } = await supabase
      .from('time_entries')
      .select('id, user_id, user_name, project_id, clock_in_time, clock_in_lat, clock_in_lng, clock_in_snapshot_url, clock_in_offsite')
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

    // The pickers: the company's people who clock in (contractual contractors
    // do not), and its own active jobs. A job shared with us by another
    // company is not somewhere our hours can be booked.
    const orgId = (me as any)?.org_id as string | undefined
    const [{ data: ws }, { data: js }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').or('pay_type.is.null,pay_type.neq.contractual').order('full_name'),
      orgId
        ? supabase.from('projects').select('id, name').eq('org_id', orgId).eq('status', 'active').order('name')
        : supabase.from('projects').select('id, name').eq('status', 'active').order('name'),
    ])
    setWorkers((ws as Worker[]) || [])
    setJobs((js as Project[]) || [])
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch('time_entries', load, undefined, !loading)

  async function clockOut(r: Open) {
    const name = r.user_name || t('worker')
    Alert.alert(t('clockOut'), t('clockOutNowConfirm', { name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('clockOut'), style: 'destructive',
        onPress: async () => {
          setBusy(r.id)
          try {
            const { error } = await supabase.rpc('manager_clock_out', { p_entry_id: r.id })
            if (error) throw error
            await load()
          } catch (e: any) {
            Alert.alert(t('error'), e?.message || t('somethingWrong'))
          } finally { setBusy(null) }
        },
      },
    ])
  }

  async function clockIn() {
    if (!pickWorker || pickJob == null) return
    setBusy('in')
    try {
      const { error } = await supabase.rpc('manager_clock_in', { p_user_id: pickWorker, p_project_id: pickJob })
      if (error) throw error
      setPickerOpen(false); setPickWorker(null); setPickJob(null)
      await load()
    } catch (e: any) {
      Alert.alert(t('error'), e?.message || t('somethingWrong'))
    } finally { setBusy(null) }
  }

  // Someone already on the clock is not offered again: the server would
  // refuse, and a list that only shows who CAN be clocked in is the point.
  const onClock = new Set(rows.map(r => r.user_id))
  const candidates = workers.filter(w => !onClock.has(w.id))

  if (loading) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center' }}><ActivityIndicator color={COLORS.teal} /></SafeAreaView>
  }
  if (notAllowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, padding: 20 }}>
        <Text style={{ color: COLORS.text, fontWeight: '700' }}>{t('managerOnly')}</Text>
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
        {canAct ? (
          <Pressable onPress={() => setPickerOpen(true)} accessibilityLabel={t('clockSomeoneIn')}
            style={{ height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: COLORS.teal, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="account-plus" size={20} color={COLORS.white} />
            <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 14 }}>{t('clockIn')}</Text>
          </Pressable>
        ) : null}
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
                <Pressable onPress={() => openSnapshot(r.clock_in_snapshot_url)}>
                  <SignedImage bucket="time-entry-snapshots" value={r.clock_in_snapshot_url} style={{ width: 64, height: 64, borderRadius: 10, borderWidth: r.clock_in_offsite ? 2 : 1, borderColor: r.clock_in_offsite ? '#E57373' : COLORS.border }} />
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                  {hasLoc ? (
                    <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${r.clock_in_lat},${r.clock_in_lng}`)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="location" size={14} color={COLORS.teal} />
                      <Text style={{ color: COLORS.teal, fontSize: 13, fontWeight: '700' }}>{t('openInMaps')}</Text>
                    </Pressable>
                  ) : null}
                  {canAct ? (
                    <Pressable onPress={() => clockOut(r)} disabled={busy === r.id}
                      style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FDECEA', borderWidth: 1, borderColor: '#EF9A9A', alignItems: 'center', justifyContent: 'center', opacity: busy === r.id ? 0.6 : 1 }}>
                      <Text style={{ color: '#B71C1C', fontWeight: '800', fontSize: 13 }}>{busy === r.id ? '…' : t('clockOut')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          )
        })}
      </ScrollView>

      <ImageView
        images={preview ? [{ uri: preview }] : []}
        imageIndex={0}
        visible={!!preview}
        onRequestClose={() => setPreview(null)}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
      />

      {/* Clock someone in: who, then which job. Two lists of big targets, no
          typing - this is pressed on a jobsite with gloves on. */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: COLORS.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '85%', padding: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ color: COLORS.navy, fontSize: 20, fontWeight: '900' }}>{t('clockSomeoneIn')}</Text>
              <Pressable onPress={() => setPickerOpen(false)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.subtext} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
              <Text style={{ color: COLORS.subtext, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>{t('worker').toUpperCase()}</Text>
              {candidates.length === 0 ? (
                <Text style={{ color: COLORS.subtext, paddingVertical: 8 }}>{t('everyoneIsClockedIn')}</Text>
              ) : candidates.map(w => {
                const on = pickWorker === w.id
                return (
                  <Pressable key={w.id} onPress={() => setPickWorker(w.id)}
                    style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: on ? COLORS.navy : COLORS.card, borderWidth: 1, borderColor: on ? COLORS.navy : COLORS.border, justifyContent: 'center' }}>
                    <Text style={{ color: on ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 15 }}>{w.full_name || '—'}</Text>
                  </Pressable>
                )
              })}
              <Text style={{ color: COLORS.subtext, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: 10 }}>{t('project').toUpperCase()}</Text>
              {jobs.map(j => {
                const on = pickJob === j.id
                return (
                  <Pressable key={j.id} onPress={() => setPickJob(j.id)}
                    style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: on ? COLORS.navy : COLORS.card, borderWidth: 1, borderColor: on ? COLORS.navy : COLORS.border, justifyContent: 'center' }}>
                    <Text style={{ color: on ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 15 }}>{j.name}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
            <Pressable onPress={clockIn} disabled={!pickWorker || pickJob == null || busy === 'in'}
              style={{ minHeight: 52, borderRadius: 14, backgroundColor: COLORS.teal, alignItems: 'center', justifyContent: 'center', opacity: !pickWorker || pickJob == null || busy === 'in' ? 0.5 : 1 }}>
              <Text style={{ color: COLORS.white, fontWeight: '900', fontSize: 16 }}>{busy === 'in' ? '…' : t('clockIn')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
