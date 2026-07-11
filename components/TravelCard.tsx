import { Ionicons } from '@expo/vector-icons'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { distanceMeters, drivingDistanceMeters, normalizeState, readCurrentLocation, stateForLocation } from '../lib/clockLocation'
import { t, type LanguageCode } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

const ROAD_FACTOR = 1.3
const METERS_PER_MILE = 1609.344

type Kind = 'commute_to' | 'commute_from' | 'transfer'
type Segment = {
  id: number
  kind: Kind | null
  started_at: string
  ended_at: string | null
  miles: number | null
  start_lat: number | null
  start_lng: number | null
  project_id: number | null
  out_of_state: boolean | null
}
type Project = { id: number; name: string }

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}

/**
 * Travel = the clock-in/clock-out mechanism (available to everyone; using it hides the
 * normal clock button).
 *   Clocked out → "Start Travel to Work" (safety-gated RED/GREEN) + Personal/Company vehicle
 *   → "Tap When Arrived" → opens the clock-in screen (pick site, geofence check).
 *   Clocked in → "Leave Work" | "Transfer Site". Transfer auto-clocks-out A and immediately
 *   clocks into B (so the drive is PAID at B); "Tap When Arrived" then logs the transfer
 *   miles. Leave Work auto-clocks-out then "Tap When Arrived" at home.
 * Mileage: in-state commute legs reimburse miles OVER the threshold; out-of-state legs and
 * transfers reimburse in FULL; own-vehicle only → gas. In-state legs with no arrival tap
 * within the window auto-stop with a flag; out-of-state legs have no cutoff.
 */
export default function TravelCard({
  activeEntryId, projects, userName, language, safetyOk, onRequestClockIn, onOpenLegChange, onChanged,
}: {
  activeEntryId: number | null
  projects: Project[]
  userName: string | null
  language: LanguageCode
  safetyOk: boolean
  onRequestClockIn: (destProjectId?: number) => void
  onOpenLegChange?: (hasOpen: boolean) => void
  onChanged?: () => void
}) {
  const [segments, setSegments] = useState<Segment[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [ownVehicle, setOwnVehicle] = useState(true)
  const [transferPicking, setTransferPicking] = useState(false)
  const [homeState, setHomeState] = useState<string | null>(null)
  const [hrsIn, setHrsIn] = useState(1)
  const [hrsOut, setHrsOut] = useState(2)
  const [ackOpenId, setAckOpenId] = useState<number | null>(null)
  const closing = useRef(false)
  const autoFlagging = useRef(false)

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) { setLoading(false); return }
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const [{ data }, { data: prof }, { data: cs }] = await Promise.all([
        supabase.from('travel_segments')
          .select('id, kind, started_at, ended_at, miles, start_lat, start_lng, project_id, out_of_state')
          .eq('user_id', uid).gte('started_at', start.toISOString()).order('started_at', { ascending: true }),
        supabase.from('profiles').select('home_state').eq('id', uid).maybeSingle(),
        supabase.from('company_settings').select('travel_hours_in_state, travel_hours_out_of_state').order('id', { ascending: true }).limit(1).maybeSingle(),
      ])
      setSegments((data as Segment[]) || [])
      setHomeState(normalizeState((prof as any)?.home_state) || null)
      const i = Number((cs as any)?.travel_hours_in_state), o = Number((cs as any)?.travel_hours_out_of_state)
      if (Number.isFinite(i) && i > 0) setHrsIn(i)
      if (Number.isFinite(o) && o > 0) setHrsOut(o)
    } catch (e) { console.warn('travel load failed', e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load, activeEntryId])

  const open = segments.find((s) => !s.ended_at) || null
  const closed = segments.filter((s) => s.ended_at)
  const totalMiles = segments.reduce((sum, s) => sum + (Number(s.miles) || 0), 0)

  // Tell the parent whether a travel leg is in progress (so it can hide the clock button).
  useEffect(() => { onOpenLegChange?.(!!open) }, [open, onOpenLegChange])

  async function milesBetween(sLat: number, sLng: number, eLat: number, eLng: number): Promise<{ miles: number; source: string }> {
    const driving = await drivingDistanceMeters(sLat, sLng, eLat, eLng)
    if (driving != null) return { miles: Math.round((driving / METERS_PER_MILE) * 10) / 10, source: 'routing' }
    const meters = distanceMeters(sLat, sLng, eLat, eLng)
    return { miles: Math.round((meters / METERS_PER_MILE) * ROAD_FACTOR * 10) / 10, source: 'straight_line' }
  }

  async function computeOutOfState(startLat: number, startLng: number, destState: string | null): Promise<boolean> {
    if (!destState) return false
    try {
      const s = normalizeState(await stateForLocation(startLat, startLng))
      return !!(s && destState && s !== destState)
    } catch { return false }
  }

  async function projectState(projectId: number): Promise<string | null> {
    try {
      const { data } = await supabase.from('projects').select('state').eq('id', projectId).maybeSingle()
      return normalizeState((data as any)?.state) || null
    } catch { return null }
  }

  // Start "Travel to Work" (commute_to) — travel first, clock in on arrival.
  async function startCommuteTo() {
    if (busy || !safetyOk) return
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) throw new Error('Not signed in')
      const loc = await readCurrentLocation()
      const { error } = await supabase.from('travel_segments').insert({
        user_id: uid, user_name: userName, kind: 'commute_to', own_vehicle: ownVehicle, out_of_state: false,
        started_at: new Date().toISOString(), start_lat: loc.lat, start_lng: loc.lng,
      })
      if (error) throw error
      await load()
    } catch (e: any) { Alert.alert(t(language, 'error'), e?.message || t(language, 'somethingWrong')) } finally { setBusy(false) }
  }

  // Leave Work — auto clock-out, then travel home; arrival taps closes with miles.
  async function leaveWork() {
    if (busy) return
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) throw new Error('Not signed in')
      const loc = await readCurrentLocation()
      const oos = await computeOutOfState(loc.lat, loc.lng, homeState)
      if (activeEntryId) await supabase.from('time_entries').update({ clock_out_time: new Date().toISOString() }).eq('id', activeEntryId)
      const { error } = await supabase.from('travel_segments').insert({
        user_id: uid, user_name: userName, kind: 'commute_from', own_vehicle: ownVehicle, out_of_state: oos,
        started_at: new Date().toISOString(), start_lat: loc.lat, start_lng: loc.lng,
      })
      if (error) throw error
      await load(); onChanged?.()
    } catch (e: any) { Alert.alert(t(language, 'error'), e?.message || t(language, 'somethingWrong')) } finally { setBusy(false) }
  }

  // Transfer — auto clock-out A and immediately clock into B (paid drive), then the leg
  // logs the transfer miles when the worker taps arrived at B.
  async function pickTransfer(destId: number) {
    if (busy) return
    setBusy(true)
    setTransferPicking(false)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) throw new Error('Not signed in')
      const loc = await readCurrentLocation()
      const destState = await projectState(destId)
      const oos = await computeOutOfState(loc.lat, loc.lng, destState)
      const now = new Date().toISOString()
      // 1. Clock out the current shift at the transfer tap.
      if (activeEntryId) await supabase.from('time_entries').update({ clock_out_time: now }).eq('id', activeEntryId)
      // 2. Clock into the new project NOW — the drive counts as worked time at the destination.
      await supabase.from('time_entries').insert({
        project_id: destId, user_id: uid, user_name: userName,
        clock_in_time: now, clock_in_lat: loc.lat, clock_in_lng: loc.lng,
      })
      // 3. Open the transfer leg (miles logged when arrived is tapped).
      await supabase.from('travel_segments').insert({
        user_id: uid, user_name: userName, kind: 'transfer', own_vehicle: ownVehicle, out_of_state: oos,
        project_id: destId, started_at: now, start_lat: loc.lat, start_lng: loc.lng,
      })
      await load(); onChanged?.()
    } catch (e: any) { Alert.alert(t(language, 'error'), e?.message || t(language, 'somethingWrong')) } finally { setBusy(false) }
  }

  const closeLeg = useCallback(async (seg: Segment, flagged = false) => {
    try {
      const loc = await readCurrentLocation()
      let miles: number | null = null, source = 'straight_line'
      if (seg.start_lat != null && seg.start_lng != null) {
        const r = await milesBetween(seg.start_lat, seg.start_lng, loc.lat, loc.lng); miles = r.miles; source = r.source
      }
      await supabase.from('travel_segments').update({
        ended_at: new Date().toISOString(), end_lat: loc.lat, end_lng: loc.lng, miles, miles_source: source,
        ...(flagged ? { flagged: true, flag_reason: 'no arrival tap within travel window' } : {}),
      }).eq('id', seg.id)
      await load()
    } catch (e: any) { if (!flagged) Alert.alert(t(language, 'error'), e?.message || t(language, 'somethingWrong')) }
  }, [load, language])

  // A commute_to leg closes when the worker clocks in on arrival. (Transfer legs are
  // already clocked in — they close on the arrival tap, below.)
  useEffect(() => {
    if (!activeEntryId || !open || closing.current || open.kind !== 'commute_to') return
    closing.current = true
    closeLeg(open).finally(() => { closing.current = false })
  }, [activeEntryId, open, closeLeg])

  // Timeout — in-state legs only. Warn at the window, auto-stop 5 min later with a flag.
  const openHours = open && !open.ended_at ? (Date.now() - new Date(open.started_at).getTime()) / 3_600_000 : 0
  const windowHrs = open?.out_of_state ? hrsOut : hrsIn
  const cutoffApplies = !!open && !open.out_of_state
  const overdueWarn = cutoffApplies && openHours >= windowHrs && ackOpenId !== open?.id
  const overdueStop = cutoffApplies && openHours >= windowHrs + 5 / 60 && ackOpenId !== open?.id

  useEffect(() => {
    if (overdueStop && open && !autoFlagging.current) {
      autoFlagging.current = true
      closeLeg(open, true).finally(() => { autoFlagging.current = false })
    }
  }, [overdueStop, open, closeLeg])

  async function arrive() {
    if (busy || !open) return
    if (open.kind === 'commute_to') { onRequestClockIn(); return }   // open clock-in screen
    setBusy(true)
    try { await closeLeg(open) } finally { setBusy(false) }           // transfer / home: just log miles
  }

  if (loading) return null
  const onClock = !!activeEntryId

  return (
    <View style={{ backgroundColor: COLORS.card, borderRadius: 20, padding: 18, marginTop: 16, borderWidth: 1, borderColor: COLORS.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Ionicons name="car-outline" size={22} color={COLORS.navy} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>{t(language, 'travel')}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.navy }}>{totalMiles.toFixed(1)} {t(language, 'milesToday')}</Text>
      </View>

      {!open && !transferPicking && (
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

      {overdueWarn && open && (
        <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <Text style={{ color: '#92400E', fontWeight: '800', marginBottom: 8 }}>{t(language, 'travelTimeoutWarning')}</Text>
          <Pressable onPress={() => setAckOpenId(open.id)} style={{ backgroundColor: '#92400E', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: 'white', fontWeight: '800' }}>{t(language, 'stillTraveling')}</Text>
          </Pressable>
        </View>
      )}

      {transferPicking ? (
        <View>
          <Text style={{ color: COLORS.text, fontWeight: '700', marginBottom: 8 }}>{t(language, 'chooseDestination')}</Text>
          <ScrollView style={{ maxHeight: 220 }}>
            {projects.map((p) => (
              <Pressable key={p.id} onPress={() => pickTransfer(p.id)} disabled={busy}
                style={{ backgroundColor: busy ? '#E5E7EB' : COLORS.navy, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="flag" size={18} color={COLORS.white} />
                <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: '700', flex: 1 }} numberOfLines={1}>{p.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={() => setTransferPicking(false)} style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: COLORS.subtext, fontWeight: '700' }}>{t(language, 'cancel')}</Text>
          </Pressable>
        </View>
      ) : open ? (
        <View>
          <Text style={{ color: COLORS.subtext, marginBottom: 10, lineHeight: 20 }}>
            {open.kind === 'commute_from' ? `${t(language, 'travelingSince')} ${formatTime(open.started_at)}` : t(language, 'confirmArriveWork')}
          </Text>
          <Pressable onPress={arrive} disabled={busy}
            style={{ backgroundColor: busy ? '#94A3B8' : COLORS.green, borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {busy ? <ActivityIndicator color={COLORS.white} /> : <Ionicons name="flag" size={20} color={COLORS.white} />}
            <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>{t(language, 'tapWhenArrived')}</Text>
          </Pressable>
        </View>
      ) : onClock ? (
        <View style={{ gap: 8 }}>
          <Pressable onPress={leaveWork} disabled={busy}
            style={{ backgroundColor: busy ? '#94A3B8' : COLORS.navy, borderRadius: 16, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <Ionicons name="home-outline" size={18} color={COLORS.white} />
            <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>{t(language, 'leaveWork')}</Text>
          </Pressable>
          <Pressable onPress={() => setTransferPicking(true)} disabled={busy}
            style={{ backgroundColor: '#F1F5F9', borderRadius: 16, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <Ionicons name="swap-horizontal" size={18} color={COLORS.navy} />
            <Text style={{ color: COLORS.navy, fontSize: 15, fontWeight: '700' }}>{t(language, 'transferSite')}</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <Pressable onPress={startCommuteTo} disabled={busy || !safetyOk}
            style={{ backgroundColor: !safetyOk ? COLORS.red : busy ? '#94A3B8' : COLORS.green, borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <Ionicons name={safetyOk ? 'navigate' : 'lock-closed'} size={20} color={COLORS.white} />
            <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>{t(language, 'startTravelWork')}</Text>
          </Pressable>
          {!safetyOk && <Text style={{ color: COLORS.red, fontSize: 13, marginTop: 8, fontWeight: '700', textAlign: 'center' }}>{t(language, 'travelSafetyBlocked')}</Text>}
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
