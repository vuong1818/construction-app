import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'

const COLORS = {
  background: '#D6E8FF',
  card: '#FFFFFF',
  navy: '#16356B',
  teal: '#19B6D2',
  tealSoft: '#E7F9FC',
  navySoft: '#EAF0F8',
  red: '#EF4444',
  text: '#0F172A',
  subtext: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
}

type CardProps = {
  title: string
  subtitle: string
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  iconBg: string
  iconColor: string
  onPress: () => void
}

function SettingsCard({ title, subtitle, icon, iconBg, iconColor, onPress }: CardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 24,
        padding: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View style={{
        width: 62, height: 62, borderRadius: 20,
        backgroundColor: iconBg,
        justifyContent: 'center', alignItems: 'center',
        marginRight: 14,
      }}>
        <MaterialCommunityIcons name={icon} size={30} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.navy, fontSize: 20, fontWeight: '800', marginBottom: 4 }}>
          {title}
        </Text>
        <Text style={{ color: COLORS.subtext, lineHeight: 20 }}>
          {subtitle}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={28} color={COLORS.subtext} />
    </Pressable>
  )
}

export default function ManagerSettingsScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [userRole, setUserRole] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setErrorMessage('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setErrorMessage(t('signInRequired')); return }

      const { data: me, error } = await supabase
        .from('profiles').select('role').eq('id', session.user.id).single()

      if (error) { setErrorMessage(error.message); return }
      setUserRole(me?.role || 'worker')
    } catch (err: any) {
      setErrorMessage(err?.message || t('failedToLoadSettings'))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.teal} />
      </SafeAreaView>
    )
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.red, fontWeight: '700', marginBottom: 10 }}>{t('error')}</Text>
        <Text style={{ color: COLORS.text, textAlign: 'center', marginBottom: 16 }}>{errorMessage}</Text>
        <Pressable onPress={load} style={{ backgroundColor: COLORS.navy, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 }}>
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>{t('retry')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (userRole !== 'manager') {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '800', marginBottom: 10 }}>{t('managerOnly')}</Text>
        <Text style={{ color: COLORS.text, textAlign: 'center' }}>{t('noPermissionSettings')}</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ backgroundColor: COLORS.navy, borderRadius: 28, padding: 22, marginBottom: 18 }}>
          <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800', marginBottom: 6 }}>{t('settings')}</Text>
          <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
            {t('settingsSubtitle')}
          </Text>
        </View>

        <SettingsCard
          title={t('workersTitle')}
          subtitle={t('workersCardSubtitle')}
          icon="account-group-outline"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          onPress={() => router.push('/manager/workers')}
        />

        <SettingsCard
          title={t('companyInformation')}
          subtitle={t('companyCardSubtitle')}
          icon="office-building-cog-outline"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          onPress={() => router.push('/manager/company')}
        />
      </ScrollView>
    </SafeAreaView>
  )
}
