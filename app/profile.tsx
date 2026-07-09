import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import DatePickerField from '../components/DatePickerField'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

type TimeOff = { id: number; start_date: string; end_date: string; reason: string | null; status: string }

function fmtRange(s: string, e: string): string {
  const f = (d: string) => { try { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return d } }
  return s === e ? f(s) : `${f(s)} – ${f(e)}`
}

export default function Profile() {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [uid, setUid] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('worker')
  const [wage, setWage] = useState<number | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)

  const [reqStart, setReqStart] = useState('')
  const [reqEnd, setReqEnd] = useState('')
  const [reqReason, setReqReason] = useState('')
  const [reqBusy, setReqBusy] = useState(false)
  const [timeOff, setTimeOff] = useState<TimeOff[]>([])
  // Tenant branding for the time-off notification email (RLS scopes this to the
  // worker's own org, so the manager gets an email branded with their company).
  const [companyName, setCompanyName] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/sign-in'); return }
      setUid(user.id)
      setEmail(user.email || '')
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (prof) {
        setRole(prof.role || 'worker')
        setWage(prof.wage ?? null)
        setFirstName(prof.first_name || '')
        setLastName(prof.last_name || '')
        setPhone(prof.phone || '')
        setAddress(prof.address || '')
      }
      try {
        const { data: co } = await supabase
          .from('company_settings')
          .select('company_name, company_email')
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle()
        setCompanyName(co?.company_name || '')
        setCompanyEmail(co?.company_email || '')
      } catch { /* branding is best-effort; email still sends to the fallback */ }
      await loadTimeOff(user.id)
      setLoading(false)
    })()
  }, [])

  async function loadTimeOff(id: string) {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase.from('time_off_requests').select('*').eq('user_id', id).gte('end_date', today).order('start_date', { ascending: true })
    setTimeOff((data as TimeOff[]) || [])
  }

  async function saveInfo() {
    if (!uid) return
    setSaving(true)
    const full = `${firstName.trim()} ${lastName.trim()}`.trim()
    const { error } = await supabase.from('profiles').update({
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      full_name: full || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
    }).eq('id', uid)
    setSaving(false)
    Alert.alert(error ? t('error') : t('saved'), error ? error.message : t('profileSaved'))
  }

  async function requestTimeOff() {
    if (!uid) return
    if (!reqStart) { Alert.alert(t('error'), t('pickStartDate')); return }
    const end = reqEnd || reqStart
    if (end < reqStart) { Alert.alert(t('error'), t('endBeforeStart')); return }
    setReqBusy(true)
    const full = `${firstName.trim()} ${lastName.trim()}`.trim()
    const { error } = await supabase.from('time_off_requests').insert({
      user_id: uid, user_name: full || null, start_date: reqStart, end_date: end, reason: reqReason.trim() || null,
    })
    setReqBusy(false)
    if (error) { Alert.alert(t('error'), error.message); return }
    // Fire-and-forget email to the manager.
    fetch('https://www.nguyenmep.com/api/portal/notify-timeoff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerName: full, startDate: reqStart, endDate: end, reason: reqReason.trim(), companyName, companyEmail }),
    }).catch(() => {})
    setReqStart(''); setReqEnd(''); setReqReason('')
    Alert.alert(t('requestTimeOff'), t('timeOffSubmitted'))
    await loadTimeOff(uid)
  }

  async function cancelTimeOff(id: number) {
    if (!uid) return
    await supabase.from('time_off_requests').delete().eq('id', id)
    await loadTimeOff(uid)
  }

  const inputStyle = { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, fontSize: 15, color: COLORS.text, marginBottom: 12 } as const
  const roStyle = { ...inputStyle, backgroundColor: '#EEF2F7', color: COLORS.subtext } as const
  const lbl = { fontSize: 12, fontWeight: '700' as const, color: COLORS.subtext, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 5 }
  const card = { backgroundColor: COLORS.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 }

  if (loading) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" /></SafeAreaView>
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={{ marginRight: 10 }}>
              <Ionicons name="chevron-back" size={26} color={COLORS.navy} />
            </Pressable>
            <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.text }}>{t('myProfile')}</Text>
          </View>

          {/* My information */}
          <View style={card}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 14 }}>{t('myInformation')}</Text>
            <Text style={lbl}>{t('firstNameLabel')}</Text>
            <TextInput style={inputStyle} value={firstName} onChangeText={setFirstName} />
            <Text style={lbl}>{t('lastNameLabel')}</Text>
            <TextInput style={inputStyle} value={lastName} onChangeText={setLastName} />
            <Text style={lbl}>{t('phoneLabel')}</Text>
            <TextInput style={inputStyle} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Text style={lbl}>{t('homeAddress')}</Text>
            <TextInput style={inputStyle} value={address} onChangeText={setAddress} placeholder="Street, City, State ZIP" placeholderTextColor={COLORS.subtext} />

            <Text style={lbl}>{t('emailLabel')}</Text>
            <TextInput style={roStyle} value={email} editable={false} />
            <Text style={lbl}>{t('roleLabel')}</Text>
            <TextInput style={roStyle} value={role} editable={false} />
            {wage != null ? (<>
              <Text style={lbl}>{t('wageLabel')}</Text>
              <TextInput style={roStyle} value={`$${Number(wage).toFixed(2)} / hr`} editable={false} />
            </>) : null}
            <Text style={{ color: COLORS.subtext, fontSize: 12, marginBottom: 14 }}>{t('managedByCompany')}</Text>

            <Pressable onPress={saveInfo} disabled={saving} style={{ backgroundColor: saving ? '#94A3B8' : COLORS.green, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
              {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 15 }}>{t('saveChanges')}</Text>}
            </Pressable>
          </View>

          {/* Request time off */}
          <View style={card}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 14 }}>{t('requestTimeOff')}</Text>
            <Text style={lbl}>{t('firstDayOff')}</Text>
            <DatePickerField value={reqStart} onChange={setReqStart} placeholder={t('firstDayOff')} />
            <Text style={lbl}>{t('lastDayOff')}</Text>
            <DatePickerField value={reqEnd} onChange={setReqEnd} placeholder={t('lastDayOff')} allowClear />
            <Text style={lbl}>{t('reasonOptional')}</Text>
            <TextInput style={inputStyle} value={reqReason} onChangeText={setReqReason} placeholder={t('reasonExample')} placeholderTextColor={COLORS.subtext} />
            <Pressable onPress={requestTimeOff} disabled={reqBusy} style={{ backgroundColor: reqBusy ? '#94A3B8' : COLORS.navy, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
              {reqBusy ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 15 }}>{t('requestDaysOff')}</Text>}
            </Pressable>

            {timeOff.length > 0 ? (
              <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 }}>
                <Text style={lbl}>{t('upcomingTimeOff')}</Text>
                {timeOff.map((r) => (
                  <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontWeight: '700' }}>{fmtRange(r.start_date, r.end_date)}</Text>
                      {r.reason ? <Text style={{ color: COLORS.subtext, fontSize: 13 }}>{r.reason}</Text> : null}
                    </View>
                    <Text style={{ color: COLORS.subtext, fontSize: 12, fontWeight: '700', marginRight: 12, textTransform: 'capitalize' }}>{r.status}</Text>
                    <Pressable onPress={() => cancelTimeOff(r.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={20} color="#B71C1C" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {/* Change password */}
          <Pressable onPress={() => router.push('/change-password' as never)} style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="key-outline" size={22} color={COLORS.navy} />
            <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{t('changePassword')}</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.subtext} />
          </Pressable>

          {/* Tools & equipment */}
          <Pressable onPress={() => router.push('/equipment' as never)} style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="construct-outline" size={22} color={COLORS.navy} />
            <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{t('toolsEquipment')}</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.subtext} />
          </Pressable>

          {/* User guide */}
          <Pressable onPress={() => Linking.openURL('https://www.nguyenmep.com/guide')} style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="book-outline" size={22} color={COLORS.navy} />
            <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{t('userGuide')}</Text>
            <Ionicons name="open-outline" size={20} color={COLORS.subtext} />
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
