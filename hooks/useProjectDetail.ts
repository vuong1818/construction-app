import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { useCallback, useEffect, useState } from 'react'
import { Alert } from 'react-native'
import {
    DailyReport,
    DocType,
    PlanType,
    Project,
    ProjectFile,
    deleteProjectDocument,
    deleteProjectPhoto,
    deleteProjectPlan,
    getPhotoUrl,
    loadProjectDetail,
    openDocument,
    openPlan,
    reloadDocuments,
    reloadPhotos,
    reloadPlans,
    reloadReports,
    updatePhotoCaption,
    uploadProjectDocument,
    uploadProjectFile,
} from '../services/projectDetailService'
import { supabase } from '../lib/supabase'

type UseProjectDetailResult = {
  project: Project | null
  photos: ProjectFile[]
  plans: ProjectFile[]
  documents: ProjectFile[]
  reports: DailyReport[]
  loading: boolean
  uploading: boolean
  errorMessage: string
  plansModalVisible: boolean
  reportsModalVisible: boolean
  photosModalVisible: boolean
  documentsModalVisible: boolean
  selectedPhotoIndex: number
  setPlansModalVisible: (value: boolean) => void
  setReportsModalVisible: (value: boolean) => void
  setPhotosModalVisible: (value: boolean) => void
  setDocumentsModalVisible: (value: boolean) => void
  refreshAll: () => Promise<void>
  pickPhotoFromLibrary: () => Promise<void>
  takePhotoWithCamera: () => Promise<void>
  uploadPlan: (planType: PlanType) => Promise<void>
  uploadDocument: (docType: DocType) => Promise<void>
  handleOpenPlan: (plan: ProjectFile) => Promise<void>
  handleDeletePlan: (plan: ProjectFile) => void
  handleOpenDocument: (doc: ProjectFile) => Promise<void>
  handleDeleteDocument: (doc: ProjectFile) => void
  openPhotoViewer: () => void
  openPlansViewer: () => void
  openReportsViewer: () => void
  openDocumentsViewer: () => void
  nextPhoto: () => void
  prevPhoto: () => void
  currentPhotoUrl: string | null
  savePhotoCaption: (photoId: number, caption: string) => Promise<void>
  handleDeletePhoto: (photo: ProjectFile) => void
  currentUserId: string | null
}

export function useProjectDetail(projectId?: number): UseProjectDetailResult {
  const [project, setProject] = useState<Project | null>(null)
  const [photos, setPhotos] = useState<ProjectFile[]>([])
  const [plans, setPlans] = useState<ProjectFile[]>([])
  const [documents, setDocuments] = useState<ProjectFile[]>([])
  const [reports, setReports] = useState<DailyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [plansModalVisible, setPlansModalVisible] = useState(false)
  const [reportsModalVisible, setReportsModalVisible] = useState(false)
  const [photosModalVisible, setPhotosModalVisible] = useState(false)
  const [documentsModalVisible, setDocumentsModalVisible] = useState(false)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setCurrentUserId(session?.user?.id ?? null)
    })()
  }, [])

  const refreshAll = useCallback(async () => {
    if (!projectId) return

    setLoading(true)
    setErrorMessage('')

    try {
      const data = await loadProjectDetail(projectId)
      setProject(data.project)
      setPhotos(data.photos)
      setPlans(data.plans)
      setDocuments(data.documents)
      setReports(data.reports)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to load project.')
      setProject(null)
      setPhotos([])
      setPlans([])
      setDocuments([])
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

  async function refreshDocumentsOnly() {
    if (!projectId) return
    const nextDocuments = await reloadDocuments(projectId)
    setDocuments(nextDocuments)
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

  async function uploadPlan(planType: PlanType) {
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
        planType,
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

  function handleDeletePlan(plan: ProjectFile) {
    Alert.alert(
      'Delete Plan',
      `Delete "${plan.original_name || plan.file_name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await deleteProjectPlan(plan)
              await refreshPlansOnly()
            } catch (error: any) {
              Alert.alert('Delete error', error?.message || 'Could not delete plan.')
            }
          },
        },
      ]
    )
  }

  async function uploadDocument(docType: DocType) {
    if (!projectId) return

    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    })

    if (result.canceled || !result.assets?.length) return

    try {
      setUploading(true)

      const asset = result.assets[0]

      await uploadProjectDocument({
        projectId,
        uri: asset.uri,
        originalName: asset.name || `document-${Date.now()}`,
        mimeType: asset.mimeType || 'application/octet-stream',
        docType,
      })

      await refreshDocumentsOnly()
      Alert.alert('Success', 'Document uploaded')
    } catch (error: any) {
      Alert.alert('Upload error', error?.message || 'Something went wrong')
    } finally {
      setUploading(false)
    }
  }

  async function handleOpenDocument(doc: ProjectFile) {
    try {
      await openDocument(doc)
    } catch (error: any) {
      Alert.alert('Missing File', error?.message || 'Could not open document.')
    }
  }

  function handleDeleteDocument(doc: ProjectFile) {
    Alert.alert(
      'Delete Document',
      `Delete "${doc.original_name || doc.file_name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await deleteProjectDocument(doc)
              await refreshDocumentsOnly()
            } catch (error: any) {
              Alert.alert('Delete error', error?.message || 'Could not delete document.')
            }
          },
        },
      ]
    )
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

  function openDocumentsViewer() {
    if (documents.length === 0) {
      Alert.alert('Documents', 'There are no documents to view yet.')
      return
    }

    setDocumentsModalVisible(true)
  }

  function handleDeletePhoto(photo: ProjectFile) {
    Alert.alert(
      'Delete Photo',
      'Delete this photo? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await deleteProjectPhoto(photo)
              const next = photos.filter(p => p.id !== photo.id)
              setPhotos(next)
              if (next.length === 0) {
                setPhotosModalVisible(false)
                setSelectedPhotoIndex(0)
              } else if (selectedPhotoIndex >= next.length) {
                setSelectedPhotoIndex(next.length - 1)
              }
            } catch (error: any) {
              Alert.alert('Delete error', error?.message || 'Could not delete photo.')
            }
          },
        },
      ]
    )
  }

  async function savePhotoCaption(photoId: number, caption: string) {
    try {
      const trimmed = caption.trim()
      await updatePhotoCaption(photoId, trimmed.length === 0 ? null : trimmed)
      setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, caption: trimmed.length === 0 ? null : trimmed } : p))
    } catch (e: any) {
      Alert.alert('Save error', e?.message || 'Could not save the photo note.')
      throw e
    }
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
    documents,
    reports,
    loading,
    uploading,
    errorMessage,
    plansModalVisible,
    reportsModalVisible,
    photosModalVisible,
    documentsModalVisible,
    selectedPhotoIndex,
    setPlansModalVisible,
    setReportsModalVisible,
    setPhotosModalVisible,
    setDocumentsModalVisible,
    refreshAll,
    pickPhotoFromLibrary,
    takePhotoWithCamera,
    uploadPlan,
    uploadDocument,
    handleOpenPlan,
    handleDeletePlan,
    handleOpenDocument,
    handleDeleteDocument,
    openPhotoViewer,
    openPlansViewer,
    openReportsViewer,
    openDocumentsViewer,
    nextPhoto,
    prevPhoto,
    currentPhotoUrl,
    savePhotoCaption,
    handleDeletePhoto,
    currentUserId,
  }
}