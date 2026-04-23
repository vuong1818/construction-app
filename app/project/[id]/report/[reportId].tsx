import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { supabase } from '../../../../lib/supabase'

type DailyReport = {
  id: number
  report_date: string
  created_by_name: string | null
  work_completed: string | null
  issues: string | null
  materials_used: string | null
  weather: string | null
  created_at: string
}

const COLORS = {
  background: '#F6F8FB',
  card: '#FFFFFF',
  navy: '#16356B',
  teal: '#19B6D2',
  tealSoft: '#E7F9FC',
  navySoft: '#EAF0F8',
  text: '#0F172A',
  subtext: '#64748B',
  border: '#E2E8F0',
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
        {value || 'None'}
      </Text>
    </View>
  )
}

export default function DailyReportDetailScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>()
  const [report, setReport] = useState<DailyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (reportId) {
      loadReport()
    }
  }, [reportId])

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
      setErrorMessage(error?.message || 'Failed to load report.')
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
        <Text style={{ marginTop: 12, color: COLORS.text }}>Loading...</Text>
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
          Error
        </Text>
        <Text style={{ color: COLORS.text, textAlign: 'center' }}>
          {errorMessage || 'Report not found.'}
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
            Daily Report
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 6 }}>
            Date: {report.report_date}
          </Text>

          <Text style={{ color: COLORS.subtext }}>
            Prepared By: {report.created_by_name || 'Unknown'}
          </Text>
        </View>

        <DetailCard
          icon="hammer-wrench"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          title="Work Completed"
          value={report.work_completed || 'None'}
        />

        <DetailCard
          icon="alert-circle-outline"
          iconBg="#FEF2F2"
          iconColor="#EF4444"
          title="Issues / Delays"
          value={report.issues || 'None'}
        />

        <DetailCard
          icon="package-variant-closed"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          title="Materials Used"
          value={report.materials_used || 'None'}
        />

        <DetailCard
          icon="weather-partly-cloudy"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          title="Weather"
          value={report.weather || 'None'}
        />
      </ScrollView>
    </SafeAreaView>
  )
}