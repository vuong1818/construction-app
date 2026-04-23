import { useEffect, useState } from 'react'
import { Alert } from 'react-native'
import {
    WorkerFormValues,
    WorkerProfile,
    createWorker,
    deleteWorker,
    getEmptyWorkerForm,
    listWorkers,
    toWorkerFormValues,
    updateWorker,
} from '../services/workerService'

type UseWorkersResult = {
  workers: WorkerProfile[]
  loading: boolean
  saving: boolean
  errorMessage: string
  modalVisible: boolean
  editingWorker: WorkerProfile | null
  form: WorkerFormValues
  setModalVisible: (value: boolean) => void
  setForm: (value: WorkerFormValues) => void
  refresh: () => Promise<void>
  openCreateModal: () => void
  openEditModal: (worker: WorkerProfile) => void
  handleSave: () => Promise<void>
  handleDelete: (worker: WorkerProfile) => void
}

export function useWorkers(): UseWorkersResult {
  const [workers, setWorkers] = useState<WorkerProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [modalVisible, setModalVisible] = useState(false)
  const [editingWorker, setEditingWorker] = useState<WorkerProfile | null>(null)
  const [form, setForm] = useState<WorkerFormValues>(getEmptyWorkerForm())

  async function refresh() {
    setLoading(true)
    setErrorMessage('')

    try {
      const data = await listWorkers()
      setWorkers(data)
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to load workers.')
      setWorkers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  function openCreateModal() {
    setEditingWorker(null)
    setForm(getEmptyWorkerForm())
    setModalVisible(true)
  }

  function openEditModal(worker: WorkerProfile) {
    setEditingWorker(worker)
    setForm(toWorkerFormValues(worker))
    setModalVisible(true)
  }

  async function handleSave() {
    try {
      setSaving(true)

      if (editingWorker) {
        await updateWorker(editingWorker.id, form)
        Alert.alert('Success', 'Worker updated.')
      } else {
        await createWorker(form)
        Alert.alert('Success', 'Worker added.')
      }

      setModalVisible(false)
      setEditingWorker(null)
      setForm(getEmptyWorkerForm())
      await refresh()
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not save worker.')
    } finally {
      setSaving(false)
    }
  }

  function handleDelete(worker: WorkerProfile) {
    Alert.alert(
      'Delete Worker',
      `Are you sure you want to delete ${worker.full_name || 'this worker'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true)
              await deleteWorker(worker.id)
              Alert.alert('Success', 'Worker deleted.')
              await refresh()
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Could not delete worker.')
            } finally {
              setSaving(false)
            }
          },
        },
      ]
    )
  }

  return {
    workers,
    loading,
    saving,
    errorMessage,
    modalVisible,
    editingWorker,
    form,
    setModalVisible,
    setForm,
    refresh,
    openCreateModal,
    openEditModal,
    handleSave,
    handleDelete,
  }
}