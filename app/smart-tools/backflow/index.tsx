import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'

const C = {
  bg: '#D6E8FF',
  card: '#FFFFFF',
  navy: '#16356B',
  teal: '#00695C',
  tealSoft: '#E0F2F1',
  text: '#0F172A',
  sub: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
  green: '#2E7D32',
  greenSoft: '#E8F5E9',
  red: '#C62828',
  redSoft: '#FFEBEE',
  neutralSoft: '#F4F7FA',
}

const ASSEMBLY_TYPE_LABEL: Record<string, string> = {
  rpp: 'Reduced Pressure Principle',
  dcv: 'Double Check Valve',
  pvb: 'Pressure Vacuum Breaker',
  srpvb: 'Spill-Resistant Pressure Vacuum Breaker',
  rpp_detector_type_ii: 'Reduced Pressure Principle',
  dc_detector_type_ii: 'Double Check Valve',
}

type BackflowRow = {
  id: number
  test_date: string | null
  assembly_address: string | null
  serial_number: string | null
  manufacturer: string | null
  assembly_type: string | null
  result: 'pass' | 'fail'
  tester_name: string | null
}

type Filter = 'pass' | 'fail' | 'all'

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function BackflowList() {
  const router = useRouter()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [tests, setTests] = useState<BackflowRow[]>([])
  const [filter, setFilter] = useState<Filter>('pass')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('backflow_tests')
      .select('id, test_date, assembly_address, serial_number, manufacturer, assembly_type, result, tester_name')
      .order('test_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) {
      Alert.alert(t('error'), t('backflowLoadFailed', { msg: error.message }))
      setTests([])
    } else {
      setTests((data as BackflowRow[]) || [])
    }
    setLoading(false)
  }, [t])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load()
    }, [load]),
  )

  const passCount = tests.filter(t => t.result === 'pass').length
  const failCount = tests.filter(t => t.result === 'fail').length
  const visible = tests.filter(r => filter === 'all' || r.result === filter)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: C.navy, fontSize: 22, fontWeight: '900', marginBottom: 4 }}>
            {t('backflowTitle')}
          </Text>
          <Text style={{ color: C.sub, fontSize: 13 }}>{t('backflowSubtitle')}</Text>
        </View>

        <Pressable
          onPress={() => router.push('/smart-tools/backflow/new' as any)}
          style={({ pressed }) => ({
            backgroundColor: C.teal,
            borderRadius: 12,
            padding: 14,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 14,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <MaterialCommunityIcons name="plus-circle" size={20} color={C.white} />
          <Text style={{ color: C.white, fontWeight: '800', fontSize: 15 }}>{t('backflowAddTest')}</Text>
        </Pressable>

        {/* Filter chips */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { key: 'pass' as const, label: `${t('backflowFilterPass')} (${passCount})`, bg: C.greenSoft, color: C.green },
            { key: 'fail' as const, label: `${t('backflowFilterFail')} (${failCount})`, bg: C.redSoft, color: C.red },
            { key: 'all' as const, label: `${t('backflowFilterAll')} (${tests.length})`, bg: C.neutralSoft, color: C.sub },
          ].map(c => (
            <Pressable
              key={c.key}
              onPress={() => setFilter(c.key)}
              style={{
                backgroundColor: filter === c.key ? c.color : c.bg,
                borderRadius: 100,
                paddingHorizontal: 14,
                paddingVertical: 7,
              }}
            >
              <Text
                style={{
                  color: filter === c.key ? C.white : c.color,
                  fontWeight: '700',
                  fontSize: 13,
                }}
              >
                {c.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator color={C.navy} />
          </View>
        ) : visible.length === 0 ? (
          <View
            style={{
              backgroundColor: C.card,
              borderRadius: 16,
              padding: 32,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: C.border,
            }}
          >
            <MaterialCommunityIcons name="water-pump-off" size={36} color={C.sub} />
            <Text style={{ color: C.sub, marginTop: 10, fontSize: 14, textAlign: 'center' }}>
              {tests.length === 0 ? t('backflowEmpty') : t('backflowEmptyFilter')}
            </Text>
          </View>
        ) : (
          visible.map(row => {
            const isPass = row.result === 'pass'
            const accent = isPass ? C.green : C.red
            const accentSoft = isPass ? C.greenSoft : C.redSoft
            const typeLabel = (row.assembly_type && ASSEMBLY_TYPE_LABEL[row.assembly_type]) || '—'
            const subline = [
              typeLabel,
              row.manufacturer || null,
              row.serial_number ? `SN ${row.serial_number}` : null,
              row.tester_name ? t('backflowTestedBy', { name: row.tester_name }) : null,
            ]
              .filter(Boolean)
              .join(' · ')

            return (
              <Pressable
                key={row.id}
                onPress={() => router.push(`/smart-tools/backflow/${row.id}` as any)}
                style={({ pressed }) => ({
                  backgroundColor: C.card,
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: C.border,
                  borderLeftWidth: 4,
                  borderLeftColor: accent,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <View
                    style={{
                      backgroundColor: accentSoft,
                      borderRadius: 100,
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                    }}
                  >
                    <Text
                      style={{
                        color: accent,
                        fontWeight: '800',
                        fontSize: 11,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                      }}
                    >
                      {isPass ? t('backflowResultPass') : t('backflowResultFail')}
                    </Text>
                  </View>
                  <Text style={{ color: C.sub, fontSize: 12 }}>
                    {formatDate(row.test_date) || t('backflowNoDate')}
                  </Text>
                </View>
                <Text style={{ color: C.navy, fontWeight: '800', fontSize: 15, marginBottom: 2 }} numberOfLines={1}>
                  {row.assembly_address || t('backflowNoAddress')}
                </Text>
                {subline ? (
                  <Text style={{ color: C.sub, fontSize: 12, lineHeight: 16 }} numberOfLines={2}>
                    {subline}
                  </Text>
                ) : null}
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
