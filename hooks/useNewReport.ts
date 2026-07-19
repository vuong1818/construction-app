import { useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { createDailyReport, updateDailyReport } from '../services/reportService'

type ReportInitial = Partial<{
  reportDate: string
  workCompleted: string
  issues: string
  materialsUsed: string
  weather: string
}>

type UseNewReportParams = {
  projectId?: number
  reportId?: number       // when set, save UPDATES this report instead of creating
  initial?: ReportInitial // seed values when editing
  onSaved?: () => void
}

type UseNewReportResult = {
  reportDate: string
  workCompleted: string
  issues: string
  materialsUsed: string
  weather: string
  saving: boolean
  setReportDate: (value: string) => void
  setWorkCompleted: (value: string) => void
  setIssues: (value: string) => void
  setMaterialsUsed: (value: string) => void
  setWeather: (value: string) => void
  handleSave: () => Promise<void>
  canSave: boolean
}

export function useNewReport({
  projectId,
  reportId,
  initial,
  onSaved,
}: UseNewReportParams): UseNewReportResult {
  const [reportDate, setReportDate] = useState(
    initial?.reportDate || new Date().toISOString().split('T')[0]
  )
  const [workCompleted, setWorkCompleted] = useState(initial?.workCompleted || '')
  const [issues, setIssues] = useState(initial?.issues || '')
  const [materialsUsed, setMaterialsUsed] = useState(initial?.materialsUsed || '')
  const [weather, setWeather] = useState(initial?.weather || '')
  const [saving, setSaving] = useState(false)

  const canSave = useMemo(() => {
    return Boolean(projectId) && Boolean(reportDate.trim()) && Boolean(workCompleted.trim()) && !saving
  }, [projectId, reportDate, workCompleted, saving])

  async function handleSave() {
    if (!projectId) {
      Alert.alert('Error', 'Invalid project.')
      return
    }

    try {
      setSaving(true)

      const input = { projectId, reportDate, workCompleted, issues, materialsUsed, weather }
      if (reportId) {
        await updateDailyReport(reportId, input)
        Alert.alert('Success', 'Report updated')
      } else {
        await createDailyReport(input)
        Alert.alert('Success', 'Report saved')
      }
      onSaved?.()
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not save report.')
    } finally {
      setSaving(false)
    }
  }

  return {
    reportDate,
    workCompleted,
    issues,
    materialsUsed,
    weather,
    saving,
    setReportDate,
    setWorkCompleted,
    setIssues,
    setMaterialsUsed,
    setWeather,
    handleSave,
    canSave,
  }
}