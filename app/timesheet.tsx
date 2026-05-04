import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import DatePickerField from '../components/DatePickerField'
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS, TOUCH, TYPE } from '../lib/theme'
import { calculateHours, formatHours, formatTimeOnly, getTodayRange, getWorkWeekRange } from '../lib/time'

type Entry = {
  id: number
  user_id: string
  project_id: number | null
  clock_in_time: string | null
  clock_out_time: string | null
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_in_snapshot_url: string | null
  clock_out_snapshot_url: string | null
  clock_in_offsite: boolean | null
  clock_out_offsite: boolean | null
  clock_in_offsite_reason: string | null
  clock_out_offsite_reason: string | null
  clock_in_offsite_note: string | null
  clock_out_offsite_note: string | null
}

type Project = { id: number; name: string }

type Mode = 'day' | 'period' | 'custom'

const MS_DAY = 86_400_000

function toIso(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fromIso(s: string) {
  return new Date(s + 'T12:00:00')
}

function fmtDateLong(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateShort(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function TimesheetScreen() {
  const router = useRouter()
  const { t } = useLanguage()

  const [mode, setMode] = useState<Mode>('period')

  // Day mode anchor
  const [day, setDay] = useState(new Date())

  // Pay period mode anchor (any date inside the period)
  const [periodAnchor, setPeriodAnchor] = useState(new Date())

  // Custom range (ISO strings)
  const todayIso = toIso(new Date())
  const [customFrom, setCustomFrom] = useState(todayIso)
  const [customTo, setCustomTo]     = useState(todayIso)

  const [entries, setEntries] = useState<Entry[]>([])
  const [projects, setProjects] = useState<Record<number, Project>>({})
  const [loading, setLoading] = useState(true)
  const [snapshotPreview, setSnapshotPreview] = useState<string | null>(null)

  // Resolve the active range based on the current mode.
  const range = useMemo(() => {
    if (mode === 'day') {
      const r = getTodayRange(day)
      return { start: r.start, end: r.end, label: fmtDateLong(day) }
    }
    if (mode === 'period') {
      const r = getWorkWeekRange(periodAnchor)
      return { start: r.weekStart, end: r.weekEnd, label: `${fmtDateShort(r.weekStart)} – ${fmtDateShort(r.weekEnd)}` }
    }
    // custom
    const start = fromIso(customFrom); start.setHours(0, 0, 0, 0)
    const end   = fromIso(customTo);   end.setHours(23, 59, 59, 999)
    return { start, end, label: `${fmtDateShort(start)} – ${fmtDateShort(end)}` }
  }, [mode, day, periodAnchor, customFrom, customTo])

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/'); return }

    const { data: rows, error } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', user.id)
      .gte('clock_in_time', range.start.toISOString())
      .lte('clock_in_time', range.end.toISOString())
      .order('clock_in_time', { ascending: false })

    if (error) {
      console.warn('timesheet load failed', error)
      setEntries([])
      setLoading(false)
      return
    }

    const list = (rows || []) as Entry[]
    setEntries(list)

    const ids = Array.from(new Set(list.map(e => e.project_id).filter((x): x is number => x != null)))
    if (ids.length > 0) {
      const { data: ps } = await supabase.from('projects').select('id, name').in('id', ids)
      const map: Record<number, Project> = {}
      for (const p of (ps || [])) map[p.id] = p as Project
      setProjects(map)
    } else {
      setProjects({})
    }
    setLoading(false)
  }, [range.start.getTime(), range.end.getTime(), router])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch('time_entries', load)

  // Total hours (open entries count to "now").
  const totals = useMemo(() => {
    let totalMs = 0
    let openCount = 0
    for (const e of entries) {
      const start = e.clock_in_time ? new Date(e.clock_in_time).getTime() : 0
      const end   = e.clock_out_time ? new Date(e.clock_out_time).getTime() : Date.now()
      if (start) totalMs += Math.max(0, end - start)
      if (!e.clock_out_time) openCount++
    }
    const hours = totalMs / 3_600_000
    return { hours, openCount }
  }, [entries])

  function shiftDay(delta: number) {
    const next = new Date(day)
    next.setDate(next.getDate() + delta)
    setDay(next)
  }
  function shiftPeriod(delta: number) {
    const next = new Date(periodAnchor)
    next.setDate(next.getDate() + delta * 7)
    setPeriodAnchor(next)
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
      {/* Header */}
      <View style={{ backgroundColor: COLORS.navy, paddingHorizontal: 20, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: '900' }}>My Timesheet</Text>
          <Text style={{ color: '#A8C4EE', fontSize: TYPE.body, marginTop: 2 }}>{range.label}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {/* Mode switcher */}
        <View style={{ flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 18, padding: 4 }}>
          {(['day', 'period', 'custom'] as Mode[]).map(m => {
            const active = mode === m
            const label = m === 'day' ? 'Day' : m === 'period' ? 'Pay Period' : 'Custom'
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={{
                  flex: 1,
                  paddingVertical: TOUCH.pillPaddingV,
                  borderRadius: 14,
                  backgroundColor: active ? COLORS.navy : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: TOUCH.minHeight,
                }}
              >
                <Text style={{ color: active ? COLORS.white : COLORS.subtext, fontWeight: '800', fontSize: TYPE.body }}>{label}</Text>
              </Pressable>
            )
          })}
        </View>

        {/* Range controls */}
        {mode === 'day' && (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Pressable onPress={() => shiftDay(-1)} style={navBtn}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={COLORS.navy} />
            </Pressable>
            <View style={{ flex: 1, backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, minHeight: TOUCH.minHeight, justifyContent: 'center' }}>
              <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: TYPE.body, textAlign: 'center' }}>{fmtDateLong(day)}</Text>
            </View>
            <Pressable onPress={() => shiftDay(1)} style={navBtn}>
              <MaterialCommunityIcons name="chevron-right" size={24} color={COLORS.navy} />
            </Pressable>
          </View>
        )}

        {mode === 'period' && (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Pressable onPress={() => shiftPeriod(-1)} style={navBtn}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={COLORS.navy} />
            </Pressable>
            <View style={{ flex: 1, backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, minHeight: TOUCH.minHeight, justifyContent: 'center' }}>
              <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: TYPE.body, textAlign: 'center' }}>{range.label}</Text>
              <Text style={{ color: COLORS.subtext, fontSize: TYPE.caption, textAlign: 'center', marginTop: 2 }}>Friday → Thursday</Text>
            </View>
            <Pressable onPress={() => shiftPeriod(1)} style={navBtn}>
              <MaterialCommunityIcons name="chevron-right" size={24} color={COLORS.navy} />
            </Pressable>
          </View>
        )}

        {mode === 'custom' && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: COLORS.subtext, fontSize: TYPE.caption, fontWeight: '700' }}>FROM</Text>
            <DatePickerField value={customFrom} onChange={setCustomFrom} />
            <Text style={{ color: COLORS.subtext, fontSize: TYPE.caption, fontWeight: '700' }}>TO</Text>
            <DatePickerField value={customTo} onChange={setCustomTo} />
          </View>
        )}

        {/* Summary card */}
        <View style={{ backgroundColor: COLORS.navy, borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#A8C4EE', fontSize: TYPE.caption, fontWeight: '700', letterSpacing: 0.5 }}>TOTAL HOURS</Text>
            <Text style={{ color: COLORS.white, fontSize: 32, fontWeight: '900', marginTop: 2 }}>{formatHours(totals.hours)}</Text>
            <Text style={{ color: '#A8C4EE', fontSize: TYPE.caption, marginTop: 4 }}>
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}{totals.openCount > 0 ? ` · ${totals.openCount} open` : ''}
            </Text>
          </View>
          <MaterialCommunityIcons name="clock-outline" size={56} color="rgba(255,255,255,0.15)" />
        </View>

        {/* Entries */}
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator color={COLORS.teal} size="large" />
          </View>
        ) : entries.length === 0 ? (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 32, alignItems: 'center' }}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={48} color={COLORS.muted} />
            <Text style={{ color: COLORS.text, fontSize: TYPE.body, fontWeight: '700', marginTop: 12 }}>No entries in this range</Text>
            <Text style={{ color: COLORS.subtext, fontSize: TYPE.body, marginTop: 4, textAlign: 'center' }}>
              Try a different day, pay period, or custom date range.
            </Text>
          </View>
        ) : (
          entries.map(e => {
            const project = e.project_id != null ? projects[e.project_id] : null
            const hours = calculateHours(e.clock_in_time, e.clock_out_time)
            const open = !e.clock_out_time
            const day = e.clock_in_time ? new Date(e.clock_in_time) : null
            return (
              <View key={e.id} style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.subtext, fontSize: TYPE.caption, fontWeight: '700', letterSpacing: 0.4 }}>
                      {day ? day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase() : '—'}
                    </Text>
                    <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '800', marginTop: 2 }} numberOfLines={1}>
                      {project?.name || (e.project_id != null ? `Project #${e.project_id}` : 'No project')}
                    </Text>
                  </View>
                  {open ? (
                    <View style={{ backgroundColor: COLORS.amberSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 }}>
                      <Text style={{ color: COLORS.amber, fontSize: TYPE.caption, fontWeight: '800' }}>OPEN</Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: COLORS.tealSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 }}>
                      <Text style={{ color: COLORS.teal, fontSize: TYPE.caption, fontWeight: '800' }}>{formatHours(hours)} h</Text>
                    </View>
                  )}
                </View>

                {/* Times grid */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <ClockBlock
                    label="Clock In"
                    time={formatTimeOnly(e.clock_in_time)}
                    snapshotUrl={e.clock_in_snapshot_url}
                    offsite={!!e.clock_in_offsite}
                    reason={e.clock_in_offsite_reason}
                    note={e.clock_in_offsite_note}
                    onPreview={setSnapshotPreview}
                  />
                  <ClockBlock
                    label="Clock Out"
                    time={open ? '—' : formatTimeOnly(e.clock_out_time)}
                    snapshotUrl={e.clock_out_snapshot_url}
                    offsite={!!e.clock_out_offsite}
                    reason={e.clock_out_offsite_reason}
                    note={e.clock_out_offsite_note}
                    onPreview={setSnapshotPreview}
                  />
                </View>
              </View>
            )
          })
        )}
      </ScrollView>

      {/* Snapshot lightbox */}
      <Modal visible={!!snapshotPreview} transparent animationType="fade" onRequestClose={() => setSnapshotPreview(null)}>
        <Pressable
          onPress={() => setSnapshotPreview(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
        >
          {snapshotPreview && (
            <Image source={{ uri: snapshotPreview }} style={{ width: '100%', height: '70%', resizeMode: 'contain' }} />
          )}
          <Pressable
            onPress={() => setSnapshotPreview(null)}
            style={{ marginTop: 24, backgroundColor: COLORS.white, paddingHorizontal: 26, paddingVertical: 14, borderRadius: 100, minHeight: TOUCH.minHeight, justifyContent: 'center' }}
          >
            <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: TYPE.bodyBold }}>Close</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const navBtn = {
  width: 48,
  height: 48,
  borderRadius: 14,
  backgroundColor: COLORS.card,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
}

function ClockBlock({
  label,
  time,
  snapshotUrl,
  offsite,
  reason,
  note,
  onPreview,
}: {
  label: string
  time: string
  snapshotUrl: string | null
  offsite: boolean
  reason: string | null
  note: string | null
  onPreview: (url: string) => void
}) {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background, borderRadius: 14, padding: 12 }}>
      <Text style={{ color: COLORS.subtext, fontSize: TYPE.caption, fontWeight: '700', letterSpacing: 0.4 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '800', marginTop: 2 }}>{time}</Text>

      {snapshotUrl ? (
        <Pressable onPress={() => onPreview(snapshotUrl)} style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden' }}>
          <Image source={{ uri: snapshotUrl }} style={{ width: '100%', height: 90 }} resizeMode="cover" />
          <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(15,23,42,0.65)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <MaterialCommunityIcons name="map-marker" size={11} color={COLORS.white} />
            <Text style={{ color: COLORS.white, fontSize: 10, fontWeight: '700' }}>MAP</Text>
          </View>
        </Pressable>
      ) : (
        <View style={{ marginTop: 8, height: 90, borderRadius: 12, backgroundColor: COLORS.border, justifyContent: 'center', alignItems: 'center' }}>
          <MaterialCommunityIcons name="map-marker-off-outline" size={22} color={COLORS.muted} />
          <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }}>no map</Text>
        </View>
      )}

      {offsite && (
        <View style={{ marginTop: 8, backgroundColor: COLORS.amberSoft, padding: 8, borderRadius: 8 }}>
          <Text style={{ color: COLORS.amber, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 }}>OFF-SITE</Text>
          {reason ? <Text style={{ color: COLORS.amber, fontSize: 12, marginTop: 2 }}>{reason}</Text> : null}
          {note ? <Text style={{ color: COLORS.amber, fontSize: 11, marginTop: 2 }} numberOfLines={2}>{note}</Text> : null}
        </View>
      )}
    </View>
  )
}
