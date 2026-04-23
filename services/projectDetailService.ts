import { decode as atob } from 'base-64'
import * as FileSystem from 'expo-file-system/legacy'
import * as Linking from 'expo-linking'
import { supabase } from '../lib/supabase'

export type Project = {
  id: number
  name: string
  address: string | null
  status: string | null
  description: string | null
}

export type ProjectFile = {
  id: number
  file_name: string
  original_name: string | null
  file_path: string
  created_at: string
  bucket_name: string
  file_type: string | null
}

export type DailyReport = {
  id: number
  project_id: number
  report_date: string
  created_by_name: string | null
  work_completed: string | null
  issues: string | null
  materials_used: string | null
  weather: string | null
  created_at: string
}

export type ProjectDetailData = {
  project: Project | null
  photos: ProjectFile[]
  plans: ProjectFile[]
  reports: DailyReport[]
}

type UploadBucket = 'project-photos' | 'project-plans'

export function cleanFileName(name: string) {
  const parts = name.split('.')
  const ext = parts.length > 1 ? parts.pop() : ''
  const base = parts.join('.')

  const safeBase = base
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!ext) return safeBase || `file-${Date.now()}`
  return `${safeBase || `file-${Date.now()}`}.${ext.toLowerCase()}`
}

async function requireSessionUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    throw new Error('Please sign in first')
  }

  return session.user
}

export async function loadProjectDetail(projectId: number): Promise<ProjectDetailData> {
  const { data: projectData, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (projectError) {
    throw new Error(projectError.message)
  }

  const [photosResult, plansResult, reportsResult] = await Promise.all([
    supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .eq('bucket_name', 'project-photos')
      .order('created_at', { ascending: false }),

    supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .eq('bucket_name', 'project-plans')
      .order('created_at', { ascending: false }),

    supabase
      .from('daily_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('report_date', { ascending: false }),
  ])

  if (photosResult.error) {
    throw new Error(photosResult.error.message)
  }

  if (plansResult.error) {
    throw new Error(plansResult.error.message)
  }

  if (reportsResult.error) {
    throw new Error(reportsResult.error.message)
  }

  return {
    project: projectData,
    photos: photosResult.data || [],
    plans: plansResult.data || [],
    reports: reportsResult.data || [],
  }
}

export async function reloadPhotos(projectId: number) {
  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .eq('bucket_name', 'project-photos')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function reloadPlans(projectId: number) {
  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .eq('bucket_name', 'project-plans')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function reloadReports(projectId: number) {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('project_id', projectId)
    .order('report_date', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function uploadProjectFile(params: {
  projectId: number
  uri: string
  originalName: string
  bucketName: UploadBucket
  mimeType: string
}) {
  const { projectId, uri, originalName, bucketName, mimeType } = params
  const user = await requireSessionUser()

  const safeName = cleanFileName(originalName)
  const storageFileName = `project-${projectId}-${Date.now()}-${safeName}`
  const filePath = `project-${projectId}/${storageFileName}`

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }

  const byteArray = new Uint8Array(byteNumbers)

  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(filePath, byteArray, {
      contentType: mimeType,
      upsert: false,
    })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const { error: dbError } = await supabase.from('project_files').insert({
    project_id: projectId,
    uploaded_by: user.id,
    bucket_name: bucketName,
    file_name: storageFileName,
    original_name: originalName,
    file_path: filePath,
    file_type: mimeType,
  })

  if (dbError) {
    await supabase.storage.from(bucketName).remove([filePath])
    throw new Error(dbError.message)
  }
}

export function getPhotoUrl(photo: ProjectFile) {
  return supabase.storage.from('project-photos').getPublicUrl(photo.file_path).data.publicUrl
}

export async function openPlan(plan: ProjectFile) {
  const { data, error } = await supabase.storage
    .from(plan.bucket_name)
    .createSignedUrl(plan.file_path, 60 * 60)

  if (error || !data?.signedUrl) {
    throw new Error('This file could not be found in storage.')
  }

  await Linking.openURL(data.signedUrl)
}