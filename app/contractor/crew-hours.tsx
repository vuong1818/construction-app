// Crew hours, for the person who runs a contractor company.
//
// A contractor manager is not a manager of this company — they run one
// subcontractor outfit inside it. They see their own crew and nobody else's,
// and the jobs their company is on BY THE HOUR: a lump-sum job is a price, and
// nobody clocks into a price.
//
// Every restriction here is also a database policy (manages_contractor_hours),
// so this screen is the convenient way to do it, never the thing that makes it
// safe: a crafted request from this account still cannot touch another
// company's time.
//
// Hours typed here are manually_added, which is what exempts them from the
// safety-acknowledgement trigger — that guard is about somebody clocking
// themselves in, not about an office correcting a timesheet after the fact.

import DateTimePicker from '@react-native-community/datetimepicker'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, Alert, Modal, Pressable, RefreshControl,
  ScrollView, Text, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'
import { calculateHours, getWorkWeekRange } from '../../lib/time'

type Crew = { id: string; full_name: string | null; role: string; status: string | null }
type Job = { id: number; name: string }
type Entry = {
  id: number
  user_id: string
  user_name: string | null
  project_id: number | null
  clock_in_time: string
  clock_out_time: string | null
}

type Draft = {
  id: number | null
  user_id: string
  project_id: number | null
  start: Date
  end: Date
}

const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

export default function CrewHoursScreen() {
  const router = useRouter()
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [crew, setCrew] = useState<Crew[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [weekOffset, setWeekOffset] = useState(0)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [picking, setPicking] = useState<null | 'date' | 'start' | 'end'>(null)
  const [saving, setSaving] = useState(false)

  const week = useMemo(() => {
    const base = new Date()
    base.setDate(base.getDate() + weekOffset * 7)
    return getWorkWeekRange(base)
  }, [weekOffset])

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth?.user?.id
    if (!uid) { setAllowed(false); setLoading(false); return }

    const { data: me } = await supabase
      .from('profiles')
      .select('id, role, subcontractor_id')
      .eq('id', uid)
      .maybeSingle()

    if (me?.role !== 'contractor_manager' || !me?.subcontractor_id) {
      setAllowed(false); setLoading(false); return
    }
    setAllowed(true)
    setCompanyId(me.subcontractor_id)

    const [{ data: co }, { data: people }, { data: assigned }] = await Promise.all([
      supabase.from('subcontractors').select('company').eq('id', me.subcontractor_id).maybeSingle(),
      supabase.from('profiles')
        .select('id, full_name, role, status')
        .eq('subcontractor_id', me.subcontractor_id)
        .order('full_name'),
      // Hourly jobs only. A lump-sum assignment is a price, not a timesheet.
      supabase.from('project_contractor_companies')
        .select('project_id')
        .eq('subcontractor_id', me.subcontractor_id)
        .eq('pay_basis', 'hourly'),
    ])

    setCompanyName(co?.company || '')
    const live = (people || []).filter(p => p.status !== 'terminated') as Crew[]
    setCrew(live)

    const jobIds = (assigned || []).map(a => a.project_id)
    if (jobIds.length) {
      const { data: projs } = await supabase.from('projects').select('id, name').in('id', jobIds).order('name')
      setJobs((projs || []) as Job[])
    } else {
      setJobs([])
    }

    if (live.length) {
      const { data: te } = await supabase
        .from('time_entries')
        .select('id, user_id, user_name, project_id, clock_in_time, clock_out_time')
        .in('user_id', live.map(p => p.id))
        .gte('clock_in_time', week.weekStart.toISOString())
        .lte('clock_in_time', week.weekEnd.toISOString())
        .order('clock_in_time')
      setEntries((te || []) as Entry[])
    } else {
      setEntries([])
    }
    setLoading(false)
  }, [week.weekStart, week.weekEnd])

  useEffect(() => { load() }, [load])

  const hoursOf = (e: Entry) => calculateHours(e.clock_in_time, e.clock_out_time)
  const weekTotal = entries.reduce((s, e) => s + hoursOf(e), 0)
  const jobName = (id: number | null) => jobs.find(j => j.id === id)?.name || '—'

  function openNew() {
    if (!crew.length) { Alert.alert(t('crewHours'), t('noCrewYet')); return }
    if (!jobs.length) { Alert.alert(t('crewHours'), t('noHourlyJobs')); return }
    const day = new Date(week.weekStart)
    const today = new Date()
    if (today >= week.weekStart && today <= week.weekEnd) day.setTime(today.getTime())
    const start = new Date(day); start.setHours(7, 0, 0, 0)
    const end = new Date(day); end.setHours(15, 30, 0, 0)
    setDraft({ id: null, user_id: crew[0].id, project_id: jobs[0].id, start, end })
  }

  function openEdit(e: Entry) {
    setDraft({
      id: e.id,
      user_id: e.user_id,
      project_id: e.project_id,
      start: new Date(e.clock_in_time),
      end: e.clock_out_time ? new Date(e.clock_out_time) : new Date(e.clock_in_time),
    })
  }

  async function save() {
    if (!draft) return
    if (!draft.user_id) { Alert.alert(t('crewHours'), t('pickWorker')); return }
    if (!draft.project_id) { Alert.alert(t('crewHours'), t('pickJob')); return }
    if (draft.end <= draft.start) { Alert.alert(t('crewHours'), t('endBeforeStart')); return }

    setSaving(true)
    const person = crew.find(c => c.id === draft.user_id)
    const payload = {
      user_id: draft.user_id,
      user_name: person?.full_name ?? null,
      project_id: draft.project_id,
      clock_in_time: draft.start.toISOString(),
      clock_out_time: draft.end.toISOString(),
      // Typed in, not clocked — this is what the safety guard checks.
      manually_added: true,
    }
    const { error } = draft.id
      ? await supabase.from('time_entries').update(payload).eq('id', draft.id)
      : await supabase.from('time_entries').insert(payload)
    setSaving(false)
    if (error) { Alert.alert(t('error'), error.message); return }
    setDraft(null)
    await load()
  }

  async function remove() {
    if (!draft?.id) return
    Alert.alert(t('deleteShift'), t('deleteShiftConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('time_entries').delete().eq('id', draft.id!)
          if (error) { Alert.alert(t('error'), error.message); return }
          setDraft(null)
          await load()
        },
      },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.teal} />
      </SafeAreaView>
    )
  }

  if (allowed === false) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.text, textAlign: 'center', fontSize: 16, lineHeight: 24 }}>
          {t('notContractorManager')}
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 18, backgroundColor: COLORS.navy, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 }}>
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>{t('back')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const chip = (on: boolean) => ({
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 8, marginBottom: 8,
    backgroundColor: on ? COLORS.navy : COLORS.white,
    borderWidth: 1, borderColor: on ? COLORS.navy : '#dde3ee',
  })
  const chipText = (on: boolean) => ({ color: on ? COLORS.white : COLORS.text, fontWeight: '700' as const })

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false) }} />}
      >
        {/* Week */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Pressable onPress={() => setWeekOffset(o => o - 1)} hitSlop={12}
            style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: '#dde3ee' }}>
            <Text style={{ fontWeight: '800', color: COLORS.navy, fontSize: 18 }}>←</Text>
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontWeight: '800', color: COLORS.navy }}>
              {fmtDay(week.weekStart)} – {fmtDay(week.weekEnd)}
            </Text>
            <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
              {companyName} · {weekTotal.toFixed(2)} h
            </Text>
          </View>
          <Pressable onPress={() => setWeekOffset(o => Math.min(0, o + 1))} hitSlop={12} disabled={weekOffset >= 0}
            style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: '#dde3ee', opacity: weekOffset >= 0 ? 0.35 : 1 }}>
            <Text style={{ fontWeight: '800', color: COLORS.navy, fontSize: 18 }}>→</Text>
          </Pressable>
        </View>

        <Pressable onPress={openNew}
          style={{ backgroundColor: COLORS.navy, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 16 }}>＋ {t('addShift')}</Text>
        </Pressable>

        {crew.length === 0 && (
          <Text style={{ color: COLORS.muted, textAlign: 'center', marginTop: 24 }}>{t('noCrewYet')}</Text>
        )}

        {crew.map(person => {
          const mine = entries.filter(e => e.user_id === person.id)
          const total = mine.reduce((s, e) => s + hoursOf(e), 0)
          return (
            <View key={person.id} style={{ backgroundColor: COLORS.white, borderRadius: 16, padding: 14, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontWeight: '800', color: COLORS.navy, fontSize: 16, flex: 1 }}>
                  {person.full_name || '—'}
                  {person.role === 'contractor_manager' ? ' ★' : ''}
                </Text>
                <Text style={{ fontWeight: '800', color: COLORS.navy }}>{total.toFixed(2)} h</Text>
              </View>

              {mine.length === 0 ? (
                <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 8 }}>{t('noShiftsThisWeek')}</Text>
              ) : mine.map(e => (
                <Pressable key={e.id} onPress={() => openEdit(e)}
                  style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eef2f7', flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontWeight: '700' }}>{fmtDay(e.clock_in_time)}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                      {jobName(e.project_id)} · {fmtTime(e.clock_in_time)} – {e.clock_out_time ? fmtTime(e.clock_out_time) : '…'}
                    </Text>
                  </View>
                  <Text style={{ fontWeight: '800', color: COLORS.navy }}>{hoursOf(e).toFixed(2)} h</Text>
                </Pressable>
              ))}
            </View>
          )
        })}
      </ScrollView>

      {/* The editor */}
      <Modal visible={!!draft} animationType="slide" transparent onRequestClose={() => setDraft(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: COLORS.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, maxHeight: '90%' }}>
            <ScrollView>
              <Text style={{ fontWeight: '900', fontSize: 18, color: COLORS.navy, marginBottom: 14 }}>
                {draft?.id ? t('editShift') : t('addShift')}
              </Text>

              <Text style={{ fontWeight: '700', color: COLORS.text, marginBottom: 8 }}>{t('worker')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {crew.map(c => {
                  const on = draft?.user_id === c.id
                  return (
                    <Pressable key={c.id} onPress={() => setDraft(d => d && ({ ...d, user_id: c.id }))} style={chip(on)}>
                      <Text style={chipText(on)}>{c.full_name}</Text>
                    </Pressable>
                  )
                })}
              </View>

              <Text style={{ fontWeight: '700', color: COLORS.text, marginTop: 12, marginBottom: 8 }}>{t('job')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {jobs.map(j => {
                  const on = draft?.project_id === j.id
                  return (
                    <Pressable key={j.id} onPress={() => setDraft(d => d && ({ ...d, project_id: j.id }))} style={chip(on)}>
                      <Text style={chipText(on)}>{j.name}</Text>
                    </Pressable>
                  )
                })}
              </View>

              {(['date', 'start', 'end'] as const).map(which => (
                <View key={which} style={{ marginTop: 12 }}>
                  <Text style={{ fontWeight: '700', color: COLORS.text, marginBottom: 6 }}>
                    {which === 'date' ? t('date') : which === 'start' ? t('startTime') : t('endTime')}
                  </Text>
                  <Pressable onPress={() => setPicking(which)}
                    style={{ backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: '#dde3ee', padding: 14 }}>
                    <Text style={{ color: COLORS.navy, fontWeight: '700' }}>
                      {!draft ? '' : which === 'date' ? fmtDay(draft.start) : fmtTime(which === 'start' ? draft.start : draft.end)}
                    </Text>
                  </Pressable>
                </View>
              ))}

              {draft && (
                <Text style={{ color: COLORS.muted, marginTop: 12 }}>
                  {t('hoursLabel')}: {Math.max(0, (draft.end.getTime() - draft.start.getTime()) / 3600000).toFixed(2)}
                </Text>
              )}

              <Pressable onPress={save} disabled={saving}
                style={{ backgroundColor: COLORS.navy, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 18, opacity: saving ? 0.6 : 1 }}>
                <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 16 }}>{t('save')}</Text>
              </Pressable>

              {draft?.id != null && (
                <Pressable onPress={remove}
                  style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#f3c2c2' }}>
                  <Text style={{ color: COLORS.red, fontWeight: '800' }}>{t('deleteShift')}</Text>
                </Pressable>
              )}

              <Pressable onPress={() => setDraft(null)}
                style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 6 }}>
                <Text style={{ color: COLORS.muted, fontWeight: '700' }}>{t('cancel')}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {picking && draft && (
        <DateTimePicker
          value={picking === 'end' ? draft.end : draft.start}
          mode={picking === 'date' ? 'date' : 'time'}
          onChange={(_e, picked) => {
            setPicking(null)
            if (!picked) return
            setDraft(d => {
              if (!d) return d
              if (picking === 'date') {
                // Moving the day moves both ends of the shift, so a 7–3:30 keeps
                // being 7–3:30 on the new day.
                const start = new Date(d.start), end = new Date(d.end)
                start.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate())
                end.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate())
                return { ...d, start, end }
              }
              const target = new Date(picking === 'start' ? d.start : d.end)
              target.setHours(picked.getHours(), picked.getMinutes(), 0, 0)
              return picking === 'start' ? { ...d, start: target } : { ...d, end: target }
            })
          }}
        />
      )}
    </SafeAreaView>
  )
}
