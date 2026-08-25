import * as FileSystem from 'expo-file-system/legacy'
import * as Linking from 'expo-linking'
import { supabase } from '../lib/supabase'
import { bucketOf, signedUrl } from '../lib/storageUrl'

export type Project = {
  id: number
  name: string
  reference_no: string | null
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
  plan_type?: string | null
  caption?: string | null
  uploaded_by?: string | null
  /** Absolute URL, when the row already carries one. See getPhotoUrl. */
  file_url?: string | null
}

export type DocType = 'submittal' | 'change_order' | 'requirements' | 'admin' | 'other'

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
const ADMIN_DOCS_BUCKET = 'admin-documents'

function bucketForDocType(docType?: string | null) {
  return docType === 'admin' ? ADMIN_DOCS_BUCKET : DOCUMENTS_BUCKET
}

// Still written into the *_url columns so rows keep the shape the web portal
// and older app installs expect. Nothing READS it any more — every read signs
// from the path — and it stops being written once the buckets are private.
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
    plan_type: p.plan_type ?? null,
  }
}

// A row with neither a URL nor a path cannot be rendered, and handing it to the
// image viewer as an empty uri produces a spinner that never resolves — which is
// indistinguishable, to whoever is looking at it, from the app being broken.
// Better it not be in the album.
function isViewable(p: ProjectFile) {
  return Boolean(p.file_url || p.file_path)
}

function mapPhoto(p: any): ProjectFile {
  const fname = p.file_path ? p.file_path.split('/').pop() : 'photo.jpg'
  return {
    id: p.id,
    file_name: fname,
    original_name: fname,
    file_path: p.file_path || '',
    file_url: p.file_url ?? null,
    created_at: p.created_at,
    bucket_name: 'project-photos',
    file_type: 'image/jpeg',
    caption: p.caption ?? null,
    uploaded_by: p.uploaded_by ?? null,
  }
}

function mapDocument(d: any): ProjectFile {
  return {
    id: d.id,
    file_name: d.name || (d.file_path ? d.file_path.split('/').pop() : 'document'),
    original_name: d.name || null,
    file_path: d.file_path || '',
    created_at: d.created_at,
    bucket_name: bucketForDocType(d.doc_type),
    file_type: null,
    doc_type: d.doc_type ?? null,
  }
}

export async function loadProjectDetail(projectId: number): Promise<ProjectDetailData> {
  const { data: projectData, error: projectError } = await supabase
    .from('projects').select('*').eq('id', projectId).single()
  if (projectError) throw new Error(projectError.message)

  const [plansResult, photosResult, documentsResult, reportsResult] = await Promise.all([
    supabase.from('project_plans').select('id, project_id, name, plan_type, file_path, created_at')
      .eq('project_id', projectId).order('created_at', { ascending: false }),
    // Receipts are mirrored into this table too, but they belong to the expense
    // they came from, not to the site album — the Expenses screen is where they
    // are read, by the people RLS lets read the expense. See
    // 20260809000001_expense_photos_follow_the_expense.sql.
    supabase.from('project_photos').select('id, project_id, file_path, file_url, caption, uploaded_by, created_at')
      .eq('project_id', projectId).neq('source', 'expense').order('created_at', { ascending: false }),
    supabase.from('project_documents').select('id, project_id, name, doc_type, file_path, created_at')
      .eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('daily_reports').select('*').eq('project_id', projectId)
      .order('report_date', { ascending: false }),
  ])

  // A failed query returns { data: null, error } rather than throwing, so
  // `data || []` quietly turns "could not load" into "there is nothing here".
  // Say so instead — an empty list the user cannot explain is worse than an
  // error they can.
  const failed = [
    ['plans', plansResult.error],
    ['photos', photosResult.error],
    ['documents', documentsResult.error],
    ['reports', reportsResult.error],
  ].filter(([, e]) => e) as [string, { message: string }][]
  if (failed.length) {
    throw new Error(
      failed.map(([what, e]) => `Could not load ${what}: ${e.message}`).join('\n'),
    )
  }

  return {
    project: projectData,
    photos:    (photosResult.data    || []).map(mapPhoto).filter(isViewable),
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
  const bucket = bucketForDocType(docType)

  const fileResp = await fetch(uri)
  if (!fileResp.ok) throw new Error('Could not read file.')
  const arrayBuffer = await fileResp.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, arrayBuffer, { contentType: mimeType, upsert: false })
  if (uploadError) throw new Error(uploadError.message)

  // Public bucket → store stable URL. Private (admin) bucket → null, fetched via signed URL on demand.
  const fileUrl = bucket === ADMIN_DOCS_BUCKET
    ? null
    : supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl

  const { error: dbError } = await supabase.from('project_documents').insert({
    project_id: projectId,
    name: originalName,
    doc_type: docType,
    file_url: fileUrl,
    file_path: filePath,
  })

  if (dbError) {
    await supabase.storage.from(bucket).remove([filePath])
    throw new Error(dbError.message)
  }
}

export async function deleteProjectDocument(doc: ProjectFile) {
  const bucket = doc.bucket_name || bucketForDocType(doc.doc_type)
  if (doc.file_path) {
    await supabase.storage.from(bucket).remove([doc.file_path])
  }
  const { error } = await supabase.from('project_documents').delete().eq('id', doc.id)
  if (error) throw new Error(error.message)
}

export async function deleteProjectPlan(plan: ProjectFile) {
  if (plan.file_path) {
    await supabase.storage.from('project-plans').remove([plan.file_path])
  }
  const { error } = await supabase.from('project_plans').delete().eq('id', plan.id)
  if (error) throw new Error(error.message)
}

const OWNER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function openDocument(doc: ProjectFile, ownerOrg?: string | null) {
  const bucket = doc.bucket_name || DOCUMENTS_BUCKET
  const path = ownerOrg && !OWNER_UUID_RE.test(String(doc.file_path).split('/')[0])
    ? `${ownerOrg}/${doc.file_path}`
    : doc.file_path
  const { data, error } = await supabase.storage
    .from(bucket).createSignedUrl(path, 60 * 60)
  if (error || !data?.signedUrl) throw new Error('This file could not be found in storage.')
  await Linking.openURL(data.signedUrl)
}

export async function reloadPhotos(projectId: number) {
  const { data, error } = await supabase
    .from('project_photos').select('id, project_id, file_path, file_url, caption, uploaded_by, created_at')
    .eq('project_id', projectId).neq('source', 'expense').order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map(mapPhoto).filter(isViewable)
}

export async function updatePhotoCaption(photoId: number, caption: string | null) {
  const { error } = await supabase
    .from('project_photos')
    .update({ caption: caption ?? null })
    .eq('id', photoId)
  if (error) throw new Error(error.message)
}

// Delete the storage object first, then the row. RLS gates whether the
// caller is allowed to delete each — workers can only delete photos they
// uploaded, managers can delete any.
export async function deleteProjectPhoto(photo: ProjectFile) {
  if (photo.file_path) {
    await supabase.storage.from('project-photos').remove([photo.file_path])
  }
  const { error } = await supabase.from('project_photos').delete().eq('id', photo.id)
  if (error) throw new Error(error.message)
}

export async function reloadPlans(projectId: number) {
  const { data, error } = await supabase
    .from('project_plans').select('id, project_id, name, plan_type, file_path, created_at')
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
  const user = await requireSessionUser()

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
        uploaded_by: user.id,
      })

  const { error: dbError } = await insert
  if (dbError) {
    await supabase.storage.from(bucketName).remove([filePath])
    throw new Error(dbError.message)
  }
}

// project_photos is a shared album: many of its rows are mirrored in from
// expenses, material requests and task photos, and those objects live in OTHER
// buckets (expense-receipts and friends), carrying a file_url and no file_path.
// bucketOf() reads the bucket back out of that url, so signing works for both
// kinds of row without the caller knowing which it has.
export function photoRef(photo: ProjectFile): { bucket: string; value: string | null } {
  const value = photo.file_path || photo.file_url || null
  return { bucket: bucketOf(photo.file_url) || 'project-photos', value }
}

/** A signed url for one photo, or '' when it cannot be resolved. */
export async function getPhotoUrl(photo: ProjectFile, ownerOrg?: string | null): Promise<string> {
  const { bucket, value } = photoRef(photo)
  return (await signedUrl(bucket, value, ownerOrg ? { ownerOrg } : undefined)) || ''
}

export async function openPlan(plan: ProjectFile, ownerOrg?: string | null) {
  const bucket = plan.bucket_name || 'project-plans'
  // On a shared job the object lives under the OWNER's org, not ours.
  const path = ownerOrg && !OWNER_UUID_RE.test(String(plan.file_path).split('/')[0])
    ? `${ownerOrg}/${plan.file_path}`
    : plan.file_path
  const { data, error } = await supabase.storage
    .from(bucket).createSignedUrl(path, 60 * 60)
  if (error || !data?.signedUrl) throw new Error('This file could not be found in storage.')
  await Linking.openURL(data.signedUrl)
}
