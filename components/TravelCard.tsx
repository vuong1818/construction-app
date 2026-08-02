import { Ionicons } from '@expo/vector-icons'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { addressForLocation, captureMapSnapshot, distanceMeters, drivingDistanceMeters, readCurrentLocation } from '../lib/clockLocation'
import { t, type LanguageCode } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'
import { currentWorkWeekBounds } from '../lib/workWeek'

const ROAD_FACTOR = 1.3
const METERS_PER_MILE = 1609.344

/** Home legs absorb the per-trip threshold; a site-to-site transfer is paid in full. */
type Kind = 'commute_to' | 'commute_from' | 'transfer'
const KINDS: { kind: Kind; labelKey: 'tripHomeToJobsite' | 'tripJobsiteToHome' | 'tripTransferSite'; icon: any }[] = [
  { kind: 'commute_to',   labelKey: 'tripHomeToJobsite', icon: 'business-outline' },
  { kind: 'commute_from', labelKey: 'tripJobsiteToHome', icon: 'home-outline' },
  { kind: 'transfer',     labelKey: 'tripTransferSite',  icon: 'swap-horizontal' },
]
export function thresholdApplies(kind: string | null): boolean {
  return kind !== 'transfer'
}

type Segment = {
  id: number
  kind: string | null
  started_at: string
  ended_at: string | null
  miles: number | null
  miles_source: string | null
  note: string | null
  start_lat: number | null
  start_lng: number | null
  start_address: string | null
  end_address: string | null
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}

/**
 * Travel — a plain mileage log, independent of the time clock.
 *
 *   Start Trip → pick the trip type, then GPS + time are stamped (same map snapshot
 *                the clock in/out uses — no camera, no photo to take).
 *   End Trip   → stamped again; miles = driving distance between the two points.
 *
 * Reimbursement, matching payroll: home↔jobsite legs pay (miles - threshold);
 * site-to-site transfers pay every mile. The header shows reimbursable miles for
 * the work week, with miles actually driven underneath.
 *
 * This card is the action only. The trip log — including correcting or deleting
 * a trip, and adding one by hand — lives in Profile → Mileage history, so the
 * home screen isn't a second copy of a list that already has a home.
 */
export default function TravelCard({ userName, language }: { userName: string | null; language: LanguageCode }) {
  const [segments, setSegments] = useState<Segment[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [threshold, setThreshold] = useState(0)
  const [enabled, setEnabled] = useState(true)

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) { setLoading(false); return }
      const { start } = await currentWorkWeekBounds()
      const [{ data }, { data: cs }] = await Promise.all([
        supabase.from('travel_segments')
          .select('id, kind, started_at, ended_at, miles, miles_source, note, start_lat, start_lng, start_address, end_address')
          .eq('user_id', uid)
          .gte('started_at', start.toISOString())
          .order('started_at', { ascending: false }),
        supabase.from('company_settings')
          .select('mileage_threshold_miles, feature_travel')
          .order('id', { ascending: true }).limit(1).maybeSingle(),
      ])
      setSegments((data as Segment[]) || [])
      setThreshold(Number((cs as any)?.mileage_threshold_miles || 0))
      // Travel is optional per tenant (web: Settings → Special Features). Default
      // ON so a failed read never hides a feature crews are relying on.
      setEnabled((cs as any)?.feature_travel !== false)
    } catch (e) { console.warn('travel load failed', e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const open = useMemo(() => segments.find((s) => !s.ended_at) || null, [segments])

  /** Reimbursable miles for one trip — the same formula payroll pays on. */
  const payable = useCallback((s: Segment) => {
    const m = Number(s.miles) || 0
    return thresholdApplies(s.kind) ? Math.max(0, m - threshold) : m
  }, [threshold])

  const weekMiles = useMemo(() => segments.reduce((sum, s) => sum + payable(s), 0), [segments, payable])
  const weekDriven = useMemo(() => segments.reduce((sum, s) => sum + (Number(s.miles) || 0), 0), [segments])

  function kindLabel(kind: string | null): string {
    const match = KINDS.find((k) => k.kind === kind)
    return match ? t(language, match.labelKey) : t(language, 'tripTransferSite')
  }

  /** GPS + reverse-geocoded address + the same map snapshot the clock in/out stamps. */
  async function stampPoint(uid: string, which: 'in' | 'out') {
    const loc = await readCurrentLocation()
    const [address, url] = await Promise.all([
      addressForLocation(loc.lat, loc.lng),
      captureMapSnapshot({ userId: uid, lat: loc.lat, lng: loc.lng, kind: which }),
    ])
    return { lat: loc.lat, lng: loc.lng, address, url }
  }

  async function startTrip(kind: Kind) {
    if (busy || open) return
    setPicking(false)
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) throw new Error('Not signed in')
      const point = await stampPoint(uid, 'in')
      const { error } = await supabase.from('travel_segments').insert({
        user_id: uid, user_name: userName, kind,
        started_at: new Date().toISOString(),
        start_lat: point.lat, start_lng: point.lng,
        start_photo_url: point.url, start_address: point.address,
      })
      if (error) throw error
      await load()
    } catch (e: any) {
      Alert.alert(t(language, 'error'), e?.message || t(language, 'somethingWrong'))
    } finally { setBusy(false) }
  }

  async function endTrip() {
    if (busy || !open) return
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) throw new Error('Not signed in')
      const point = await stampPoint(uid, 'out')

      let miles: number | null = null
      let source = 'straight_line'
      if (open.start_lat != null && open.start_lng != null) {
        const driving = await drivingDistanceMeters(open.start_lat, open.start_lng, point.lat, point.lng)
        if (driving != null) {
          miles = Math.round((driving / METERS_PER_MILE) * 10) / 10
          source = 'routing'
        } else {
          const meters = distanceMeters(open.start_lat, open.start_lng, point.lat, point.lng)
          miles = Math.round((meters / METERS_PER_MILE) * ROAD_FACTOR * 10) / 10
        }
      }

      const { error } = await supabase.from('travel_segments').update({
        ended_at: new Date().toISOString(),
        end_lat: point.lat, end_lng: point.lng,
        end_photo_url: point.url, end_address: point.address,
        miles, miles_source: source,
      }).eq('id', open.id)
      if (error) throw error
      await load()

      const paid = thresholdApplies(open.kind) ? Math.max(0, (miles ?? 0) - threshold) : (miles ?? 0)
      Alert.alert(
        t(language, 'tripSaved'),
        `${(miles ?? 0).toFixed(1)} ${t(language, 'tripMilesLogged')} · ${paid.toFixed(1)} ${t(language, 'tripMilesPaid')}`,
      )
    } catch (e: any) {
      Alert.alert(t(language, 'error'), e?.message || t(language, 'somethingWrong'))
    } finally { setBusy(false) }
  }

  // Feature switched off for this tenant — render nothing at all.
  if (loading || !enabled) return null

  return (
    <View style={{ backgroundColor: COLORS.card, borderRadius: 20, padding: 18, marginTop: 16, borderWidth: 1, borderColor: COLORS.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="car-outline" size={22} color={COLORS.navy} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>{t(language, 'travel')}</Text>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.navy }}>
            {weekMiles.toFixed(1)} {t(language, 'milesThisWeek')}
          </Text>
          {weekDriven > weekMiles && (
            <Text style={{ fontSize: 11, color: COLORS.subtext }}>{weekDriven.toFixed(1)} {t(language, 'milesDriven')}</Text>
          )}
        </View>
      </View>
      <Text style={{ color: COLORS.subtext, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 14 }}>
        {t(language, 'tripHint')}
      </Text>

      {open ? (
        <View>
          <View style={{ backgroundColor: COLORS.background, borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <Text style={{ color: COLORS.text, fontWeight: '800' }}>
              {kindLabel(open.kind)} · {formatTime(open.started_at)}
            </Text>
            {!!open.start_address && (
              <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{open.start_address}</Text>
            )}
          </View>
          <Pressable onPress={endTrip} disabled={busy}
            style={{ backgroundColor: busy ? '#94A3B8' : COLORS.red, borderRadius: 16, paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {busy ? <ActivityIndicator color={COLORS.white} /> : <Ionicons name="flag" size={22} color={COLORS.white} />}
            <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '800' }}>{t(language, 'endTrip')}</Text>
          </Pressable>
        </View>
      ) : picking ? (
        <View>
          <Text style={{ color: COLORS.text, fontWeight: '800', marginBottom: 4 }}>{t(language, 'chooseTripType')}</Text>
          <Text style={{ color: COLORS.subtext, fontSize: 12, lineHeight: 18, marginBottom: 10 }}>
            {t(language, 'tripTypeNote', { threshold: String(threshold) })}
          </Text>
          {KINDS.map(({ kind, labelKey, icon }) => (
            <Pressable key={kind} onPress={() => startTrip(kind)} disabled={busy}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.navy, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 14, marginBottom: 8 }}>
              <Ionicons name={icon} size={20} color={COLORS.white} />
              <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: '700', flex: 1 }}>{t(language, labelKey)}</Text>
              <Text style={{ color: '#A8C4EE', fontSize: 11, fontWeight: '700' }}>
                {thresholdApplies(kind) ? t(language, 'thresholdApplies') : t(language, 'paidInFull')}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setPicking(false)} style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: COLORS.subtext, fontWeight: '700' }}>{t(language, 'cancel')}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setPicking(true)} disabled={busy}
          style={{ backgroundColor: busy ? '#94A3B8' : COLORS.green, borderRadius: 16, paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {busy ? <ActivityIndicator color={COLORS.white} /> : <Ionicons name="navigate" size={22} color={COLORS.white} />}
          <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '800' }}>{t(language, 'startTrip')}</Text>
        </Pressable>
      )}
    </View>
  )
}
