import * as FileSystem from 'expo-file-system/legacy'
import * as Linking from 'expo-linking'
import { supabase } from '../lib/supabase'

export type Project = {
  id: number
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
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
  doc_type?: string | null
}

export type DocType = 'submittal' | 'change_order' | 'requirements' | 'other'

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
  documents: ProjectFile[]
  reports: DailyReport[]
}

type UploadBucket = 'project-photos' | 'project-plans'

export type PlanType =
  | 'architectural' | 'civil' | 'structural'
  | 'electrical' | 'mechanical' | 'plumbing'
  | 'redline' | 'landscape' | 'other'

const DOCUMENTS_BUCKET = 'project-files'

// Build the public-bucket URL for a given storage path. Mirrors the format
// the web portal stores in *_url columns so backfilled rows look the same.
function publicUrl(bucket: string, filePath: string) {
  return supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl
}

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
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) throw new Error('Please sign in first')
  return session.user
}

function mapPlan(p: any): ProjectFile {
  return {
    id: p.id,
    file_name: p.name || (p.file_path ? p.file_path.split('/').pop() : 'plan.pdf'),
    original_name: p.name || null,
    file_path: p.file_path || '',
    created_at: p.created_at,
    bucket_name: 'project-plans',
    file_type: 'application/pdf',
  }
}

function mapPhoto(p: any): ProjectFile {
  const fname = p.file_path ? p.file_path.split('/').pop() : 'photo.jpg'
  return {
    id: p.id,
    file_name: fname,
    original_name: fname,
    file_path: p.file_path || '',
    created_at: p.created_at,
    bucket_name: 'project-photos',
    file_type: 'image/jpeg',
  }
}

function mapDocument(d: any): ProjectFile {
  return {
    id: d.id,
    file_name: d.name || (d.file_path ? d.file_path.split('/').pop() : 'document'),
    original_name: d.name || null,
    file_path: d.file_path || '',
    created_at: d.created_at,
    bucket_name: DOCUMENTS_BUCKET,
    file_type: null,
    doc_type: d.doc_type ?? null,
  }
}

export async function loadProjectDetail(projectId: number): Promise<ProjectDetailData> {
  const { data: projectData, error: projectError } = await supabase
    .from('projects').select('*').eq('id', projectId).single()
  if (projectError) throw new Error(projectError.message)

  const [plansResult, photosResult, documentsResult, reportsResult] = await Promise.all([
    supabase.from('project_plans').select('id, project_id, name, file_path, created_at')
      .eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('project_photos').select('id, project_id, file_path, created_at')
      .eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('project_documents').select('id, project_id, name, doc_type, file_path, created_at')
      .eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('daily_reports').select('*').eq('project_id', projectId)
      .order('report_date', { ascending: false }),
  ])

  return {
    project: projectData,
    photos:    (photosResult.data    || []).map(mapPhoto),
    plans:     (plansResult.data     || []).map(mapPlan),
    documents: (documentsResult.data || []).map(mapDocument),
    reports:   reportsResult.data    || [],
  }
}

export async function reloadDocuments(projectId: number): Promise<ProjectFile[]> {
  const { data, error } = await supabase
    .from('project_documents')
    .select('id, project_id, name, doc_type, file_path, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map(mapDocument)
}

export async function uploadProjectDocument(params: {
  projectId: number
  uri: string
  originalName: string
  mimeType: string
  docType: DocType
}) {
  const { projectId, uri, originalName, mimeType, docType } = params
  await requireSessionUser()

  const safeName = cleanFileName(originalName)
  const storageFileName = `project-${projectId}-${Date.now()}-${safeName}`
  const filePath = `project-${projectId}/${storageFileName}`

  const fileResp = await fetch(uri)
  if (!fileResp.ok) throw new Error('Could not read file.')
  const arrayBuffer = await fileResp.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(filePath, arrayBuffer, { contentType: mimeType, upsert: false })
  if (uploadError) throw new Error(uploadError.message)

  const { data: urlData } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(filePath)

  const { error: dbError } = await supabase.from('project_documents').insert({
    project_id: projectId,
    name: originalName,
    doc_type: docType,
    file_url: urlData.publicUrl,
    file_path: filePath,
  })

  if (dbError) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath])
    throw new Error(dbError.message)
  }
}

export async function deleteProjectDocument(doc: ProjectFile) {
  if (doc.file_path) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.file_path])
  }
  const { error } = await supabase.from('project_documents').delete().eq('id', doc.id)
  if (error) throw new Error(error.message)
}

export async function openDocument(doc: ProjectFile) {
  const bucket = doc.bucket_name || DOCUMENTS_BUCKET
  const { data, error } = await supabase.storage
    .from(bucket).createSignedUrl(doc.file_path, 60 * 60)
  if (error || !data?.signedUrl) throw new Error('This file could not be found in storage.')
  await Linking.openURL(data.signedUrl)
}

export async function reloadPhotos(projectId: number) {
  const { data, error } = await supabase
    .from('project_photos').select('id, project_id, file_path, created_at')
    .eq('project_id', projectId).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map(mapPhoto)
}

export async function reloadPlans(projectId: number) {
  const { data, error } = await supabase
    .from('project_plans').select('id, project_id, name, file_path, created_at')
    .eq('project_id', projectId).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map(mapPlan)
}

export async function reloadReports(projectId: number) {
  const { data, error } = await supabase
    .from('daily_reports').select('*').eq('project_id', projectId)
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
  planType?: PlanType | null
}) {
  const { projectId, uri, originalName, bucketName, mimeType, planType } = params
  await requireSessionUser()

  const safeName = cleanFileName(originalName)
  const storageFileName = `project-${projectId}-${Date.now()}-${safeName}`
  const filePath = `project-${projectId}/${storageFileName}`

  // fetch + arrayBuffer — reliable binary upload on React Native
  const fileResp = await fetch(uri)
  if (!fileResp.ok) throw new Error('Could not read file.')
  const arrayBuffer = await fileResp.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from(bucketName).upload(filePath, arrayBuffer, { contentType: mimeType, upsert: false })
  if (uploadError) throw new Error(uploadError.message)

  const fileUrl = publicUrl(bucketName, filePath)

  // Write to the typed table for the bucket. Web does the same thing.
  const insert = bucketName === 'project-plans'
    ? supabase.from('project_plans').insert({
        project_id: projectId,
        name: originalName,
        plan_type: planType ?? null,
        file_url: fileUrl,
        file_path: filePath,
      })
    : supabase.from('project_photos').insert({
        project_id: projectId,
        file_url: fileUrl,
        file_path: filePath,
      })

  const { error: dbError } = await insert
  if (dbError) {
    await supabase.storage.from(bucketName).remove([filePath])
    throw new Error(dbError.message)
  }
}

export function getPhotoUrl(photo: ProjectFile) {
  return supabase.storage.from('project-photos').getPublicUrl(photo.file_path).data.publicUrl
}

export async function openPlan(plan: ProjectFile) {
  const bucket = plan.bucket_name || 'project-plans'
  const { data, error } = await supabase.storage
    .from(bucket).createSignedUrl(plan.file_path, 60 * 60)
  if (error || !data?.signedUrl) throw new Error('This file could not be found in storage.')
  await Linking.openURL(data.signedUrl)
}
