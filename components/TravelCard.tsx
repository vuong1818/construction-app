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
 * Travel = the clock-in/clock-out mechanism for worker/supervisor.
 *   Clocked out → "Start Travel to Work" (safety-gated: RED blocked / GREEN ok) with a
 *   Personal/Company vehicle toggle → "Tap When Arrived" → opens the clock-in screen.
 *   Clocked in → "Leave Work" or "Transfer Site". Transfer auto-clocks-out, picks the new
 *   project, then "Tap When Arrived" clocks in at the new site. Leave Work auto-clocks-out
 *   then "Tap When Arrived" at home. Miles over the threshold (commute) or in full
 *   (transfer) reimburse as gas; only own-vehicle miles pay. A leg with no arrival tap
 *   within the configured window auto-stops with a flag.
 */
export default function TravelCard({
  activeEntryId, projects, userName, language, safetyOk, onRequestClockIn, onChanged,
}: {
  activeEntryId: number | null
  projects: Project[]
  userName: string | null
  language: LanguageCode
  safetyOk: boolean
  onRequestClockIn: (destProjectId?: number) => void
  onChanged?: () => void
}) {
  const [segments, setSegments] = useState<Segment[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [ownVehicle, setOwnVehicle] = useState(true)          // personal is the default
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

  async function milesBetween(sLat: number, sLng: number, eLat: number, eLng: number): Promise<{ miles: number; source: string }> {
    const driving = await drivingDistanceMeters(sLat, sLng, eLat, eLng)
    if (driving != null) return { miles: Math.round((driving / METERS_PER_MILE) * 10) / 10, source: 'routing' }
    const meters = distanceMeters(sLat, sLng, eLat, eLng)
    return { miles: Math.round((meters / METERS_PER_MILE) * ROAD_FACTOR * 10) / 10, source: 'straight_line' }
  }

  // Best-effort out-of-state at leg start: start GPS state vs the known destination state
  // (dest project for a transfer, home for a leave-work leg; unknown for commute-to).
  async function computeOutOfState(startLat: number, startLng: number, destState: string | null): Promise<boolean> {
    if (!destState) return false
    try {
      const s = normalizeState(await stateForLocation(startLat, startLng))
      return !!(s && destState && s !== destState)
    } catch { return false }
  }

  async function startLeg(kind: Kind, opts: { destProjectId?: number | null; destState?: string | null; clockOutEntryId?: number | null } = {}) {
    if (busy) return
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) throw new Error('Not signed in')
      const loc = await readCurrentLocation()
      const outOfState = await computeOutOfState(loc.lat, loc.lng, opts.destState ?? null)
      // Auto clock-out the current shift (transfer / leave-work) at the tap moment.
      if (opts.clockOutEntryId) {
        await supabase.from('time_entries').update({ clock_out_time: new Date().toISOString() }).eq('id', opts.clockOutEntryId)
      }
      const { error } = await supabase.from('travel_segments').insert({
        user_id: uid, user_name: userName,
        kind, own_vehicle: ownVehicle, out_of_state: outOfState,
        project_id: opts.destProjectId ?? null,
        started_at: new Date().toISOString(), start_lat: loc.lat, start_lng: loc.lng,
      })
      if (error) throw error
      await load()
      if (opts.clockOutEntryId) onChanged?.()
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

  // When the worker clocks in after arriving (commute_to / transfer), close the open leg
  // so its miles are captured start → clock-in location.
  useEffect(() => {
    if (!activeEntryId || !open || closing.current) return
    if (open.kind !== 'commute_to' && open.kind !== 'transfer') return
    closing.current = true
    closeLeg(open).finally(() => { closing.current = false })
  }, [activeEntryId, open, closeLeg])

  // Timeout: warn at the window, auto-stop 5 min later with a flag.
  const openHours = open && !open.ended_at ? (Date.now() - new Date(open.started_at).getTime()) / 3_600_000 : 0
  const windowHrs = open?.out_of_state ? hrsOut : hrsIn
  const overdueWarn = !!open && openHours >= windowHrs && ackOpenId !== open?.id
  const overdueStop = !!open && openHours >= windowHrs + 5 / 60 && ackOpenId !== open?.id

  useEffect(() => {
    if (overdueStop && open && !autoFlagging.current) {
      autoFlagging.current = true
      closeLeg(open, true).finally(() => { autoFlagging.current = false })
    }
  }, [overdueStop, open, closeLeg])

  async function arrive() {
    if (busy || !open) return
    if (open.kind === 'commute_to' || open.kind === 'transfer') {
      // Open the clock-in screen; the leg closes when the shift starts.
      onRequestClockIn(open.project_id ?? undefined)
      return
    }
    setBusy(true)
    try { await closeLeg(open) } finally { setBusy(false) }
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

      {/* Vehicle toggle — shown before starting a leg. */}
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

      {/* Overdue "still traveling?" warning */}
      {overdueWarn && open && (
        <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <Text style={{ color: '#92400E', fontWeight: '800', marginBottom: 8 }}>{t(language, 'travelTimeoutWarning')}</Text>
          <Pressable onPress={() => setAckOpenId(open.id)} style={{ backgroundColor: '#92400E', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: 'white', fontWeight: '800' }}>{t(language, 'stillTraveling')}</Text>
          </Pressable>
        </View>
      )}

      {transferPicking ? (
        // Transfer — pick the destination jobsite (clocks out here, travels, clocks in there).
        <View>
          <Text style={{ color: COLORS.text, fontWeight: '700', marginBottom: 8 }}>{t(language, 'chooseDestination')}</Text>
          <ScrollView style={{ maxHeight: 220 }}>
            {projects.map((p) => (
              <Pressable key={p.id} onPress={() => { setTransferPicking(false); startLeg('transfer', { destProjectId: p.id, destState: null, clockOutEntryId: activeEntryId }) }} disabled={busy}
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
        // Traveling — Tap When Arrived (opens clock-in for commute/transfer; closes for home).
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
        // Clocked in — Leave Work or Transfer Site.
        <View style={{ gap: 8 }}>
          <Pressable onPress={() => startLeg('commute_from', { destState: homeState, clockOutEntryId: activeEntryId })} disabled={busy}
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
        // Clocked out — Start Travel to Work (safety-gated RED/GREEN).
        <View>
          <Pressable onPress={() => safetyOk && startLeg('commute_to')} disabled={busy || !safetyOk}
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
