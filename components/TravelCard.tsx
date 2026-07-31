import { Ionicons } from '@expo/vector-icons'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
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

/** null = adding a new trip by hand; a Segment = editing that trip. */
type TripEdit = { seg: Segment | null; kind: Kind; miles: string; note: string }

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}
function formatDay(iso: string): string {
  try { return new Date(iso).toLocaleDateString([], { weekday: 'short' }) } catch { return '' }
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
 */
export default function TravelCard({ userName, language }: { userName: string | null; language: LanguageCode }) {
  const [segments, setSegments] = useState<Segment[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [threshold, setThreshold] = useState(0)
  const [edit, setEdit] = useState<TripEdit | null>(null)

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
        supabase.from('company_settings').select('mileage_threshold_miles').order('id', { ascending: true }).limit(1).maybeSingle(),
      ])
      setSegments((data as Segment[]) || [])
      setThreshold(Number((cs as any)?.mileage_threshold_miles || 0))
    } catch (e) { console.warn('travel load failed', e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const open = useMemo(() => segments.find((s) => !s.ended_at) || null, [segments])
  const done = useMemo(() => segments.filter((s) => s.ended_at), [segments])

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

  /** Save a hand-entered trip, or correct the type/miles/note on a logged one. */
  async function saveEdit() {
    if (!edit || busy) return
    const miles = Number(edit.miles)
    if (!Number.isFinite(miles) || miles < 0) {
      Alert.alert(t(language, 'error'), t(language, 'tripMilesInvalid'))
      return
    }
    setBusy(true)
    try {
      const note = edit.note.trim() || null
      if (edit.seg) {
        // Correcting a logged trip — the GPS points and stamps stay as they are.
        const { error } = await supabase.from('travel_segments')
          .update({ kind: edit.kind, miles, miles_source: 'manual', note, flagged: false })
          .eq('id', edit.seg.id)
        if (error) throw error
      } else {
        const { data: { session } } = await supabase.auth.getSession()
        const uid = session?.user?.id
        if (!uid) throw new Error('Not signed in')
        const now = new Date().toISOString()
        const { error } = await supabase.from('travel_segments').insert({
          user_id: uid, user_name: userName, kind: edit.kind,
          started_at: now, ended_at: now, miles, miles_source: 'manual', note,
        })
        if (error) throw error
      }
      setEdit(null)
      await load()
    } catch (e: any) {
      Alert.alert(t(language, 'error'), e?.message || t(language, 'somethingWrong'))
    } finally { setBusy(false) }
  }

  function confirmDelete(seg: Segment) {
    Alert.alert(t(language, 'deleteTrip'), t(language, 'deleteTripConfirm'), [
      { text: t(language, 'cancel'), style: 'cancel' },
      {
        text: t(language, 'deleteTrip'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true)
          try {
            const { error } = await supabase.from('travel_segments').delete().eq('id', seg.id)
            if (error) throw error
            setEdit(null)
            await load()
          } catch (e: any) {
            Alert.alert(t(language, 'error'), e?.message || t(language, 'somethingWrong'))
          } finally { setBusy(false) }
        },
      },
    ])
  }

  if (loading) return null

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
        <View>
          <Pressable onPress={() => setPicking(true)} disabled={busy}
            style={{ backgroundColor: busy ? '#94A3B8' : COLORS.green, borderRadius: 16, paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {busy ? <ActivityIndicator color={COLORS.white} /> : <Ionicons name="navigate" size={22} color={COLORS.white} />}
            <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '800' }}>{t(language, 'startTrip')}</Text>
          </Pressable>
          <Pressable onPress={() => setEdit({ seg: null, kind: 'transfer', miles: '', note: '' })} disabled={busy}
            style={{ paddingVertical: 12, alignItems: 'center', marginTop: 4 }}>
            <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 14 }}>{t(language, 'addTrip')}</Text>
          </Pressable>
        </View>
      )}

      {done.length > 0 && (
        <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 }}>
          <Text style={{ color: COLORS.subtext, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            {t(language, 'tripsThisWeek')}
          </Text>
          {done.slice(0, 8).map((s) => {
            const driven = Number(s.miles) || 0
            const paid = payable(s)
            return (
              <Pressable key={s.id}
                onPress={() => setEdit({ seg: s, kind: (s.kind as Kind) || 'transfer', miles: String(driven), note: s.note || '' })}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', width: 44 }}>{formatDay(s.started_at)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{kindLabel(s.kind)}</Text>
                  <Text style={{ color: COLORS.subtext, fontSize: 11 }} numberOfLines={1}>
                    {s.miles_source === 'manual' && !s.start_lat
                      ? t(language, 'manualTrip')
                      : `${formatTime(s.started_at)} → ${s.ended_at ? formatTime(s.ended_at) : ''}`}
                    {s.note ? ` · ${s.note}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', marginRight: 6 }}>
                  <Text style={{ color: COLORS.navy, fontWeight: '800' }}>{paid.toFixed(1)} mi</Text>
                  {driven > paid && <Text style={{ color: COLORS.subtext, fontSize: 11 }}>{driven.toFixed(1)} {t(language, 'milesDriven')}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.subtext} />
              </Pressable>
            )
          })}
        </View>
      )}

      {/* Add / edit a trip by hand — for a drive the worker forgot to log, or a
          bad GPS reading that needs correcting. */}
      <Modal visible={!!edit} transparent animationType="slide" onRequestClose={() => setEdit(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 22, maxHeight: '90%' }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={{ color: COLORS.navy, fontSize: 20, fontWeight: '800', marginBottom: 16 }}>
                {edit?.seg ? t(language, 'editTrip') : t(language, 'addTrip')}
              </Text>

              <Text style={{ color: COLORS.subtext, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>{t(language, 'chooseTripType')}</Text>
              {KINDS.map(({ kind, labelKey }) => {
                const active = edit?.kind === kind
                return (
                  <Pressable key={kind} onPress={() => setEdit((e) => (e ? { ...e, kind } : e))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 2, marginBottom: 6, borderColor: active ? COLORS.teal : COLORS.border, backgroundColor: active ? COLORS.tealSoft : 'transparent' }}>
                    <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? COLORS.teal : COLORS.subtext} />
                    <Text style={{ color: active ? COLORS.teal : COLORS.text, fontWeight: '700', flex: 1 }}>{t(language, labelKey)}</Text>
                    <Text style={{ color: COLORS.subtext, fontSize: 11, fontWeight: '700' }}>
                      {thresholdApplies(kind) ? t(language, 'thresholdApplies') : t(language, 'paidInFull')}
                    </Text>
                  </Pressable>
                )
              })}

              <Text style={{ color: COLORS.subtext, fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 6 }}>{t(language, 'tripMiles')}</Text>
              <TextInput
                value={edit?.miles ?? ''}
                onChangeText={(v) => setEdit((e) => (e ? { ...e, miles: v } : e))}
                keyboardType="decimal-pad"
                placeholder="0.0"
                style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 14 }}
              />

              <Text style={{ color: COLORS.subtext, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>{t(language, 'tripNote')}</Text>
              <TextInput
                value={edit?.note ?? ''}
                onChangeText={(v) => setEdit((e) => (e ? { ...e, note: v } : e))}
                placeholder="—"
                style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text, marginBottom: 18 }}
              />

              <Pressable onPress={saveEdit} disabled={busy}
                style={{ backgroundColor: busy ? '#94A3B8' : COLORS.green, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '800' }}>{t(language, 'saveTrip')}</Text>
              </Pressable>

              {edit?.seg && (
                <Pressable onPress={() => confirmDelete(edit.seg!)} disabled={busy}
                  style={{ borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.red, marginBottom: 10 }}>
                  <Text style={{ color: COLORS.red, fontSize: 15, fontWeight: '800' }}>{t(language, 'deleteTrip')}</Text>
                </Pressable>
              )}

              <Pressable onPress={() => setEdit(null)} style={{ paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: COLORS.subtext, fontWeight: '700' }}>{t(language, 'cancel')}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}
