import { Ionicons } from '@expo/vector-icons'
import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { distanceMeters, drivingDistanceMeters, readCurrentLocation } from '../lib/clockLocation'
import { t, type LanguageCode } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

// Straight-line -> approximate driving distance. Roads wind, so real miles run
// ~20-30% longer than the crow-flies distance between the two GPS stamps.
const ROAD_FACTOR = 1.3
const METERS_PER_MILE = 1609.344

type Segment = {
  id: number
  started_at: string
  ended_at: string | null
  miles: number | null
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

/**
 * Travel / mileage tracker. Only shown while clocked in (travel time is already
 * paid; this logs miles for gas reimbursement). Tap Start to stamp the departure
 * point, Arrived to stamp the destination — miles come from the two points.
 */
export default function TravelCard({
  activeEntryId,
  userName,
  language,
}: {
  activeEntryId: number | null
  userName: string | null
  language: LanguageCode
}) {
  const [segments, setSegments] = useState<Segment[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) { setLoading(false); return }
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const { data } = await supabase
        .from('travel_segments')
        .select('id, started_at, ended_at, miles')
        .eq('user_id', uid)
        .gte('started_at', start.toISOString())
        .order('started_at', { ascending: true })
      setSegments(data || [])
    } catch (e) {
      console.warn('travel load failed', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, activeEntryId])

  const open = segments.find((s) => !s.ended_at) || null
  const closed = segments.filter((s) => s.ended_at)
  const totalMiles = segments.reduce((sum, s) => sum + (Number(s.miles) || 0), 0)

  async function startTravel() {
    if (busy) return
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) throw new Error('Not signed in')
      const loc = await readCurrentLocation()
      const { error } = await supabase.from('travel_segments').insert({
        user_id: uid,
        user_name: userName,
        time_entry_id: activeEntryId,
        started_at: new Date().toISOString(),
        start_lat: loc.lat,
        start_lng: loc.lng,
      })
      if (error) throw error
      await load()
    } catch (e: any) {
      Alert.alert(t(language, 'error'), e?.message || t(language, 'somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  async function arriveTravel() {
    if (busy || !open) return
    setBusy(true)
    try {
      const loc = await readCurrentLocation()
      const { data: seg } = await supabase
        .from('travel_segments')
        .select('start_lat, start_lng')
        .eq('id', open.id)
        .single()
      let miles: number | null = null
      let source = 'straight_line'
      if (seg?.start_lat != null && seg?.start_lng != null) {
        // Prefer real driving distance (Mapbox); fall back to straight-line x factor.
        const driving = await drivingDistanceMeters(seg.start_lat, seg.start_lng, loc.lat, loc.lng)
        if (driving != null) {
          miles = Math.round((driving / METERS_PER_MILE) * 10) / 10
          source = 'routing'
        } else {
          const meters = distanceMeters(seg.start_lat, seg.start_lng, loc.lat, loc.lng)
          miles = Math.round((meters / METERS_PER_MILE) * ROAD_FACTOR * 10) / 10
        }
      }
      const { error } = await supabase
        .from('travel_segments')
        .update({
          ended_at: new Date().toISOString(),
          end_lat: loc.lat,
          end_lng: loc.lng,
          miles,
          miles_source: source,
        })
        .eq('id', open.id)
      if (error) throw error
      await load()
    } catch (e: any) {
      Alert.alert(t(language, 'error'), e?.message || t(language, 'somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  // Always visible on the home screen so the crew knows it's there; the Start
  // button only enables while clocked in (travel time is paid on the clock).
  if (loading) return null
  const onClock = !!activeEntryId

  return (
    <View style={{ backgroundColor: COLORS.card, borderRadius: 20, padding: 18, marginTop: 16, borderWidth: 1, borderColor: COLORS.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Ionicons name="car-outline" size={22} color={COLORS.navy} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>{t(language, 'travel')}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.navy }}>
          {totalMiles.toFixed(1)} {t(language, 'milesToday')}
        </Text>
      </View>

      <Text style={{ color: COLORS.subtext, marginBottom: 12, lineHeight: 20 }}>
        {t(language, 'travelHint')}
      </Text>

      {!onClock ? (
        <Pressable
          disabled
          style={{ backgroundColor: '#CBD5E1', borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
        >
          <Ionicons name="navigate" size={20} color={COLORS.white} />
          <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>{t(language, 'startTravel')}</Text>
        </Pressable>
      ) : open ? (
        <Pressable
          onPress={arriveTravel}
          disabled={busy}
          style={{ backgroundColor: busy ? '#94A3B8' : COLORS.green, borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
        >
          {busy ? <ActivityIndicator color={COLORS.white} /> : <Ionicons name="flag" size={20} color={COLORS.white} />}
          <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>{t(language, 'arrived')}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={startTravel}
          disabled={busy}
          style={{ backgroundColor: busy ? '#94A3B8' : COLORS.navy, borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
        >
          {busy ? <ActivityIndicator color={COLORS.white} /> : <Ionicons name="navigate" size={20} color={COLORS.white} />}
          <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>{t(language, 'startTravel')}</Text>
        </Pressable>
      )}

      {!onClock ? (
        <Text style={{ color: COLORS.subtext, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
          {t(language, 'travelClockInFirst')}
        </Text>
      ) : open ? (
        <Text style={{ color: COLORS.subtext, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
          {t(language, 'travelingSince')} {formatTime(open.started_at)}
        </Text>
      ) : null}

      {closed.length > 0 ? (
        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 }}>
          {closed.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={{ color: COLORS.subtext, fontSize: 13 }}>
                {formatTime(s.started_at)} → {formatTime(s.ended_at as string)}
              </Text>
              <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: '700' }}>
                {(Number(s.miles) || 0).toFixed(1)} mi
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
