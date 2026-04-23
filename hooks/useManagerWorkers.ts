import { useEffect, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import {
    createWorker,
    deleteWorker,
    listWorkers,
    updateWorker,
    UpsertWorkerInput,
    WorkerRecord,
} from '../services/managerWorkersService'

type WorkerFormState = {
  first_name: string
  last_name: string
  phone: string
  email: string
  street: string
  city: string
  state: string
  zip: string
  wage: string
  role: 'worker' | 'manager'
}

const emptyForm: WorkerFormState = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  street: '',
  city: '',
  state: 'TX',
  zip: '',
  wage: '',
  role: 'worker',
}

export function useManagerWorkers() {
  const [workers, setWorkers] = useState<WorkerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [modalVisible, setModalVisible] = useState(false)
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null)
  const [form, setForm] = useState<WorkerFormState>(emptyForm)
  const [searchText, setSearchText] = useState('')

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
    setEditingWorkerId(null)
    setForm(emptyForm)
    setModalVisible(true)
  }

  function openEditModal(worker: WorkerRecord) {
    setEditingWorkerId(worker.id)
    setForm({
      first_name: worker.first_name || '',
      last_name: worker.last_name || '',
      phone: worker.phone || '',
      email: worker.email || '',
      street: worker.street || '',
      city: worker.city || '',
      state: worker.state || 'TX',
      zip: worker.zip || '',
      wage: worker.wage != null ? String(worker.wage) : '',
      role: worker.role === 'manager' ? 'manager' : 'worker',
    })
    setModalVisible(true)
  }

  function closeModal() {
    setModalVisible(false)
    setEditingWorkerId(null)
    setForm(emptyForm)
  }

  function updateForm<K extends keyof WorkerFormState>(key: K, value: WorkerFormState[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  async function saveWorker() {
    try {
      setSaving(true)

      const payload: UpsertWorkerInput = {
        ...form,
      }

      if (editingWorkerId) {
        await updateWorker(editingWorkerId, payload)
        Alert.alert('Success', 'Worker updated.')
      } else {
        await createWorker(payload)
        Alert.alert('Success', 'Worker created.')
      }

      closeModal()
      await refresh()
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not save worker.')
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete(worker: WorkerRecord) {
    const name =
      `${worker.first_name || ''} ${worker.last_name || ''}`.trim() ||
      worker.full_name ||
      worker.email ||
      'this worker'

    Alert.alert(
      'Delete Worker',
      `Are you sure you want to delete ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWorker(worker.id)
              Alert.alert('Success', 'Worker deleted.')
              await refresh()
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Could not delete worker.')
            }
          },
        },
      ]
    )
  }

  const filteredWorkers = useMemo(() => {
    const query = searchText.trim().toLowerCase()

    if (!query) return workers

    return workers.filter((worker) => {
      const fullName =
        `${worker.first_name || ''} ${worker.last_name || ''}`.trim().toLowerCase()
      const email = (worker.email || '').toLowerCase()
      const phone = (worker.phone || '').toLowerCase()

      return (
        fullName.includes(query) ||
        email.includes(query) ||
        phone.includes(query)
      )
    })
  }, [workers, searchText])

  return {
    workers: filteredWorkers,
    loading,
    saving,
    errorMessage,
    modalVisible,
    editingWorkerId,
    form,
    searchText,
    setSearchText,
    refresh,
    openCreateModal,
    openEditModal,
    closeModal,
    updateForm,
    saveWorker,
    confirmDelete,
  }
}