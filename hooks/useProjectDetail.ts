import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { useCallback, useEffect, useState } from 'react'
import { Alert } from 'react-native'
import {
    DailyReport,
    Project,
    ProjectFile,
    getPhotoUrl,
    loadProjectDetail,
    openPlan,
    reloadPhotos,
    reloadPlans,
    reloadReports,
    uploadProjectFile,
} from '../services/projectDetailService'

type UseProjectDetailResult = {
  project: Project | null
  photos: ProjectFile[]
  plans: ProjectFile[]
  reports: DailyReport[]
  loading: boolean
  uploading: boolean
  errorMessage: string
  plansModalVisible: boolean
  reportsModalVisible: boolean
  photosModalVisible: boolean
  selectedPhotoIndex: number
  setPlansModalVisible: (value: boolean) => void
  setReportsModalVisible: (value: boolean) => void
  setPhotosModalVisible: (value: boolean) => void
  refreshAll: () => Promise<void>
  pickPhotoFromLibrary: () => Promise<void>
  takePhotoWithCamera: () => Promise<void>
  uploadPlan: () => Promise<void>
  handleOpenPlan: (plan: ProjectFile) => Promise<void>
  openPhotoViewer: () => void
  openPlansViewer: () => void
  openReportsViewer: () => void
  nextPhoto: () => void
  prevPhoto: () => void
  currentPhotoUrl: string | null
}

export function useProjectDetail(projectId?: number): UseProjectDetailResult {
  const [project, setProject] = useState<Project | null>(null)
  const [photos, setPhotos] = useState<ProjectFile[]>([])
  const [plans, setPlans] = useState<ProjectFile[]>([])
  const [reports, setReports] = useState<DailyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [plansModalVisible, setPlansModalVisible] = useState(false)
  const [reportsModalVisible, setReportsModalVisible] = useState(false)
  const [photosModalVisible, setPhotosModalVisible] = useState(false)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)

  const refreshAll = useCallback(async () => {
    if (!projectId) return

    setLoading(true)
    setErrorMessage('')

    try {
      const data = await loadProjectDetail(projectId)
      setProject(data.project)
      setPhotos(data.photos)
      setPlans(data.plans)
      setReports(data.reports)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to load project.')
      setProject(null)
      setPhotos([])
      setPlans([])
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  async function refreshPhotosOnly() {
    if (!projectId) return
    const nextPhotos = await reloadPhotos(projectId)
    setPhotos(nextPhotos)
  }

  async function refreshPlansOnly() {
    if (!projectId) return
    const nextPlans = await reloadPlans(projectId)
    setPlans(nextPlans)
  }

  async function refreshReportsOnly() {
    if (!projectId) return
    const nextReports = await reloadReports(projectId)
    setReports(nextReports)
  }

  async function pickPhotoFromLibrary() {
    if (!projectId) return

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photos.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    })

    if (result.canceled || !result.assets?.length) return

    try {
      setUploading(true)

      const asset = result.assets[0]
      const originalName = asset.fileName || `photo-${Date.now()}.jpg`

      await uploadProjectFile({
        projectId,
        uri: asset.uri,
        originalName,
        bucketName: 'project-photos',
        mimeType: asset.mimeType || 'image/jpeg',
      })

      await refreshPhotosOnly()
      Alert.alert('Success', 'Photo uploaded')
    } catch (error: any) {
      Alert.alert('Upload error', error?.message || 'Something went wrong')
    } finally {
      setUploading(false)
    }
  }

  async function takePhotoWithCamera() {
    if (!projectId) return

    const permission = await ImagePicker.requestCameraPermissionsAsync()

    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow camera access.')
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      cameraType: ImagePicker.CameraType.back,
    })

    if (result.canceled || !result.assets?.length) return

    try {
      setUploading(true)

      const asset = result.assets[0]
      const originalName = asset.fileName || `camera-photo-${Date.now()}.jpg`

      await uploadProjectFile({
        projectId,
        uri: asset.uri,
        originalName,
        bucketName: 'project-photos',
        mimeType: asset.mimeType || 'image/jpeg',
      })

      await refreshPhotosOnly()
      Alert.alert('Success', 'Photo uploaded')
    } catch (error: any) {
      Alert.alert('Upload error', error?.message || 'Something went wrong')
    } finally {
      setUploading(false)
    }
  }

  async function uploadPlan() {
    if (!projectId) return

    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    })

    if (result.canceled || !result.assets?.length) return

    try {
      setUploading(true)

      const asset = result.assets[0]

      await uploadProjectFile({
        projectId,
        uri: asset.uri,
        originalName: asset.name || `plan-${Date.now()}.pdf`,
        bucketName: 'project-plans',
        mimeType: asset.mimeType || 'application/pdf',
      })

      await refreshPlansOnly()
      Alert.alert('Success', 'Plan uploaded')
    } catch (error: any) {
      Alert.alert('Upload error', error?.message || 'Something went wrong')
    } finally {
      setUploading(false)
    }
  }

  async function handleOpenPlan(plan: ProjectFile) {
    try {
      await openPlan(plan)
    } catch (error: any) {
      Alert.alert('Missing File', error?.message || 'Could not open plan.')
    }
  }

  function openPhotoViewer() {
    if (photos.length === 0) {
      Alert.alert('Photos', 'There are no photos to view yet.')
      return
    }

    setSelectedPhotoIndex(0)
    setPhotosModalVisible(true)
  }

  function openPlansViewer() {
    if (plans.length === 0) {
      Alert.alert('Plans', 'There are no plans to view yet.')
      return
    }

    setPlansModalVisible(true)
  }

  function openReportsViewer() {
    if (reports.length === 0) {
      Alert.alert('Daily Reports', 'There are no reports to view yet.')
      return
    }

    setReportsModalVisible(true)
  }

  function nextPhoto() {
    setSelectedPhotoIndex((prev) => (prev + 1) % photos.length)
  }

  function prevPhoto() {
    setSelectedPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length)
  }

  const currentPhotoUrl =
    photos.length > 0 && photos[selectedPhotoIndex]
      ? getPhotoUrl(photos[selectedPhotoIndex])
      : null

  return {
    project,
    photos,
    plans,
    reports,
    loading,
    uploading,
    errorMessage,
    plansModalVisible,
    reportsModalVisible,
    photosModalVisible,
    selectedPhotoIndex,
    setPlansModalVisible,
    setReportsModalVisible,
    setPhotosModalVisible,
    refreshAll,
    pickPhotoFromLibrary,
    takePhotoWithCamera,
    uploadPlan,
    handleOpenPlan,
    openPhotoViewer,
    openPlansViewer,
    openReportsViewer,
    nextPhoto,
    prevPhoto,
    currentPhotoUrl,
  }
}