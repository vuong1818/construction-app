import { supabase } from '../lib/supabase'
import authService from './authService'

export type WorkerProfile = {
  id: string
  role: string | null
  full_name: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  email: string | null
  address_street: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  wage: number | null
}

export type WorkerFormValues = {
  first_name: string
  last_name: string
  phone: string
  email: string
  address_street: string
  address_city: string
  address_state: string
  address_zip: string
  wage: string
  role: 'worker' | 'manager'
}

export function getEmptyWorkerForm(): WorkerFormValues {
  return {
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    address_street: '',
    address_city: '',
    address_state: 'TX',
    address_zip: '',
    wage: '',
    role: 'worker',
  }
}

export function toWorkerFormValues(worker?: WorkerProfile | null): WorkerFormValues {
  if (!worker) return getEmptyWorkerForm()

  return {
    first_name: worker.first_name || '',
    last_name: worker.last_name || '',
    phone: worker.phone || '',
    email: worker.email || '',
    address_street: worker.address_street || '',
    address_city: worker.address_city || '',
    address_state: worker.address_state || 'TX',
    address_zip: worker.address_zip || '',
    wage: worker.wage !== null && worker.wage !== undefined ? String(worker.wage) : '',
    role: worker.role === 'manager' ? 'manager' : 'worker',
  }
}

export function validateWorkerForm(values: WorkerFormValues) {
  if (!values.first_name.trim()) {
    throw new Error('First name is required.')
  }

  if (!values.last_name.trim()) {
    throw new Error('Last name is required.')
  }

  if (!values.phone.trim()) {
    throw new Error('Phone number is required.')
  }

  if (!values.email.trim()) {
    throw new Error('Email is required.')
  }

  const email = values.email.trim().toLowerCase()
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailPattern.test(email)) {
    throw new Error('Please enter a valid email address.')
  }

  if (!values.address_street.trim()) {
    throw new Error('Street address is required.')
  }

  if (!values.address_city.trim()) {
    throw new Error('City is required.')
  }

  if (!values.address_state.trim()) {
    throw new Error('State is required.')
  }

  if (!values.address_zip.trim()) {
    throw new Error('ZIP code is required.')
  }

  const wageNumber = Number(values.wage)

  if (!values.wage.trim() || Number.isNaN(wageNumber) || wageNumber < 0) {
    throw new Error('Please enter a valid wage.')
  }
}

function buildFullName(firstName: string, lastName: string) {
  return `${firstName.trim()} ${lastName.trim()}`.trim()
}

export async function requireManagerAccess() {
  const profile = await authService.getCurrentUserProfile()

  if ((profile.role || 'worker') !== 'manager') {
    throw new Error('Manager access is required.')
  }

  return profile
}

export async function listWorkers(): Promise<WorkerProfile[]> {
  await requireManagerAccess()

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      role,
      full_name,
      first_name,
      last_name,
      phone,
      email,
      address_street,
      address_city,
      address_state,
      address_zip,
      wage
    `)
    .order('first_name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data || []) as WorkerProfile[]
}

export async function createWorker(values: WorkerFormValues) {
  await requireManagerAccess()
  validateWorkerForm(values)

  const firstName = values.first_name.trim()
  const lastName = values.last_name.trim()

  const payload = {
    role: values.role,
    first_name: firstName,
    last_name: lastName,
    phone: values.phone.trim(),
    email: values.email.trim().toLowerCase(),
    address_street: values.address_street.trim(),
    address_city: values.address_city.trim(),
    address_state: values.address_state.trim().toUpperCase(),
    address_zip: values.address_zip.trim(),
    wage: Number(values.wage),
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert(payload)
    .select(`
      id,
      role,
      full_name,
      first_name,
      last_name,
      phone,
      email,
      address_street,
      address_city,
      address_state,
      address_zip,
      wage
    `)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as WorkerProfile
}

export async function updateWorker(workerId: string, values: WorkerFormValues) {
  await requireManagerAccess()
  validateWorkerForm(values)

  const firstName = values.first_name.trim()
  const lastName = values.last_name.trim()

  const payload = {
    role: values.role,
    first_name: firstName,
    last_name: lastName,
    phone: values.phone.trim(),
    email: values.email.trim().toLowerCase(),
    address_street: values.address_street.trim(),
    address_city: values.address_city.trim(),
    address_state: values.address_state.trim().toUpperCase(),
    address_zip: values.address_zip.trim(),
    wage: Number(values.wage),
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', workerId)
    .select(`
      id,
      role,
      full_name,
      first_name,
      last_name,
      phone,
      email,
      address_street,
      address_city,
      address_state,
      address_zip,
      wage
    `)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as WorkerProfile
}

export async function deleteWorker(workerId: string) {
  const currentUser = await requireManagerAccess()

  if (currentUser.id === workerId) {
    throw new Error('You cannot delete your own manager profile.')
  }

  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', workerId)

  if (error) {
    throw new Error(error.message)
  }
}