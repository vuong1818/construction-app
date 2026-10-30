import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Picker } from '@react-native-picker/picker'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'
import { DatePickerField } from './DatePickerField'
import { TimePickerField } from './TimePickerField'

// A worker's shifts for the range shown on Time & Payroll, one per row, with a
// form to move clock-in / clock-out, change the project, add a shift the phone
// never recorded, or delete one. Every write goes through the manager_* RPCs
// the web Edit Entry screen uses: they check the caller is a manager or the
// project's supervisor, stamp edited_by / edited_at, and are waved through the
// safety guard as office work rather than a jobsite clock-in. RLS still decides
// whether the row can be touched; this component adds no authority.

export type SheetTimeEntry = {
  id: number
  project_id: number | null
  user_id: string | null
  user_name: string | null
  clock_in_time: string | null
  clock_out_time: string | null
  receipts_amount: number | null
  wage_override?: number | null
  manually_added?: boolean | null
  edited_by?: string | null
  edited_by_name?: string | null
  edited_at?: string | null
}

export type SheetProject = { id: number; name: string | null }

type Form = {
  id: number | null
  projectId: number | null
  inDate: string
  inTime: string
  outDate: string
  outTime: string
  receipts: number
  wageOverride: number | null
}

function localDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 'YYYY-MM-DD' + 'HH:mm' in the phone's timezone -> ISO instant for the RPC.
function combine(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString()
}

function hoursBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const h = (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000
  return Number.isFinite(h) ? h : null
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function emptyForm(defaultDate: string): Form {
  return { id: null, projectId: null, inDate: defaultDate, inTime: '', outDate: defaultDate, outTime: '', receipts: 0, wageOverride: null }
}

export function WorkerEntriesSheet({
  visible,
  workerId,
  workerName,
  entries,
  projects,
  defaultDate,
  onClose,
  onSaved,
}: {
  visible: boolean
  workerId: string | null
  workerName: string
  entries: SheetTimeEntry[]
  projects: SheetProject[]
  // Where a new shift's date starts: the range's first day, or today.
  defaultDate: string
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const { t } = useLanguage()
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (!visible) setForm(null) }, [visible])

  const projectName = useMemo(() => {
    const m = new Map<number, string>()
    for (const p of projects) m.set(p.id, p.name || `#${p.id}`)
    return (id: number | null) => (id == null ? t('noProject') : m.get(id) || `#${id}`)
  }, [projects, t])

  const mine = useMemo(
    () => entries
      .filter((e) => e.user_id === workerId && e.clock_in_time)
      .sort((a, b) => String(b.clock_in_time).localeCompare(String(a.clock_in_time))),
    [entries, workerId],
  )

  // Grouped by the day the shift started, newest first - the question a
  // manager arrives with is "what happened on Tuesday", not "which entry id".
  const byDay = useMemo(() => {
    const groups: { day: string; rows: SheetTimeEntry[] }[] = []
    for (const e of mine) {
      const day = localDate(e.clock_in_time)
      const g = groups[groups.length - 1]
      if (g && g.day === day) g.rows.push(e)
      else groups.push({ day, rows: [e] })
    }
    return groups
  }, [mine])

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  function openEdit(e: SheetTimeEntry) {
    setForm({
      id: e.id,
      projectId: e.project_id,
      inDate: localDate(e.clock_in_time),
      inTime: localTime(e.clock_in_time),
      outDate: localDate(e.clock_out_time) || localDate(e.clock_in_time),
      outTime: localTime(e.clock_out_time),
      receipts: Number(e.receipts_amount) || 0,
      wageOverride: e.wage_override ?? null,
    })
  }

  async function save() {
    if (!form || !workerId) return
    const clockIn = combine(form.inDate, form.inTime)
    if (!clockIn) { Alert.alert(t('error'), t('entryNeedsClockIn')); return }
    const clockOut = form.outTime ? combine(form.outDate || form.inDate, form.outTime) : null
    if (form.outTime && !clockOut) { Alert.alert(t('error'), t('entryClockOutInvalid')); return }
    if (clockOut && new Date(clockOut) <= new Date(clockIn)) { Alert.alert(t('error'), t('entryClockOutBeforeIn')); return }

    setSaving(true)
    try {
      const { error } = form.id == null
        ? await supabase.rpc('manager_add_time_entry', {
            p_user_id: workerId,
            p_user_name: workerName || null,
            p_project_id: form.projectId,
            p_clock_in: clockIn,
            p_clock_out: clockOut,
            p_receipts: form.receipts,
            p_wage_override: form.wageOverride,
          })
        : await supabase.rpc('manager_update_time_entry', {
            p_id: form.id,
            p_project_id: form.projectId,
            p_clock_in: clockIn,
            p_clock_out: clockOut,
            // Not edited here; passed back unchanged so the RPC does not clear them.
            p_receipts: form.receipts,
            p_wage_override: form.wageOverride,
          })
      if (error) { Alert.alert(t('saveError'), error.message); return }
      setForm(null)
      await onSaved()
    } catch (err: any) {
      Alert.alert(t('error'), err?.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete() {
    if (!form?.id) return
    const id = form.id
    Alert.alert(t('deleteEntryTitle'), t('deleteEntryBody', { day: fmtDay(form.inDate) }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true)
          try {
            const { error } = await supabase.rpc('manager_delete_time_entry', { p_id: id })
            if (error) { Alert.alert(t('error'), error.message); return }
            setForm(null)
            await onSaved()
          } finally {
            setSaving(false)
          }
        },
      },
    ])
  }

  const label = { color: COLORS.navy, fontWeight: '700' as const, marginBottom: 8 }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => (form ? setForm(null) : onClose())}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.40)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, maxHeight: '90%' }}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            {form ? (
              <>
                <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '800', marginBottom: 4 }}>
                  {form.id == null ? t('addShift') : t('editShift')}
                </Text>
                <Text style={{ color: COLORS.subtext, marginBottom: 18 }}>{workerName}</Text>

                <Text style={label}>{t('project')}</Text>
                <View style={{ backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', marginBottom: 14 }}>
                  <Picker
                    selectedValue={form.projectId == null ? '' : String(form.projectId)}
                    onValueChange={(v) => set('projectId', v === '' ? null : Number(v))}
                    itemStyle={Platform.OS === 'ios' ? { color: COLORS.text, fontSize: 16, height: 120 } : undefined}
                    style={{ color: COLORS.text, backgroundColor: COLORS.card }}
                  >
                    <Picker.Item label={t('noProject')} value="" color={COLORS.subtext} />
                    {projects.map((p) => (
                      <Picker.Item key={p.id} label={p.name || `#${p.id}`} value={String(p.id)} color={COLORS.text} />
                    ))}
                  </Picker>
                </View>

                <Text style={label}>{t('clockIn')}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 3 }}><DatePickerField value={form.inDate} onChange={(v) => set('inDate', v)} /></View>
                  <View style={{ flex: 2 }}><TimePickerField value={form.inTime} onChange={(v) => set('inTime', v)} /></View>
                </View>

                <Text style={label}>{t('clockOut')}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 3 }}><DatePickerField value={form.outDate} onChange={(v) => set('outDate', v)} /></View>
                  <View style={{ flex: 2 }}><TimePickerField value={form.outTime} onChange={(v) => set('outTime', v)} allowClear /></View>
                </View>
                <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: -6, marginBottom: 14, lineHeight: 17 }}>
                  {t('clockOutBlankHint')}
                </Text>

                {(() => {
                  const h = hoursBetween(combine(form.inDate, form.inTime), form.outTime ? combine(form.outDate || form.inDate, form.outTime) : null)
                  return h == null ? null : (
                    <Text style={{ color: h > 0 ? COLORS.navy : '#B91C1C', fontWeight: '800', marginBottom: 14 }}>
                      {t('shiftHours', { hours: h.toFixed(2) })}
                    </Text>
                  )
                })()}

                <View style={{ gap: 12, marginTop: 6 }}>
                  <Pressable
                    onPress={save}
                    disabled={saving}
                    style={{ backgroundColor: saving ? '#94A3B8' : COLORS.navy, borderRadius: 18, paddingVertical: 16, alignItems: 'center', minHeight: 52 }}
                  >
                    <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '800' }}>{saving ? t('saving') : t('save')}</Text>
                  </Pressable>
                  {form.id != null && (
                    <Pressable onPress={confirmDelete} disabled={saving} style={{ borderRadius: 18, paddingVertical: 14, alignItems: 'center', minHeight: 48 }}>
                      <Text style={{ color: '#B91C1C', fontSize: 15, fontWeight: '700' }}>{t('deleteShift')}</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => setForm(null)} style={{ borderRadius: 18, paddingVertical: 14, alignItems: 'center', minHeight: 48 }}>
                    <Text style={{ color: COLORS.subtext, fontSize: 15, fontWeight: '700' }}>{t('cancel')}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '800' }}>{t('shiftsTitle')}</Text>
                    <Text style={{ color: COLORS.subtext, marginTop: 2 }}>{workerName}</Text>
                  </View>
                  <Pressable
                    onPress={() => setForm(emptyForm(defaultDate))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.tealSoft, borderRadius: 14, paddingHorizontal: 14, minHeight: 48 }}
                  >
                    <MaterialCommunityIcons name="plus" size={20} color={COLORS.teal} />
                    <Text style={{ color: COLORS.teal, fontWeight: '800' }}>{t('addShift')}</Text>
                  </Pressable>
                </View>
                <Text style={{ color: COLORS.subtext, fontSize: 12, marginBottom: 16, lineHeight: 17 }}>{t('shiftsIntro')}</Text>

                {byDay.length === 0 ? (
                  <View style={{ backgroundColor: COLORS.background, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: COLORS.border }}>
                    <Text style={{ color: COLORS.text, textAlign: 'center' }}>{t('noShiftsInRange')}</Text>
                  </View>
                ) : (
                  byDay.map((g) => (
                    <View key={g.day} style={{ marginBottom: 14 }}>
                      <Text style={{ color: COLORS.subtext, fontSize: 12, fontWeight: '800', marginBottom: 6, textTransform: 'uppercase' }}>{fmtDay(g.day)}</Text>
                      {g.rows.map((e) => {
                        const h = hoursBetween(e.clock_in_time, e.clock_out_time)
                        const open = !e.clock_out_time
                        return (
                          <Pressable
                            key={e.id}
                            onPress={() => openEdit(e)}
                            style={{ backgroundColor: COLORS.background, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', minHeight: 64 }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: COLORS.navy, fontSize: 17, fontWeight: '800' }}>
                                {fmtTime(e.clock_in_time)} → {open ? t('stillClockedIn') : fmtTime(e.clock_out_time)}
                              </Text>
                              <Text style={{ color: COLORS.subtext, fontSize: 13, marginTop: 2 }} numberOfLines={1}>{projectName(e.project_id)}</Text>
                              {(e.manually_added || e.edited_by) && (
                                <Text style={{ color: e.manually_added ? '#5E35B1' : '#C2410C', fontSize: 11, fontWeight: '800', marginTop: 4 }}>
                                  {e.manually_added ? t('addedByManager', { name: e.edited_by_name || t('aManager') }) : t('editedByManager', { name: e.edited_by_name || t('aManager') })}
                                </Text>
                              )}
                            </View>
                            <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                              <Text style={{ color: open ? '#B45309' : COLORS.text, fontWeight: '800' }}>{h == null ? '—' : `${h.toFixed(2)} h`}</Text>
                              <MaterialCommunityIcons name="pencil-outline" size={20} color={COLORS.teal} style={{ marginTop: 4 }} />
                            </View>
                          </Pressable>
                        )
                      })}
                    </View>
                  ))
                )}

                <Pressable onPress={onClose} style={{ borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: 6, minHeight: 48 }}>
                  <Text style={{ color: COLORS.subtext, fontSize: 15, fontWeight: '700' }}>{t('close')}</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

export default WorkerEntriesSheet
