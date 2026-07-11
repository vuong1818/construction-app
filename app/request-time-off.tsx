import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import DatePickerField from '../components/DatePickerField'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

type TimeOff = {
  id: number
  start_date: string
  end_date: string
  reason: string | null
  status: string
  partial: boolean | null
  start_time: string | null
  end_time: string | null
}

function fmtRange(r: TimeOff): string {
  const f = (d: string) => { try { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return d } }
  const t12 = (t: string | null) => {
    if (!t) return ''
    const [h, m] = t.split(':').map(Number)
    const d = new Date(); d.setHours(h, m, 0, 0)
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  if (r.partial) return `${f(r.start_date)} · ${t12(r.start_time)} – ${t12(r.end_time)}`
  return r.start_date === r.end_date ? f(r.start_date) : `${f(r.start_date)} – ${f(r.end_date)}`
}

function toHHMM(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function hhmmToDate(s: string) {
  const [h, m] = (s || '09:00').split(':').map(Number)
  const d = new Date(); d.setHours(h || 9, m || 0, 0, 0); return d
}
function fmt12(s: string) {
  return hhmmToDate(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function RequestTimeOff() {
  const { t } = useLanguage()
  const [uid, setUid] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [reqStart, setReqStart] = useState('')
  const [reqEnd, setReqEnd] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('12:00')
  const [showStart, setShowStart] = useState(false)
  const [showEnd, setShowEnd] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<TimeOff[]>([])
  const [companyName, setCompanyName] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/sign-in'); return }
      setUid(user.id)
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
      setName(prof?.full_name || '')
      try {
        const { data: co } = await supabase.from('company_settings').select('company_name, company_email').order('id', { ascending: true }).limit(1).maybeSingle()
        setCompanyName(co?.company_name || ''); setCompanyEmail(co?.company_email || '')
      } catch { /* branding best-effort */ }
      await load(user.id)
    })()
  }, [])

  async function load(id: string) {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase.from('time_off_requests').select('*').eq('user_id', id).gte('end_date', today).order('start_date', { ascending: true })
    setItems((data as TimeOff[]) || [])
  }

  async function submit() {
    if (!uid) return
    if (!reqStart) { Alert.alert(t('error'), t('pickStartDate')); return }
    const partial = mode === 'partial'
    const end = partial ? reqStart : (reqEnd || reqStart)
    if (!partial && end < reqStart) { Alert.alert(t('error'), t('endBeforeStart')); return }
    if (partial && endTime <= startTime) { Alert.alert(t('error'), t('endTimeBeforeStart')); return }
    setBusy(true)
    const { error } = await supabase.from('time_off_requests').insert({
      user_id: uid, user_name: name || null, start_date: reqStart, end_date: end,
      reason: reason.trim() || null,
      partial, start_time: partial ? `${startTime}:00` : null, end_time: partial ? `${endTime}:00` : null,
    })
    setBusy(false)
    if (error) { Alert.alert(t('error'), error.message); return }
    // Notify the manager (fire-and-forget). Include the hours for partial requests.
    const emailReason = partial ? `${fmt12(startTime)}–${fmt12(endTime)}${reason.trim() ? ' · ' + reason.trim() : ''}` : reason.trim()
    fetch('https://www.nguyenmep.com/api/portal/notify-timeoff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerName: name, startDate: reqStart, endDate: end, reason: emailReason, companyName, companyEmail }),
    }).catch(() => {})
    setReqStart(''); setReqEnd(''); setReason(''); setStartTime('09:00'); setEndTime('12:00')
    Alert.alert(t('requestTimeOff'), t('timeOffSubmitted'))
    await load(uid)
  }

  async function cancel(id: number) {
    if (!uid) return
    await supabase.from('time_off_requests').delete().eq('id', id)
    await load(uid)
  }

  const lbl = { fontSize: 12, fontWeight: '700' as const, color: COLORS.subtext, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 5 }
  const card = { backgroundColor: COLORS.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 }
  const timeBtn = { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14 }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
      <View style={{ backgroundColor: COLORS.navy, paddingHorizontal: 20, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.white} />
        </Pressable>
        <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: '900' }}>{t('requestTimeOff')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={card}>
          {/* Full day(s) vs partial hours */}
          <View style={{ flexDirection: 'row', backgroundColor: COLORS.background, borderRadius: 14, padding: 4, marginBottom: 16 }}>
            {(['full', 'partial'] as const).map(m => {
              const active = mode === m
              return (
                <Pressable key={m} onPress={() => setMode(m)} style={{ flex: 1, paddingVertical: 10, borderRadius: 11, backgroundColor: active ? COLORS.navy : 'transparent', alignItems: 'center' }}>
                  <Text style={{ color: active ? COLORS.white : COLORS.subtext, fontWeight: '800' }}>{m === 'full' ? t('fullDays') : t('fewHours')}</Text>
                </Pressable>
              )
            })}
          </View>

          {mode === 'full' ? (
            <>
              <Text style={lbl}>{t('firstDayOff')}</Text>
              <DatePickerField value={reqStart} onChange={setReqStart} placeholder={t('firstDayOff')} />
              <Text style={lbl}>{t('lastDayOff')}</Text>
              <DatePickerField value={reqEnd} onChange={setReqEnd} placeholder={t('lastDayOff')} allowClear />
            </>
          ) : (
            <>
              <Text style={lbl}>{t('dayOff')}</Text>
              <DatePickerField value={reqStart} onChange={setReqStart} placeholder={t('dayOff')} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={lbl}>{t('fromTime')}</Text>
                  <Pressable style={timeBtn} onPress={() => setShowStart(true)}>
                    <Text style={{ color: COLORS.text, fontSize: 15 }}>{fmt12(startTime)}</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={lbl}>{t('toTime')}</Text>
                  <Pressable style={timeBtn} onPress={() => setShowEnd(true)}>
                    <Text style={{ color: COLORS.text, fontSize: 15 }}>{fmt12(endTime)}</Text>
                  </Pressable>
                </View>
              </View>
              {showStart && (
                <DateTimePicker value={hhmmToDate(startTime)} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_e, d) => { if (Platform.OS !== 'ios') setShowStart(false); if (d) setStartTime(toHHMM(d)) }} />
              )}
              {showEnd && (
                <DateTimePicker value={hhmmToDate(endTime)} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_e, d) => { if (Platform.OS !== 'ios') setShowEnd(false); if (d) setEndTime(toHHMM(d)) }} />
              )}
              {Platform.OS === 'ios' && (showStart || showEnd) && (
                <Pressable onPress={() => { setShowStart(false); setShowEnd(false) }} style={{ alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 10, marginBottom: 8 }}>
                  <Text style={{ color: COLORS.navy, fontWeight: '800' }}>{t('confirm')}</Text>
                </Pressable>
              )}
            </>
          )}

          <Text style={lbl}>{t('reasonOptional')}</Text>
          <TextInput style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, fontSize: 15, color: COLORS.text, marginBottom: 14 }}
            value={reason} onChangeText={setReason} placeholder={t('reasonExample')} placeholderTextColor={COLORS.subtext} />

          <Pressable onPress={submit} disabled={busy} style={{ backgroundColor: busy ? '#94A3B8' : COLORS.navy, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
            {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 15 }}>{t('requestDaysOff')}</Text>}
          </Pressable>
        </View>

        {items.length > 0 && (
          <View style={card}>
            <Text style={lbl}>{t('upcomingTimeOff')}</Text>
            {items.map(r => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '700' }}>{fmtRange(r)}</Text>
                  {r.reason ? <Text style={{ color: COLORS.subtext, fontSize: 13 }}>{r.reason}</Text> : null}
                </View>
                <Text style={{ color: COLORS.subtext, fontSize: 12, fontWeight: '700', marginRight: 12, textTransform: 'capitalize' }}>{r.status}</Text>
                <Pressable onPress={() => cancel(r.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color="#B71C1C" />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
