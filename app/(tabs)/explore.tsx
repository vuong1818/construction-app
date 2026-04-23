import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useCompanyLogo } from '../../hooks/useCompanyLogo'
import { useManagerSummary } from '../../hooks/useManagerSummary'

const COLORS = {
  background: '#F6F8FB',
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
          Loading manager dashboard...
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
          Error
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
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>Retry</Text>
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
          Manager Only
        </Text>

        <Text
          style={{
            color: COLORS.text,
            textAlign: 'center',
            lineHeight: 22,
          }}
        >
          You do not have permission to view the manager dashboard.
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
            Manager Dashboard
          </Text>

          <Text
            style={{
              color: '#D9F6FB',
              lineHeight: 22,
            }}
          >
            Manage workers, review weekly time, maintain plans, update reports, configure company settings, and manage safety.
          </Text>
        </View>

        <ManagerCard
          title="Workers"
          subtitle="Update subscribed users, worker information, and user roles."
          icon="account-group-outline"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          onPress={() => router.push('/manager/workers')}
        />

        <ManagerCard
          title="Time Clock"
          subtitle="Choose a work week, review worker totals, and modify hours, gas, and receipts."
          icon="clock-outline"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          onPress={() => router.push('/manager/time-clock')}
        />

        <ManagerCard
          title="Plans"
          subtitle="Add, rename, update, and delete project PDF plans."
          icon="file-pdf-box"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          onPress={() => router.push('/manager/plans')}
        />

        <ManagerCard
          title="Reports"
          subtitle="Browse reports by project and modify or delete daily reports."
          icon="clipboard-text-outline"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          onPress={() => router.push('/manager/reports')}
        />

        <ManagerCard
          title="Safety"
          subtitle="Enter weekly safety topic and review weekly acknowledgements."
          icon="shield-check-outline"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          onPress={() => router.push('/manager/safety')}
        />

        <ManagerCard
          title="Company"
          subtitle="Set up company information and add, change, or delete the company logo."
          icon="office-building-cog-outline"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          onPress={() => router.push('/manager/company')}
        />
      </ScrollView>
    </SafeAreaView>
  )
}