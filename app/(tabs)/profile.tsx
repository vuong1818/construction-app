import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import MileageHistory from '../../components/MileageHistory'
import { useLanguage } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'
import { BuildInfo } from '../../components/BuildInfo'

export default function Profile() {
  const { t, language } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [uid, setUid] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('worker')
  const [wage, setWage] = useState<number | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [homeState, setHomeState] = useState('')
  const [homeZip, setHomeZip] = useState('')
  const [saving, setSaving] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showMileage, setShowMileage] = useState(false)
  const [fullName, setFullName] = useState<string | null>(null)

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
        setHomeState(prof.home_state || '')
        setHomeZip(prof.home_zip || '')
        setFullName(prof.full_name || null)
      }
      // Trip history itself is loaded by <MileageHistory />, which also owns
      // correcting and adding trips.
      setLoading(false)
    })()
  }, [])

  async function saveInfo() {
    if (!uid) return
    setSaving(true)
    // full_name is a GENERATED column — the database builds it from first and
    // last. Sending it made every profile save fail with "column full_name can
    // only be updated to DEFAULT", so nobody could correct their own phone
    // number from the app.
    const { error } = await supabase.from('profiles').update({
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      home_state: homeState.trim().toUpperCase() || null,
      home_zip: homeZip.trim() || null,
    }).eq('id', uid)
    setSaving(false)
    Alert.alert(error ? t('error') : t('saved'), error ? error.message : t('profileSaved'))
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
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: COLORS.text }}>{t('profileTab')}</Text>
          </View>

          {/* My pay & timesheet — prominent */}
          <Pressable
            onPress={() => router.push('/timesheet' as never)}
            style={{ backgroundColor: COLORS.navy, borderRadius: 20, padding: 18, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}
          >
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="cash-outline" size={28} color={COLORS.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '800' }}>{t('myPayTimesheet')}</Text>
              <Text style={{ color: '#D9F6FB', fontSize: 13, marginTop: 3, lineHeight: 18 }}>{t('myPayTimesheetSub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#D9F6FB" />
          </Pressable>

          {/* My information — collapsible tab (tap to expand) */}
          <Pressable onPress={() => setShowInfo(v => !v)} style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: showInfo ? 0 : 16, borderBottomLeftRadius: showInfo ? 0 : 20, borderBottomRightRadius: showInfo ? 0 : 20 }}>
            <Ionicons name="person-outline" size={22} color={COLORS.navy} />
            <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{t('myInformation')}</Text>
            <Ionicons name={showInfo ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.subtext} />
          </Pressable>

          {showInfo && (
          <View style={{ ...card, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0 }}>
            <Text style={lbl}>{t('firstNameLabel')}</Text>
            <TextInput style={inputStyle} value={firstName} onChangeText={setFirstName} />
            <Text style={lbl}>{t('lastNameLabel')}</Text>
            <TextInput style={inputStyle} value={lastName} onChangeText={setLastName} />
            <Text style={lbl}>{t('phoneLabel')}</Text>
            <TextInput style={inputStyle} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Text style={lbl}>{t('homeAddress')}</Text>
            <TextInput style={inputStyle} value={address} onChangeText={setAddress} placeholder="Street, City" placeholderTextColor={COLORS.subtext} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={lbl}>{t('stateLabel')}</Text>
                <TextInput style={inputStyle} value={homeState} onChangeText={setHomeState} placeholder="TX" autoCapitalize="characters" maxLength={2} placeholderTextColor={COLORS.subtext} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={lbl}>{t('zipLabel')}</Text>
                <TextInput style={inputStyle} value={homeZip} onChangeText={setHomeZip} placeholder="75001" keyboardType="number-pad" maxLength={10} placeholderTextColor={COLORS.subtext} />
              </View>
            </View>

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
          )}

          {/* Mileage history — collapsible tab */}
          <Pressable onPress={() => setShowMileage(v => !v)} style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: showMileage ? 0 : 16, borderBottomLeftRadius: showMileage ? 0 : 20, borderBottomRightRadius: showMileage ? 0 : 20 }}>
            <Ionicons name="car-outline" size={22} color={COLORS.navy} />
            <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{t('mileageHistory')}</Text>
            <Ionicons name={showMileage ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.subtext} />
          </Pressable>

          {showMileage && (
            <View style={{ ...card, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0 }}>
              <MileageHistory userName={fullName} language={language} />
            </View>
          )}

          {/* Request time off — a personal action, so it belongs with the worker's
              own details rather than on the jobsite home screen. */}
          <Pressable onPress={() => router.push('/request-time-off' as never)} style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="calendar-outline" size={22} color={COLORS.navy} />
            <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{t('requestTimeOff')}</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.subtext} />
          </Pressable>

          {/* Change password */}
          <Pressable onPress={() => router.push('/change-password' as never)} style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="key-outline" size={22} color={COLORS.navy} />
            <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{t('changePassword')}</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.subtext} />
          </Pressable>

          <BuildInfo />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
