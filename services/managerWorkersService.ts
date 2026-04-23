import { supabase } from '../lib/supabase'
import authService from './authService'

export type WorkerRecord = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  email: string | null
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  wage: number | null
  role: string | null
  full_name?: string | null
}

export type UpsertWorkerInput = {
  id?: string
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

export async function requireManagerAccess() {
  const role = await authService.getCurrentUserRole()

  if (role !== 'manager') {
    throw new Error('Manager access is required.')
  }
}

export async function listWorkers(): Promise<WorkerRecord[]> {
  await requireManagerAccess()

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      first_name,
      last_name,
      phone,
      email,
      street,
      city,
      state,
      zip,
      wage,
      role,
      full_name
    `)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data || []) as WorkerRecord[]
}

export function validateWorkerInput(input: UpsertWorkerInput) {
  if (!input.first_name.trim()) {
    throw new Error('First name is required.')
  }

  if (!input.last_name.trim()) {
    throw new Error('Last name is required.')
  }

  if (!input.email.trim()) {
    throw new Error('Email is required.')
  }

  const email = input.email.trim().toLowerCase()
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  if (!isValidEmail) {
    throw new Error('Please enter a valid email address.')
  }

  if (!input.phone.trim()) {
    throw new Error('Phone number is required.')
  }

  if (!input.street.trim()) {
    throw new Error('Street is required.')
  }

  if (!input.city.trim()) {
    throw new Error('City is required.')
  }

  if (!input.state.trim()) {
    throw new Error('State is required.')
  }

  if (!input.zip.trim()) {
    throw new Error('Zip is required.')
  }

  if (!input.wage.trim()) {
    throw new Error('Wage is required.')
  }

  const wageNumber = Number(input.wage)

  if (!Number.isFinite(wageNumber) || wageNumber < 0) {
    throw new Error('Wage must be a valid number.')
  }

  if (input.role !== 'worker' && input.role !== 'manager') {
    throw new Error('Role must be worker or manager.')
  }
}

function buildFullName(firstName: string, lastName: string) {
  return `${firstName.trim()} ${lastName.trim()}`.trim()
}

export async function createWorker(input: UpsertWorkerInput) {
  await requireManagerAccess()
  validateWorkerInput(input)

  const full_name = buildFullName(input.first_name, input.last_name)

  const payload = {
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    full_name,
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    street: input.street.trim(),
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    zip: input.zip.trim(),
    wage: Number(input.wage),
    role: input.role,
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert(payload)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as WorkerRecord
}

export async function updateWorker(workerId: string, input: UpsertWorkerInput) {
  await requireManagerAccess()
  validateWorkerInput(input)

  const full_name = buildFullName(input.first_name, input.last_name)

  const payload = {
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    full_name,
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    street: input.street.trim(),
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    zip: input.zip.trim(),
    wage: Number(input.wage),
    role: input.role,
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', workerId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as WorkerRecord
}

export async function deleteWorker(workerId: string) {
  await requireManagerAccess()

  const currentUser = await authService.requireSessionUser()

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