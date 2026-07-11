import { Ionicons } from '@expo/vector-icons'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { distanceMeters, drivingDistanceMeters, readCurrentLocation } from '../lib/clockLocation'
import { t, type LanguageCode } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

const ROAD_FACTOR = 1.3
const METERS_PER_MILE = 1609.344

type Segment = {
  id: number
  kind: 'commute_to' | 'commute_from' | 'transfer' | null
  started_at: string
  ended_at: string | null
  miles: number | null
  start_lat: number | null
  start_lng: number | null
  project_id: number | null
}
type Project = { id: number; name: string }

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}

/**
 * Travel / mileage tracker — models the real field workflow:
 *   • Travel to work (before clock-in): commute leg; auto-closes when you clock in.
 *   • Transfer (while clocked in): logs site→site miles AND splits your time — travel
 *     time counts toward the destination project.
 *   • Travel home (after clock-out): commute leg; tap Arrived at home.
 * Commute legs reimburse miles past the company threshold; transfers reimburse in full;
 * only own-vehicle miles are paid.
 */
export default function TravelCard({
  activeEntryId, projects, userName, language, onChanged,
}: {
  activeEntryId: number | null
  projects: Project[]
  userName: string | null
  language: LanguageCode
  onChanged?: () => void
}) {
  const [segments, setSegments] = useState<Segment[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  // Vehicle toggle — personal is the default (own-vehicle miles are reimbursed).
  const [ownVehicle, setOwnVehicle] = useState(true)
  // Configurable "still traveling?" window (hours). In-state default; out-of-state is
  // longer. We use the in-state window as the client default and flag anything over it.
  const [travelWindowHours, setTravelWindowHours] = useState(1)
  const [ackOpenId, setAckOpenId] = useState<number | null>(null)   // leg the worker confirmed is still in progress
  const closingCommute = useRef(false)
  const autoFlagging = useRef(false)

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) { setLoading(false); return }
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const [{ data }, { data: cs }] = await Promise.all([
        supabase
          .from('travel_segments')
          .select('id, kind, started_at, ended_at, miles, start_lat, start_lng, project_id')
          .eq('user_id', uid)
          .gte('started_at', start.toISOString())
          .order('started_at', { ascending: true }),
        supabase.from('company_settings').select('travel_hours_in_state').order('id', { ascending: true }).limit(1).maybeSingle(),
      ])
      setSegments((data as Segment[]) || [])
      const h = Number((cs as any)?.travel_hours_in_state)
      if (Number.isFinite(h) && h > 0) setTravelWindowHours(h)
    } catch (e) { console.warn('travel load failed', e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load, activeEntryId])

  const open = segments.find((s) => !s.ended_at) || null
  const closed = segments.filter((s) => s.ended_at)
  const totalMiles = segments.reduce((sum, s) => sum + (Number(s.miles) || 0), 0)

  async function milesBetween(sLat: number, sLng: number, eLat: number, eLng: number): Promise<{ miles: number; source: string }> {
    const driving = await drivingDistanceMeters(sLat, sLng, eLat, eLng)
    if (driving != null) return { miles: Math.round((driving / METERS_PER_MILE) * 10) / 10, source: 'routing' }
    const meters = distanceMeters(sLat, sLng, eLat, eLng)
    return { miles: Math.round((meters / METERS_PER_MILE) * ROAD_FACTOR * 10) / 10, source: 'straight_line' }
  }

  async function startSegment(kind: 'commute_to' | 'commute_from' | 'transfer', ownVehicle: boolean) {
    if (busy) return
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) throw new Error('Not signed in')
      const loc = await readCurrentLocation()
      const { error } = await supabase.from('travel_segments').insert({
        user_id: uid, user_name: userName,
        time_entry_id: kind === 'transfer' ? activeEntryId : null,
        kind, own_vehicle: ownVehicle,
        started_at: new Date().toISOString(), start_lat: loc.lat, start_lng: loc.lng,
      })
      if (error) throw error
      await load()
    } catch (e: any) { Alert.alert(t(language, 'error'), e?.message || t(language, 'somethingWrong')) } finally { setBusy(false) }
  }

  // Close an open commute segment at arrival (manual, or auto on clock-in).
  const closeCommute = useCallback(async (seg: Segment) => {
    try {
      const loc = await readCurrentLocation()
      let miles: number | null = null, source = 'straight_line'
      if (seg.start_lat != null && seg.start_lng != null) {
        const r = await milesBetween(seg.start_lat, seg.start_lng, loc.lat, loc.lng); miles = r.miles; source = r.source
      }
      await supabase.from('travel_segments').update({
        ended_at: new Date().toISOString(), end_lat: loc.lat, end_lng: loc.lng, miles, miles_source: source,
      }).eq('id', seg.id)
      await load()
    } catch (e: any) { Alert.alert(t(language, 'error'), e?.message || t(language, 'somethingWrong')) }
  }, [load, language])

  // Auto-close an open "travel to work" leg the moment the worker clocks in.
  useEffect(() => {
    if (!activeEntryId || !open || open.kind !== 'commute_to' || closingCommute.current) return
    closingCommute.current = true
    closeCommute(open).finally(() => { closingCommute.current = false })
  }, [activeEntryId, open, closeCommute])

  async function arrive() {
    if (busy || !open) return
    setBusy(true)
    try { await closeCommute(open) } finally { setBusy(false) }
  }

  // Auto-stop a stale travel leg (worker never tapped Arrived) with a flag for the
  // manager. Geostamp at the current location determines the mileage.
  const closeAndFlag = useCallback(async (seg: Segment) => {
    try {
      const loc = await readCurrentLocation()
      let miles: number | null = null, source = 'straight_line'
      if (seg.start_lat != null && seg.start_lng != null) {
        const r = await milesBetween(seg.start_lat, seg.start_lng, loc.lat, loc.lng); miles = r.miles; source = r.source
      }
      await supabase.from('travel_segments').update({
        ended_at: new Date().toISOString(), end_lat: loc.lat, end_lng: loc.lng, miles, miles_source: source,
        flagged: true, flag_reason: 'no arrival tap within travel window',
      }).eq('id', seg.id)
      await load()
    } catch (e) { console.warn('auto-flag failed', e) }
  }, [load])

  // Hours a leg has been open, and the overdue thresholds (warn at window, stop 5 min later).
  const openHours = open && !open.ended_at ? (Date.now() - new Date(open.started_at).getTime()) / 3_600_000 : 0
  const isCommuteLeg = open?.kind === 'commute_to' || open?.kind === 'commute_from'
  const overdueWarn = isCommuteLeg && openHours >= travelWindowHours && ackOpenId !== open?.id
  const overdueStop = isCommuteLeg && openHours >= travelWindowHours + 5 / 60 && ackOpenId !== open?.id

  useEffect(() => {
    if (overdueStop && open && !autoFlagging.current) {
      autoFlagging.current = true
      closeAndFlag(open).finally(() => { autoFlagging.current = false })
    }
  }, [overdueStop, open, closeAndFlag])

  // Transfer: split time to the destination project — origin ends and destination begins
  // at the moment Transfer was tapped, so travel time counts toward the new project.
  async function completeTransfer(destProjectId: number) {
    if (busy || !open) return
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) throw new Error('Not signed in')
      const loc = await readCurrentLocation()
      let miles: number | null = null, source = 'straight_line'
      if (open.start_lat != null && open.start_lng != null) {
        const r = await milesBetween(open.start_lat, open.start_lng, loc.lat, loc.lng); miles = r.miles; source = r.source
      }
      const splitAt = open.started_at   // the transfer tap time
      // 1. End the origin entry at the transfer tap.
      if (activeEntryId) {
        await supabase.from('time_entries').update({ clock_out_time: splitAt }).eq('id', activeEntryId)
      }
      // 2. Start the destination entry backdated to the transfer tap (travel time = destination).
      await supabase.from('time_entries').insert({
        project_id: destProjectId, user_id: uid, user_name: userName,
        clock_in_time: splitAt, clock_in_lat: loc.lat, clock_in_lng: loc.lng,
      })
      // 3. Close the travel segment with miles + destination.
      await supabase.from('travel_segments').update({
        ended_at: new Date().toISOString(), end_lat: loc.lat, end_lng: loc.lng,
        miles, miles_source: source, project_id: destProjectId,
      }).eq('id', open.id)
      await load()
      onChanged?.()
      Alert.alert(t(language, 'travel'), t(language, 'transferDone'))
    } catch (e: any) { Alert.alert(t(language, 'error'), e?.message || t(language, 'somethingWrong')) } finally { setBusy(false) }
  }

  if (loading) return null
  const onClock = !!activeEntryId

  return (
    <View style={{ backgroundColor: COLORS.card, borderRadius: 20, padding: 18, marginTop: 16, borderWidth: 1, borderColor: COLORS.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Ionicons name="car-outline" size={22} color={COLORS.navy} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>{t(language, 'travel')}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.navy }}>{totalMiles.toFixed(1)} {t(language, 'milesToday')}</Text>
      </View>

      {/* Vehicle toggle — personal (default) or company. Only own-vehicle miles are paid. */}
      {!open && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {([['personal', true], ['company', false]] as const).map(([labelKey, val]) => {
            const active = ownVehicle === val
            return (
              <Pressable key={labelKey} onPress={() => setOwnVehicle(val)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 2, borderColor: active ? COLORS.teal : COLORS.border, backgroundColor: active ? COLORS.tealSoft : COLORS.background }}>
                <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={active ? COLORS.teal : COLORS.subtext} />
                <Text style={{ color: active ? COLORS.teal : COLORS.subtext, fontWeight: '800', fontSize: 13 }}>
                  {labelKey === 'personal' ? t(language, 'vehiclePersonal') : t(language, 'vehicleCompany')}
                </Text>
              </Pressable>
            )
          })}
        </View>
      )}

      {/* Overdue travel warning — "still traveling?" */}
      {overdueWarn && open && (
        <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <Text style={{ color: '#92400E', fontWeight: '800', marginBottom: 8 }}>{t(language, 'travelTimeoutWarning')}</Text>
          <Pressable onPress={() => setAckOpenId(open.id)}
            style={{ backgroundColor: '#92400E', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: 'white', fontWeight: '800' }}>{t(language, 'stillTraveling')}</Text>
          </Pressable>
        </View>
      )}

      {open && open.kind === 'transfer' ? (
        // Transferring — pick the destination jobsite.
        <View>
          <Text style={{ color: COLORS.subtext, marginBottom: 10, lineHeight: 20 }}>{t(language, 'transferringNote')}</Text>
          <Text style={{ color: COLORS.text, fontWeight: '700', marginBottom: 8 }}>{t(language, 'chooseDestination')}</Text>
          <ScrollView style={{ maxHeight: 220 }}>
            {projects.map((p) => (
              <Pressable key={p.id} onPress={() => completeTransfer(p.id)} disabled={busy}
                style={{ backgroundColor: busy ? '#E5E7EB' : COLORS.green, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="flag" size={18} color={COLORS.white} />
                <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: '700', flex: 1 }} numberOfLines={1}>{p.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : open ? (
        // Open commute leg — Arrived.
        <View>
          <Text style={{ color: COLORS.subtext, marginBottom: 10, lineHeight: 20 }}>
            {open.kind === 'commute_to' ? t(language, 'confirmArriveWork') : `${t(language, 'travelingSince')} ${formatTime(open.started_at)}`}
          </Text>
          <Pressable onPress={arrive} disabled={busy}
            style={{ backgroundColor: busy ? '#94A3B8' : COLORS.green, borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {busy ? <ActivityIndicator color={COLORS.white} /> : <Ionicons name="flag" size={20} color={COLORS.white} />}
            <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>{t(language, 'tapWhenArrived')}</Text>
          </Pressable>
        </View>
      ) : onClock ? (
        // Clocked in — Transfer Site (or Leave Work, done via the Clock button).
        <View>
          <Text style={{ color: COLORS.subtext, marginBottom: 10, lineHeight: 20 }}>{t(language, 'travelHint')}</Text>
          <Pressable onPress={() => startSegment('transfer', ownVehicle)} disabled={busy}
            style={{ backgroundColor: busy ? '#94A3B8' : COLORS.navy, borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <Ionicons name="swap-horizontal" size={20} color={COLORS.white} />
            <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>{t(language, 'transferSite')}</Text>
          </Pressable>
        </View>
      ) : (
        // Not clocked in — start travel to work, or log the trip home.
        <View>
          <Text style={{ color: COLORS.subtext, marginBottom: 10, lineHeight: 20 }}>{t(language, 'travelToWorkHint')}</Text>
          <Pressable onPress={() => startSegment('commute_to', ownVehicle)} disabled={busy}
            style={{ backgroundColor: busy ? '#94A3B8' : COLORS.navy, borderRadius: 16, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            <Ionicons name="navigate" size={20} color={COLORS.white} />
            <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>{t(language, 'startTravelWork')}</Text>
          </Pressable>
          <Pressable onPress={() => startSegment('commute_from', ownVehicle)} disabled={busy}
            style={{ backgroundColor: '#F1F5F9', borderRadius: 16, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <Ionicons name="home-outline" size={18} color={COLORS.navy} />
            <Text style={{ color: COLORS.navy, fontSize: 15, fontWeight: '700' }}>{t(language, 'leaveWork')}</Text>
          </Pressable>
        </View>
      )}

      {closed.length > 0 ? (
        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 }}>
          {closed.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={{ color: COLORS.subtext, fontSize: 13 }}>
                {s.kind === 'commute_to' ? '🚗 ' : s.kind === 'commute_from' ? '🏠 ' : '🔄 '}
                {formatTime(s.started_at)} → {formatTime(s.ended_at as string)}
              </Text>
              <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: '700' }}>{(Number(s.miles) || 0).toFixed(1)} mi</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
