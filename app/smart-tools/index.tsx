import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native'

const COLORS = {
  background: '#F6F8FB',
  card: '#FFFFFF',
  navy: '#16356B',
  teal: '#19B6D2',
  text: '#0F172A',
  subtext: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
}

const CATEGORIES = [
  {
    route: '/smart-tools/electrical',
    icon: 'lightning-bolt' as const,
    label: 'Electrical',
    desc: 'Ampacity, conduit fill, voltage drop, fault current, box fill',
    count: '6 calculators',
    iconBg: '#FFF8E1',
    iconColor: '#F9A825',
    accent: '#F9A825',
  },
  {
    route: '/smart-tools/plumbing',
    icon: 'pipe' as const,
    label: 'Plumbing',
    desc: 'Pipe sizing, fixture units, DWV, gas pipe, pressure loss',
    count: '5 calculators',
    iconBg: '#E3F2FD',
    iconColor: '#1565C0',
    accent: '#1565C0',
  },
  {
    route: '/smart-tools/mechanical',
    icon: 'snowflake' as const,
    label: 'Mechanical',
    desc: 'HVAC load, duct sizing, refrigerant P-T, ventilation, CFM/tons, duct conversion',
    count: '6 calculators',
    iconBg: '#E8F5E9',
    iconColor: '#2E7D32',
    accent: '#2E7D32',
  },
  {
    route: '/smart-tools/building',
    icon: 'office-building' as const,
    label: 'Building',
    desc: 'Concrete, span tables, footing reference, material estimator',
    count: '4 calculators',
    iconBg: '#F3E5F5',
    iconColor: '#6A1B9A',
    accent: '#6A1B9A',
  },
]

export default function SmartToolsIndex() {
  const router = useRouter()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '900', marginBottom: 4 }}>
            Smart Tools
          </Text>
          <Text style={{ color: COLORS.subtext, fontSize: 14 }}>
            Field-ready calculators based on current codes
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
                  {cat.label}
                </Text>
                <View
                  style={{
                    backgroundColor: cat.iconBg,
                    borderRadius: 100,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ color: cat.accent, fontSize: 11, fontWeight: '700' }}>
                    {cat.count}
                  </Text>
                </View>
              </View>
              <Text style={{ color: COLORS.subtext, fontSize: 13, lineHeight: 18 }}>{cat.desc}</Text>
            </View>

            <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.subtext} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}
