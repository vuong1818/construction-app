import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native'
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
  start_lat: number | null
  start_lng: number | null
  start_photo_url: string | null
  end_photo_url: string | null
  start_address: string | null
  end_address: string | null
}

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

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) { setLoading(false); return }
      const { start } = await currentWorkWeekBounds()
      const { data } = await supabase.from('travel_segments')
        .select('id, started_at, ended_at, miles, start_lat, start_lng, start_photo_url, end_photo_url, start_address, end_address')
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
        </View>
      )}

      {done.length > 0 && (
        <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 }}>
          <Text style={{ color: COLORS.subtext, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            {t(language, 'tripsThisWeek')}
          </Text>
          {done.slice(0, 6).map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }}>
              <Text style={{ color: COLORS.text, fontWeight: '700', width: 44 }}>{formatDay(s.started_at)}</Text>
              <Text style={{ color: COLORS.subtext, fontSize: 13, flex: 1 }} numberOfLines={1}>
                {formatTime(s.started_at)} → {s.ended_at ? formatTime(s.ended_at) : ''}
              </Text>
              <Text style={{ color: COLORS.navy, fontWeight: '800' }}>{(Number(s.miles) || 0).toFixed(1)} mi</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
