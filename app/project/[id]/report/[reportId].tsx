import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../../../lib/i18n'
import { supabase } from '../../../../lib/supabase'
import { COLORS } from '../../../../lib/theme'

type DailyReport = {
  id: number
  report_date: string
  created_by: string | null
  created_by_name: string | null
  work_completed: string | null
  issues: string | null
  materials_used: string | null
  weather: string | null
  created_at: string
}

function DetailCard({
  icon,
  iconBg,
  iconColor,
  title,
  value,
}: {
  icon: string
  iconBg: string
  iconColor: string
  title: string
  value: string
}) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            backgroundColor: iconBg,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 10,
          }}
        >
          <MaterialCommunityIcons name={icon as any} size={22} color={iconColor} />
        </View>

        <Text style={{ color: COLORS.navy, fontSize: 17, fontWeight: '700' }}>
          {title}
        </Text>
      </View>

      <Text style={{ color: COLORS.text, lineHeight: 22 }}>
        {value}
      </Text>
    </View>
  )
}

export default function DailyReportDetailScreen() {
  const { id, reportId } = useLocalSearchParams<{ id: string; reportId: string }>()
  const router = useRouter()
  const { t } = useLanguage()
  const [report, setReport] = useState<DailyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [uid, setUid] = useState<string | null>(null)
  const [isManager, setIsManager] = useState(false)

  useEffect(() => {
    if (reportId) {
      loadReport()
    }
  }, [reportId])

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const myId = session?.user?.id || null
      setUid(myId)
      if (myId) {
        const { data: prof } = await supabase.from('profiles').select('role').eq('id', myId).single()
        const role = (prof as any)?.role
        setIsManager(role === 'manager' || role === 'owner')
      }
    })()
  }, [])

  async function loadReport() {
    setLoading(true)
    setErrorMessage('')

    try {
      const { data, error } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('id', Number(reportId))
        .single()

      if (error) {
        setErrorMessage(error.message)
        setReport(null)
      } else {
        setReport(data)
      }
    } catch (error: any) {
      setErrorMessage(error?.message || t('failedToLoadReport'))
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>{t('loading')}</Text>
      </SafeAreaView>
    )
  }

  if (errorMessage || !report) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <Text style={{ color: '#EF4444', fontWeight: '700', marginBottom: 10 }}>
          {t('error')}
        </Text>
        <Text style={{ color: COLORS.text, textAlign: 'center' }}>
          {errorMessage || t('reportNotFound')}
        </Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View
          style={{
            backgroundColor: COLORS.card,
            borderRadius: 24,
            padding: 20,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text
            style={{
              fontSize: 28,
              fontWeight: '800',
              color: COLORS.navy,
              marginBottom: 8,
            }}
          >
            {t('dailyReport')}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 6 }}>
            {`${t('date')}: ${report.report_date}`}
          </Text>

          <Text style={{ color: COLORS.subtext }}>
            {`${t('preparedBy')}: ${report.created_by_name || t('unknown')}`}
          </Text>

          {(isManager || (uid && report.created_by === uid)) && (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/project/[id]/new-report',
                  params: {
                    id: String(id),
                    reportId: String(report.id),
                    reportDate: report.report_date || '',
                    workCompleted: report.work_completed || '',
                    issues: report.issues || '',
                    materialsUsed: report.materials_used || '',
                    weather: report.weather || '',
                  },
                })
              }
              style={{ marginTop: 14, backgroundColor: COLORS.navy, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ color: COLORS.white, fontWeight: '800' }}>{t('rfiEdit')}</Text>
            </Pressable>
          )}
        </View>

        <DetailCard
          icon="hammer-wrench"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          title={t('workCompleted')}
          value={report.work_completed || t('none')}
        />

        <DetailCard
          icon="alert-circle-outline"
          iconBg="#FEF2F2"
          iconColor="#EF4444"
          title={t('issuesDelays')}
          value={report.issues || t('none')}
        />

        <DetailCard
          icon="weather-partly-cloudy"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          title={t('weather')}
          value={report.weather || t('none')}
        />
      </ScrollView>
    </SafeAreaView>
  )
}