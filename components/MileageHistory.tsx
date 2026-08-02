import { Ionicons } from '@expo/vector-icons'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { t, type LanguageCode } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'
import { thresholdApplies } from './TravelCard'

/**
 * Mileage history — the worker's own trip log, and the only place a trip can be
 * corrected, deleted or added by hand.
 *
 * The home-screen Travel card is the action (Start Trip / End Trip); this is the
 * record. They used to both show the week's trips, which meant two lists to keep
 * in step and no clear answer to "where do I fix a bad reading?".
 *
 * Paid miles use the same rule as payroll: home↔jobsite legs pay
 * (miles − threshold), site-to-site transfers pay every mile.
 */

type Kind = 'commute_to' | 'commute_from' | 'transfer'
const KINDS: { kind: Kind; labelKey: 'tripHomeToJobsite' | 'tripJobsiteToHome' | 'tripTransferSite' }[] = [
  { kind: 'commute_to', labelKey: 'tripHomeToJobsite' },
  { kind: 'commute_from', labelKey: 'tripJobsiteToHome' },
  { kind: 'transfer', labelKey: 'tripTransferSite' },
]

type Segment = {
  id: number
  kind: string | null
  started_at: string
  ended_at: string | null
  miles: number | null
  miles_source: string | null
  note: string | null
  start_lat: number | null
}

/** null = adding a trip by hand; a Segment = correcting that trip. */
type TripEdit = { seg: Segment | null; kind: Kind; miles: string; note: string }

const DAYS_BACK = 60

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' }
}
function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}

export default function MileageHistory({ userName, language }: { userName: string | null; language: LanguageCode }) {
  const [segments, setSegments] = useState<Segment[]>([])
  const [threshold, setThreshold] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<TripEdit | null>(null)

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) { setLoading(false); return }
      const since = new Date()
      since.setDate(since.getDate() - DAYS_BACK)
      const [{ data }, { data: cs }] = await Promise.all([
        supabase.from('travel_segments')
          .select('id, kind, started_at, ended_at, miles, miles_source, note, start_lat')
          .eq('user_id', uid)
          .not('ended_at', 'is', null)
          .gte('started_at', since.toISOString())
          .order('started_at', { ascending: false }),
        supabase.from('company_settings')
          .select('mileage_threshold_miles')
          .order('id', { ascending: true }).limit(1).maybeSingle(),
      ])
      setSegments((data as Segment[]) || [])
      setThreshold(Number((cs as any)?.mileage_threshold_miles || 0))
    } catch (e) { console.warn('mileage history load failed', e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const payable = useCallback((s: Segment) => {
    const m = Number(s.miles) || 0
    return thresholdApplies(s.kind) ? Math.max(0, m - threshold) : m
  }, [threshold])

  const totals = useMemo(() => ({
    driven: segments.reduce((sum, s) => sum + (Number(s.miles) || 0), 0),
    paid: segments.reduce((sum, s) => sum + payable(s), 0),
  }), [segments, payable])

  function kindLabel(kind: string | null): string {
    const match = KINDS.find((k) => k.kind === kind)
    return match ? t(language, match.labelKey) : t(language, 'tripTransferSite')
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

  if (loading) {
    return <View style={{ paddingVertical: 16, alignItems: 'center' }}><ActivityIndicator color={COLORS.navy} /></View>
  }

  return (
    <View>
      {segments.length === 0 ? (
        <Text style={{ color: COLORS.subtext, textAlign: 'center', paddingVertical: 10 }}>{t(language, 'mileageHistoryEmpty')}</Text>
      ) : (
        segments.map((s) => {
          const driven = Number(s.miles) || 0
          const paid = payable(s)
          return (
            <Pressable key={s.id}
              onPress={() => setEdit({ seg: s, kind: (s.kind as Kind) || 'transfer', miles: String(driven), note: s.note || '' })}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 13 }}>
                  🚗 {formatDate(s.started_at)} · {kindLabel(s.kind)}
                </Text>
                <Text style={{ color: COLORS.subtext, fontSize: 12 }} numberOfLines={1}>
                  {s.miles_source === 'manual' && !s.start_lat
                    ? t(language, 'manualTrip')
                    : `${formatTime(s.started_at)} → ${s.ended_at ? formatTime(s.ended_at) : ''}`}
                  {s.note ? ` · ${s.note}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', marginRight: 4 }}>
                <Text style={{ color: COLORS.navy, fontWeight: '800' }}>{paid.toFixed(1)} mi</Text>
                {driven > paid && <Text style={{ color: COLORS.subtext, fontSize: 11 }}>{driven.toFixed(1)} {t(language, 'milesDriven')}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.subtext} />
            </Pressable>
          )
        })
      )}

      {segments.length > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10 }}>
          <Text style={{ color: COLORS.text, fontWeight: '800' }}>{t(language, 'total')}</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: COLORS.green, fontWeight: '900' }}>{totals.paid.toFixed(1)} mi</Text>
            {totals.driven > totals.paid && (
              <Text style={{ color: COLORS.subtext, fontSize: 11 }}>{totals.driven.toFixed(1)} {t(language, 'milesDriven')}</Text>
            )}
          </View>
        </View>
      )}

      {/* Add a trip the worker forgot to log. Correcting one is the same form,
          reached by tapping the trip above. */}
      <Pressable onPress={() => setEdit({ seg: null, kind: 'transfer', miles: '', note: '' })} disabled={busy}
        style={{ paddingVertical: 12, alignItems: 'center', marginTop: 4 }}>
        <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 14 }}>{t(language, 'addTrip')}</Text>
      </Pressable>

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
