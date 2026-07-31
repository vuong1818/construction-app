import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { addressForLocation, distanceMeters, drivingDistanceMeters, readCurrentLocation } from '../lib/clockLocation'
import { t, type LanguageCode } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'
import { currentWorkWeekBounds } from '../lib/workWeek'

const ROAD_FACTOR = 1.3
const METERS_PER_MILE = 1609.344
const TRIP_BUCKET = 'trip-photos'

type Segment = {
  id: number
  started_at: string
  ended_at: string | null
  miles: number | null
  miles_source: string | null
  note: string | null
  start_lat: number | null
  start_lng: number | null
  start_photo_url: string | null
  end_photo_url: string | null
  start_address: string | null
  end_address: string | null
}

/** null = adding a new trip by hand; a Segment = editing that trip. */
type TripEdit = { seg: Segment | null; miles: string; note: string }

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}
function formatDay(iso: string): string {
  try { return new Date(iso).toLocaleDateString([], { weekday: 'short' }) } catch { return '' }
}

/**
 * Travel — deliberately independent of the time clock.
 *
 *   Start Trip → take a photo of where you are; we stamp GPS + time onto the trip.
 *   End Trip   → take a photo of where you finished; miles = driving distance between
 *                the two stamped points.
 *
 * Clocking in and out is untouched by any of this: a worker can be on or off the clock
 * and the trip buttons behave the same. Reimbursement is one formula per trip, applied
 * in payroll: (miles - threshold) x rate.
 */
export default function TravelCard({ userName, language }: { userName: string | null; language: LanguageCode }) {
  const [segments, setSegments] = useState<Segment[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<TripEdit | null>(null)

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) { setLoading(false); return }
      const { start } = await currentWorkWeekBounds()
      const { data } = await supabase.from('travel_segments')
        .select('id, started_at, ended_at, miles, miles_source, note, start_lat, start_lng, start_photo_url, end_photo_url, start_address, end_address')
        .eq('user_id', uid)
        .gte('started_at', start.toISOString())
        .order('started_at', { ascending: false })
      setSegments((data as Segment[]) || [])
    } catch (e) { console.warn('travel load failed', e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const open = useMemo(() => segments.find((s) => !s.ended_at) || null, [segments])
  const weekMiles = useMemo(() => segments.reduce((sum, s) => sum + (Number(s.miles) || 0), 0), [segments])
  const done = useMemo(() => segments.filter((s) => s.ended_at), [segments])

  /** Camera → GPS → address → upload. Returns null if the worker backed out of the camera. */
  async function captureGeoPhoto(uid: string, which: 'start' | 'end') {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(t(language, 'permissionNeeded'), t(language, 'allowCamera'))
      return null
    }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 })
    if (shot.canceled || !shot.assets?.length) return null

    // Stamp the position at the moment the photo was taken, not before it.
    const loc = await readCurrentLocation()
    const address = await addressForLocation(loc.lat, loc.lng)

    // The photo is proof, not a blocker — a failed upload still logs the trip point.
    let url: string | null = null
    try {
      const path = `${uid}/${Date.now()}-${which}.jpg`
      const resp = await fetch(shot.assets[0].uri)
      const bytes = await resp.arrayBuffer()
      const { error } = await supabase.storage.from(TRIP_BUCKET).upload(path, bytes, {
        contentType: 'image/jpeg', upsert: false,
      })
      if (!error) url = supabase.storage.from(TRIP_BUCKET).getPublicUrl(path).data.publicUrl
    } catch { /* keep the coordinates even if the image never lands */ }

    return { lat: loc.lat, lng: loc.lng, address, url }
  }

  async function startTrip() {
    if (busy || open) return
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) throw new Error('Not signed in')
      const point = await captureGeoPhoto(uid, 'start')
      if (!point) return
      const { error } = await supabase.from('travel_segments').insert({
        user_id: uid, user_name: userName, kind: 'trip',
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
      const point = await captureGeoPhoto(uid, 'end')
      if (!point) return

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
      Alert.alert(t(language, 'tripSaved'), `${(miles ?? 0).toFixed(1)} ${t(language, 'tripMilesLogged')}`)
    } catch (e: any) {
      Alert.alert(t(language, 'error'), e?.message || t(language, 'somethingWrong'))
    } finally { setBusy(false) }
  }

  /** Save a hand-entered trip, or correct the miles/note on a logged one. */
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
        // Correcting a logged trip — the GPS points and photos stay as they are.
        const { error } = await supabase.from('travel_segments')
          .update({ miles, miles_source: 'manual', note, flagged: false })
          .eq('id', edit.seg.id)
        if (error) throw error
      } else {
        const { data: { session } } = await supabase.auth.getSession()
        const uid = session?.user?.id
        if (!uid) throw new Error('Not signed in')
        const now = new Date().toISOString()
        const { error } = await supabase.from('travel_segments').insert({
          user_id: uid, user_name: userName, kind: 'trip',
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Ionicons name="car-outline" size={22} color={COLORS.navy} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>{t(language, 'travel')}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.navy }}>
          {weekMiles.toFixed(1)} {t(language, 'milesThisWeek')}
        </Text>
      </View>
      <Text style={{ color: COLORS.subtext, fontSize: 13, lineHeight: 19, marginBottom: 14 }}>
        {t(language, 'tripHint')}
      </Text>

      {open ? (
        <View>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'center' }}>
            {open.start_photo_url ? (
              <Image source={{ uri: open.start_photo_url }} style={{ width: 56, height: 56, borderRadius: 12 }} />
            ) : (
              <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="image-outline" size={22} color={COLORS.subtext} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontWeight: '800' }}>
                {t(language, 'tripInProgress')} · {formatTime(open.started_at)}
              </Text>
              {!!open.start_address && (
                <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{open.start_address}</Text>
              )}
            </View>
          </View>
          <Pressable onPress={endTrip} disabled={busy}
            style={{ backgroundColor: busy ? '#94A3B8' : COLORS.red, borderRadius: 16, paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {busy ? <ActivityIndicator color={COLORS.white} /> : <Ionicons name="camera" size={22} color={COLORS.white} />}
            <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '800' }}>{t(language, 'endTrip')}</Text>
          </Pressable>
          <Text style={{ color: COLORS.subtext, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
            {t(language, 'takeEndPhoto')}
          </Text>
        </View>
      ) : (
        <View>
          <Pressable onPress={startTrip} disabled={busy}
            style={{ backgroundColor: busy ? '#94A3B8' : COLORS.green, borderRadius: 16, paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {busy ? <ActivityIndicator color={COLORS.white} /> : <Ionicons name="camera" size={22} color={COLORS.white} />}
            <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '800' }}>{t(language, 'startTrip')}</Text>
          </Pressable>
          <Text style={{ color: COLORS.subtext, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
            {t(language, 'takeStartPhoto')}
          </Text>
          <Pressable onPress={() => setEdit({ seg: null, miles: '', note: '' })} disabled={busy}
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
          {done.slice(0, 8).map((s) => (
            <Pressable key={s.id} onPress={() => setEdit({ seg: s, miles: String(Number(s.miles) || 0), note: s.note || '' })}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ color: COLORS.text, fontWeight: '700', width: 44 }}>{formatDay(s.started_at)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.subtext, fontSize: 13 }} numberOfLines={1}>
                  {s.miles_source === 'manual' && !s.start_photo_url
                    ? t(language, 'manualTrip')
                    : `${formatTime(s.started_at)} → ${s.ended_at ? formatTime(s.ended_at) : ''}`}
                </Text>
                {!!s.note && <Text style={{ color: COLORS.subtext, fontSize: 11 }} numberOfLines={1}>{s.note}</Text>}
              </View>
              <Text style={{ color: COLORS.navy, fontWeight: '800', marginRight: 6 }}>{(Number(s.miles) || 0).toFixed(1)} mi</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.subtext} />
            </Pressable>
          ))}
        </View>
      )}

      {/* Add / edit a trip by hand — for a drive the worker forgot to log, or a
          bad GPS reading that needs correcting. */}
      <Modal visible={!!edit} transparent animationType="slide" onRequestClose={() => setEdit(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 22 }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={{ color: COLORS.navy, fontSize: 20, fontWeight: '800', marginBottom: 16 }}>
                {edit?.seg ? t(language, 'editTrip') : t(language, 'addTrip')}
              </Text>

              <Text style={{ color: COLORS.subtext, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>{t(language, 'tripMiles')}</Text>
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
