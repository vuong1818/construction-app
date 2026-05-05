import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage, type TranslationKey } from '../../lib/i18n'
import { COLORS } from '../../lib/theme'

type Category = {
  route: string
  icon: 'lightning-bolt' | 'pipe' | 'snowflake' | 'office-building' | 'water-pump'
  labelKey: TranslationKey
  descKey: TranslationKey
  iconBg: string
  iconColor: string
  accent: string
}

const CATEGORIES: Category[] = [
  {
    route: '/smart-tools/electrical',
    icon: 'lightning-bolt',
    labelKey: 'electrical',
    descKey: 'electricalDesc',
    iconBg: '#FFF8E1',
    iconColor: '#F9A825',
    accent: '#F9A825',
  },
  {
    route: '/smart-tools/plumbing',
    icon: 'pipe',
    labelKey: 'plumbing',
    descKey: 'plumbingDesc',
    iconBg: '#E3F2FD',
    iconColor: '#1565C0',
    accent: '#1565C0',
  },
  {
    route: '/smart-tools/mechanical',
    icon: 'snowflake',
    labelKey: 'mechanical',
    descKey: 'mechanicalDesc',
    iconBg: '#E8F5E9',
    iconColor: '#2E7D32',
    accent: '#2E7D32',
  },
  {
    route: '/smart-tools/building',
    icon: 'office-building',
    labelKey: 'building',
    descKey: 'buildingDesc',
    iconBg: '#F3E5F5',
    iconColor: '#6A1B9A',
    accent: '#6A1B9A',
  },
  {
    route: '/smart-tools/backflow',
    icon: 'water-pump',
    labelKey: 'backflow',
    descKey: 'backflowDesc',
    iconBg: '#E0F2F1',
    iconColor: '#00695C',
    accent: '#00695C',
  },
]

export default function SmartToolsIndex() {
  const router = useRouter()
  const { t } = useLanguage()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '900', marginBottom: 4 }}>
            {t('smartToolsTitle')}
          </Text>
          <Text style={{ color: COLORS.subtext, fontSize: 14 }}>
            {t('smartToolsHeaderSub')}
          </Text>
        </View>

        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat.route}
            onPress={() => router.push(cat.route as any)}
            style={({ pressed }) => ({
              backgroundColor: COLORS.card,
              borderRadius: 20,
              padding: 18,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: COLORS.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: cat.iconBg,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <MaterialCommunityIcons name={cat.icon} size={32} color={cat.iconColor} />
            </View>

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ color: COLORS.navy, fontSize: 18, fontWeight: '800' }}>
                  {t(cat.labelKey)}
                </Text>

              </View>
              <Text style={{ color: COLORS.subtext, fontSize: 13, lineHeight: 18 }}>{t(cat.descKey)}</Text>
            </View>

            <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.subtext} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}
