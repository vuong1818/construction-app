import { useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { createDailyReport } from '../services/reportService'

type UseNewReportParams = {
  projectId?: number
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
  onSaved,
}: UseNewReportParams): UseNewReportResult {
  const [reportDate, setReportDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [workCompleted, setWorkCompleted] = useState('')
  const [issues, setIssues] = useState('')
  const [materialsUsed, setMaterialsUsed] = useState('')
  const [weather, setWeather] = useState('')
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

      await createDailyReport({
        projectId,
        reportDate,
        workCompleted,
        issues,
        materialsUsed,
        weather,
      })

      Alert.alert('Success', 'Report saved')
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