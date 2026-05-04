import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#D6E8FF',
  card: '#FFFFFF',
  navy: '#16356B',
  navySoft: '#EAF0F8',
  teal: '#19B6D2',
  tealSoft: '#E7F9FC',
  red: '#EF4444',
  redSoft: '#FEF2F2',
  text: '#0F172A',
  sub: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Report = {
  id: number
  project_id: number | null
  report_date: string | null
  created_by_name: string | null
  work_completed: string | null
  issues: string | null
  materials_used: string | null
  weather: string | null
  created_at: string
  // joined
  project_name: string | null
}

type Project = { id: number; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  // Handle YYYY-MM-DD strings without timezone shift
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function initial(name: string | null): string {
  return (name || '?').charAt(0).toUpperCase()
}

// ─── Report Detail Modal ──────────────────────────────────────────────────────
function ReportModal({ report, visible, onClose }: { report: Report | null; visible: boolean; onClose: () => void }) {
  const { t } = useLanguage()
  if (!report) return null
  const rows: { label: string; value: string | null }[] = [
    { label: t('project'),         value: report.project_name },
    { label: t('workerLabel'),     value: report.created_by_name },
    { label: t('reportDate'),      value: fmtDate(report.report_date) },
    { label: t('workCompleted'),   value: report.work_completed },
    { label: t('issuesDelays'),    value: report.issues },
    { label: t('materialsUsed'),   value: report.materials_used },
    { label: t('weather'),         value: report.weather },
  ]
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ backgroundColor: C.navy, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, color: C.white, fontWeight: '900', fontSize: 18 }}>{t('dailyReport')}</Text>
          <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: C.white, fontSize: 22 }}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {rows.map(row =>
            row.value ? (
              <View key={row.label} style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                  {row.label}
                </Text>
                <View style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12 }}>
                  <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{row.value}</Text>
                </View>
              </View>
            ) : null
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ManagerReportsScreen() {
  const { t } = useLanguage()
  const [reports, setReports]         = useState<Report[]>([])
  const [projects, setProjects]       = useState<Project[]>([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [filterProject, setFilterProject] = useState<number | null>(null)
  const [showFilter, setShowFilter]   = useState(false)
  const [selected, setSelected]       = useState<Report | null>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadReports(), loadProjects()])
    setLoading(false)
  }

  async function onRefresh() {
    setRefreshing(true)
    await loadAll()
    setRefreshing(false)
  }

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .order('name', { ascending: true })
    setProjects((data as Project[]) || [])
  }

  async function loadReports() {
    const { data, error } = await supabase
      .from('daily_reports')
      .select(`
        id,
        project_id,
        report_date,
        created_by_name,
        work_completed,
        issues,
        materials_used,
        weather,
        created_at,
        projects ( name )
      `)
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('loadReports:', error)
      setReports([])
      return
    }

    const mapped: Report[] = ((data as any[]) || []).map(r => ({
      id: r.id,
      project_id: r.project_id,
      report_date: r.report_date,
      created_by_name: r.created_by_name,
      work_completed: r.work_completed,
      issues: r.issues,
      materials_used: r.materials_used,
      weather: r.weather,
      created_at: r.created_at,
      project_name: r.projects?.name || null,
    }))
    setReports(mapped)
  }

  async function deleteReport(report: Report) {
    Alert.alert(
      t('deleteReport'),
      t('deleteReportConfirm', { worker: report.created_by_name || t('workerFallback'), date: fmtDate(report.report_date) }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'), style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('daily_reports').delete().eq('id', report.id)
            if (error) { Alert.alert(t('error'), error.message); return }
            setReports(prev => prev.filter(r => r.id !== report.id))
            if (selected?.id === report.id) setSelected(null)
          },
        },
      ]
    )
  }

  const filtered = filterProject !== null
    ? reports.filter(r => r.project_id === filterProject)
    : reports

  const activeProjectName = filterProject !== null
    ? projects.find(p => p.id === filterProject)?.name
    : null

  // ─── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={C.teal} />
        <Text style={{ marginTop: 12, color: C.sub }}>{t('loadingReports')}</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>

      {/* ── Filter bar ── */}
      <View style={{
        backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border,
        paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10,
      }}>
        <Pressable
          onPress={() => setShowFilter(true)}
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: filterProject !== null ? C.navySoft : '#F1F5F9',
            borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
            borderWidth: 1, borderColor: filterProject !== null ? C.navy : C.border,
          }}
        >
          <Text style={{ fontSize: 14 }}>🏗️</Text>
          <Text style={{ flex: 1, color: filterProject !== null ? C.navy : C.sub, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
            {activeProjectName || t('allProjects')}
          </Text>
          <Text style={{ color: C.sub }}>▾</Text>
        </Pressable>
        {filterProject !== null && (
          <Pressable
            onPress={() => setFilterProject(null)}
            style={{ backgroundColor: C.redSoft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <Text style={{ color: C.red, fontWeight: '800', fontSize: 13 }}>{t('clear')}</Text>
          </Pressable>
        )}
        <View style={{ backgroundColor: C.navySoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text style={{ color: C.navy, fontWeight: '900', fontSize: 13 }}>{filtered.length}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filtered.length === 0 ? (
          <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: C.border, marginTop: 20 }}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>📋</Text>
            <Text style={{ color: C.navy, fontWeight: '800', fontSize: 18, marginBottom: 6 }}>{t('noReportsTitle')}</Text>
            <Text style={{ color: C.sub, textAlign: 'center' }}>
              {filterProject !== null ? t('noReportsForProject') : t('noReportsSubmitted')}
            </Text>
          </View>
        ) : (
          filtered.map(report => (
            <View
              key={report.id}
              style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.navy, justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                  <Text style={{ color: C.white, fontWeight: '900', fontSize: 17 }}>{initial(report.created_by_name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: '800', fontSize: 14 }}>
                    {report.created_by_name || t('unknownWorkerLabel')}
                  </Text>
                  <Text style={{ color: C.teal, fontSize: 12, fontWeight: '700', marginTop: 1 }}>
                    {report.project_name || t('unknownProjectLabel')}
                  </Text>
                  <Text style={{ color: C.sub, fontSize: 12, marginTop: 1 }}>
                    {fmtDate(report.report_date)}
                  </Text>
                </View>
              </View>

              {report.work_completed ? (
                <Text style={{ color: C.text, fontSize: 13, lineHeight: 18, marginBottom: 10 }} numberOfLines={3}>
                  {report.work_completed}
                </Text>
              ) : null}

              {/* Tag pills */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {report.issues ? (
                  <View style={{ backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: '#92400E', fontSize: 11, fontWeight: '700' }}>{t('issuesNoted')}</Text>
                  </View>
                ) : null}
                {report.materials_used ? (
                  <View style={{ backgroundColor: C.tealSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: C.teal, fontSize: 11, fontWeight: '700' }}>{t('materialsListed')}</Text>
                  </View>
                ) : null}
                {report.weather ? (
                  <View style={{ backgroundColor: '#F0FDF4', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: '#166534', fontSize: 11, fontWeight: '700' }}>🌤 {report.weather}</Text>
                  </View>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => setSelected(report)}
                  style={{ flex: 1, backgroundColor: C.navySoft, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                >
                  <Text style={{ color: C.navy, fontWeight: '800', fontSize: 13 }}>{t('viewFullReport')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => deleteReport(report)}
                  style={{ backgroundColor: C.redSoft, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' }}
                >
                  <Text style={{ color: C.red, fontWeight: '800', fontSize: 13 }}>🗑</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Project Filter Modal ── */}
      <Modal visible={showFilter} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFilter(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={{ backgroundColor: C.navy, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: C.white, fontWeight: '900', fontSize: 18 }}>{t('filterByProject')}</Text>
            <Pressable onPress={() => setShowFilter(false)}>
              <Text style={{ color: C.white, fontSize: 22 }}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Pressable
              onPress={() => { setFilterProject(null); setShowFilter(false) }}
              style={{
                backgroundColor: filterProject === null ? C.navy : C.card,
                borderRadius: 14, padding: 16, marginBottom: 8,
                borderWidth: 1, borderColor: filterProject === null ? C.navy : C.border,
              }}
            >
              <Text style={{ color: filterProject === null ? C.white : C.text, fontWeight: '800', fontSize: 15 }}>
                {t('allProjects')}
              </Text>
            </Pressable>
            {projects.map(p => (
              <Pressable
                key={p.id}
                onPress={() => { setFilterProject(p.id); setShowFilter(false) }}
                style={{
                  backgroundColor: filterProject === p.id ? C.navy : C.card,
                  borderRadius: 14, padding: 16, marginBottom: 8,
                  borderWidth: 1, borderColor: filterProject === p.id ? C.navy : C.border,
                }}
              >
                <Text style={{ color: filterProject === p.id ? C.white : C.text, fontWeight: '700', fontSize: 15 }}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Report Detail Modal ── */}
      <ReportModal report={selected} visible={!!selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  )
}
