import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Image,
  Pressable,
  
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCompanyLogo } from '../../hooks/useCompanyLogo'
import { useManagerSummary } from '../../hooks/useManagerSummary'
import { useLanguage } from '../../lib/i18n'
import { COLORS } from '../../lib/theme'

function ManagerCard({
  title,
  subtitle,
  icon,
  iconBg,
  iconColor,
  onPress,
}: {
  title: string
  subtitle: string
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  iconBg: string
  iconColor: string
  onPress: () => void
}) {
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
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 62,
            height: 62,
            borderRadius: 20,
            backgroundColor: iconBg,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 14,
          }}
        >
          <MaterialCommunityIcons name={icon} size={30} color={iconColor} />
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: COLORS.navy,
              fontSize: 20,
              fontWeight: '800',
              marginBottom: 4,
            }}
          >
            {title}
          </Text>

          <Text
            style={{
              color: COLORS.subtext,
              lineHeight: 20,
            }}
          >
            {subtitle}
          </Text>
        </View>

        <MaterialCommunityIcons
          name="chevron-right"
          size={28}
          color={COLORS.subtext}
        />
      </View>
    </Pressable>
  )
}

export default function ManagerSummaryScreen() {
  const router = useRouter()
  const { logoUrl } = useCompanyLogo()
  const { t } = useLanguage()

  const {
    userRole,
    loading,
    errorMessage,
    refresh,
  } = useManagerSummary()

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: COLORS.background,
        }}
      >
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>
          {t('loadingManagerDashboard')}
        </Text>
      </SafeAreaView>
    )
  }

  if (errorMessage) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
          backgroundColor: COLORS.background,
        }}
      >
        <Text style={{ color: COLORS.red, marginBottom: 12, fontWeight: '700' }}>
          {t('error')}
        </Text>

        <Text
          style={{
            color: COLORS.text,
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          {errorMessage}
        </Text>

        <Pressable
          onPress={refresh}
          style={{
            backgroundColor: COLORS.navy,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: 14,
          }}
        >
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>{t('retry')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (userRole !== 'manager') {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
          backgroundColor: COLORS.background,
        }}
      >
        <View
          style={{
            width: 82,
            height: 82,
            borderRadius: 24,
            backgroundColor: '#FEF2F2',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <MaterialCommunityIcons
            name="shield-lock-outline"
            size={38}
            color={COLORS.red}
          />
        </View>

        <Text
          style={{
            fontSize: 26,
            fontWeight: '800',
            color: COLORS.navy,
            marginBottom: 10,
          }}
        >
          {t('managerOnly')}
        </Text>

        <Text
          style={{
            color: COLORS.text,
            textAlign: 'center',
            lineHeight: 22,
          }}
        >
          {t('noPermissionManagerDashboard')}
        </Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View
          style={{
            backgroundColor: COLORS.navy,
            borderRadius: 28,
            padding: 22,
            marginBottom: 18,
          }}
        >
          <View
            style={{
              width: 78,
              height: 78,
              borderRadius: 22,
              backgroundColor: COLORS.white,
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'hidden',
              marginBottom: 14,
            }}
          >
            <Image
              source={
                logoUrl
                  ? { uri: logoUrl }
                  : require('../../assets/images/company-logo.png')
              }
              style={{
                width: 58,
                height: 58,
                resizeMode: 'contain',
              }}
            />
          </View>

          <Text
            style={{
              color: COLORS.white,
              fontSize: 28,
              fontWeight: '800',
              marginBottom: 6,
            }}
          >
            {t('managerDashboard')}
          </Text>

          <Text
            style={{
              color: '#D9F6FB',
              lineHeight: 22,
            }}
          >
            {t('managerDashboardIntro')}
          </Text>
        </View>

        <ManagerCard
          title={t('timeAndPayroll')}
          subtitle={t('timeAndPayrollSubtitle')}
          icon="clock-outline"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          onPress={() => router.push('/manager/time-clock')}
        />

        <ManagerCard
          title={t('projectsAndPlans')}
          subtitle={t('projectsAndPlansSubtitle')}
          icon="briefcase-outline"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          onPress={() => router.push('/manager/plans')}
        />

        <ManagerCard
          title={t('tasks')}
          subtitle={t('tasksSubtitle')}
          icon="format-list-checks"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          onPress={() => router.push('/manager/tasks')}
        />

        <ManagerCard
          title={t('finance')}
          subtitle={t('financeSubtitle')}
          icon="cash-multiple"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          onPress={() => router.push('/manager/finance')}
        />

        <ManagerCard
          title={t('reports')}
          subtitle={t('reportsSubtitle')}
          icon="clipboard-text-outline"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          onPress={() => router.push('/manager/reports')}
        />

        <ManagerCard
          title={t('inspections')}
          subtitle={t('inspectionsSubtitle')}
          icon="clipboard-check-outline"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          onPress={() => router.push('/manager/inspections')}
        />

        <ManagerCard
          title={t('safety')}
          subtitle={t('safetySubtitle')}
          icon="shield-check-outline"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          onPress={() => router.push('/manager/safety')}
        />

        <ManagerCard
          title={t('settings')}
          subtitle={t('settingsSubtitle')}
          icon="cog-outline"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          onPress={() => router.push('/manager/settings')}
        />
      </ScrollView>
    </SafeAreaView>
  )
}