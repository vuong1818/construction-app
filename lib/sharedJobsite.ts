// Sending a field record from OUR project to the shared jobsite it stands in for.
//
// The list folds the GC's row away ("one job, one row") and the crew works on
// our row — that is where their hours go. So a daily report, an RFI or a
// material request typed here never reaches the GC unless it is SENT. This is
// the one place that does the sending, for every screen that files one of
// those three records. Mirrors lib/sharedJobsite.js on the web.
//
// The database creates the copy (forward_to_shared_jobsite) and tells us which
// photos still have to be copied across; the storage object copy cannot happen
// inside that transaction, so it is done here, into the OWNER's folder on the
// target project, where both companies can read it.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { objectPath } from './storageUrl'

export type ForwardTable = 'daily_reports' | 'rfis' | 'material_requests'

export const PHOTO_BUCKET: Record<ForwardTable, string> = {
  daily_reports: 'project-photos',
  rfis: 'rfi-photos',
  material_requests: 'material-photos',
}

export type ForwardTarget = {
  grantId: number
  projectId: number
  projectName: string | null
  ownerOrg: string
  ownerOrgName: string
  canAddPhotos: boolean
  canReports: boolean
  canRfis: boolean
  defaults: Record<ForwardTable, boolean>
}

/**
 * Where records filed on this project can be sent, or null when this project
 * is not linked to a shared jobsite — every ordinary project, and also the
 * GC's own project seen through a grant.
 */
export function useForwardTarget(projectId?: number) {
  const [target, setTarget] = useState<ForwardTarget | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!Number.isFinite(projectId)) { setTarget(null); setLoading(false); return }
    const { data: pr } = await supabase
      .from('projects')
      .select('id, linked_grant_id, forward_reports, forward_rfis, forward_material_requests')
      .eq('id', projectId as number)
      .maybeSingle()
    if (!pr?.linked_grant_id) { setTarget(null); setLoading(false); return }
    const { data: g } = await supabase
      .from('project_access_grants')
      .select('id, project_id, owner_org_id, owner_org_name, status, revoked_at, can_add_photos, can_create_reports, can_create_rfis, project_name')
      .eq('id', pr.linked_grant_id)
      .maybeSingle()
    if (!g || g.status !== 'active' || g.revoked_at) { setTarget(null); setLoading(false); return }
    setTarget({
      grantId: g.id,
      projectId: g.project_id,
      projectName: g.project_name ?? null,
      ownerOrg: g.owner_org_id,
      ownerOrgName: g.owner_org_name || 'the other company',
      canAddPhotos: !!g.can_add_photos,
      canReports: !!g.can_create_reports,
      canRfis: !!g.can_create_rfis,
      defaults: {
        daily_reports: pr.forward_reports !== false,
        rfis: pr.forward_rfis !== false,
        material_requests: pr.forward_material_requests === true,
      },
    })
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  return { target, loading, reload: load }
}

export type ForwardResult = {
  copyId: number
  rfiNo: string | null
  ownerOrgName: string
  photosCopied: number
  photosFailed: number
  warning: string | null
}

function basename(path: string) {
  const s = String(path || '')
  return s.slice(s.lastIndexOf('/') + 1) || `photo-${Date.now()}.jpg`
}
function extOf(path: string | null) {
  const b = basename(path || '')
  const i = b.lastIndexOf('.')
  const e = i === -1 ? 'jpg' : b.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, '')
  return e || 'jpg'
}

/**
 * Send one record. Safe to call again on the same record: the copy is updated
 * in place and only photos not yet across are copied. Throws with a readable
 * message when the database refuses.
 */
export async function forwardToSharedJobsite(table: ForwardTable, id: number): Promise<ForwardResult> {
  const bucket = PHOTO_BUCKET[table]
  const { data, error } = await supabase.rpc('forward_to_shared_jobsite', {
    p_table: table, p_id: id, p_photo_path: null,
  })
  if (error) throw new Error(error.message)

  const out: ForwardResult = {
    copyId: data.copy_id,
    rfiNo: data.rfi_no || null,
    ownerOrgName: data.owner_org_name || 'the other company',
    photosCopied: 0,
    photosFailed: 0,
    warning: null,
  }
  const { data: { user } } = await supabase.auth.getUser()

  if (table === 'daily_reports') {
    const photos: { id: number; from: string | null; caption: string | null }[] = Array.isArray(data.photos) ? data.photos : []
    for (const ph of photos) {
      const from = objectPath(ph.from)
      if (!from) { out.photosFailed++; continue }
      // The owner's folder, on THEIR project, under the copy's own id.
      const to = `${data.owner_org}/project-${data.target_project_id}/reports/${data.copy_id}/fwd-${ph.id}-${basename(from)}`
      const { error: cpErr } = await supabase.storage.from(bucket).copy(from, to)
      if (cpErr) { out.photosFailed++; continue }
      const fileUrl = supabase.storage.from(bucket).getPublicUrl(to).data.publicUrl
      const { error: rowErr } = await supabase.from('project_photos').insert({
        project_id: data.target_project_id,
        source_table: 'daily_reports',
        source_id: data.copy_id,
        source: 'forward',
        file_path: to,
        file_url: fileUrl,
        caption: ph.caption || null,
        uploaded_by: user?.id ?? null,
        forwarded_from_id: ph.id,
      })
      if (rowErr) {
        await supabase.storage.from(bucket).remove([to]).catch(() => {})
        out.photosFailed++
        continue
      }
      out.photosCopied++
    }
  } else if (data.source_photo && !data.copy_has_photo) {
    // One photo on the row. Copy it, then tell the database where it landed;
    // sync_photo_to_pot mirrors it into the GC's photo list from there.
    const from = objectPath(data.source_photo)
    if (from) {
      const to = `${data.owner_org}/${data.target_project_id}/fwd-${id}-${Date.now()}.${extOf(from)}`
      const { error: cpErr } = await supabase.storage.from(bucket).copy(from, to)
      if (cpErr) {
        out.photosFailed++
      } else {
        const { error: e2 } = await supabase.rpc('forward_to_shared_jobsite', {
          p_table: table, p_id: id, p_photo_path: to,
        })
        if (e2) out.photosFailed++; else out.photosCopied++
      }
    }
  }

  if (out.photosFailed) {
    out.warning = data.can_add_photos === false
      ? `${out.ownerOrgName} has not allowed your company to add photos on their jobsite, so the photo${out.photosFailed === 1 ? ' was' : 's were'} not copied.`
      : `${out.photosFailed} photo${out.photosFailed === 1 ? '' : 's'} could not be copied. Send again to retry.`
  }
  return out
}

export type ForwardedRfi = { id: number; rfi_no: string | null; status: string; answer: string | null; answered_at: string | null }

/**
 * The GC's side of the RFIs we sent: their number, status and answer, keyed
 * by OUR RFI's id. Readable through the grant; rows we cannot read (share
 * ended, copy deleted) are simply absent.
 */
export async function loadForwardedRfis(rows: { id: number; forwarded_to_id?: number | null }[]): Promise<Record<number, ForwardedRfi>> {
  const pairs = (rows || []).filter(r => r.forwarded_to_id).map(r => [r.forwarded_to_id as number, r.id] as const)
  if (!pairs.length) return {}
  const { data } = await supabase
    .from('rfis')
    .select('id, rfi_no, status, answer, answered_at')
    .in('id', pairs.map(p => p[0]))
  const byCopy: Record<number, ForwardedRfi> = Object.fromEntries(((data as ForwardedRfi[]) || []).map(c => [c.id, c]))
  const bySource: Record<number, ForwardedRfi> = {}
  for (const [copyId, sourceId] of pairs) if (byCopy[copyId]) bySource[sourceId] = byCopy[copyId]
  return bySource
}

export type ForwardedRequest = { id: number; status: string; fulfilled_at: string | null }

/** Same idea for material requests: the GC's status on our request. */
export async function loadForwardedMaterialRequests(rows: { id: number; forwarded_to_id?: number | null }[]): Promise<Record<number, ForwardedRequest>> {
  const pairs = (rows || []).filter(r => r.forwarded_to_id).map(r => [r.forwarded_to_id as number, r.id] as const)
  if (!pairs.length) return {}
  const { data } = await supabase
    .from('material_requests')
    .select('id, status, fulfilled_at')
    .in('id', pairs.map(p => p[0]))
  const byCopy: Record<number, ForwardedRequest> = Object.fromEntries(((data as ForwardedRequest[]) || []).map(c => [c.id, c]))
  const bySource: Record<number, ForwardedRequest> = {}
  for (const [copyId, sourceId] of pairs) if (byCopy[copyId]) bySource[sourceId] = byCopy[copyId]
  return bySource
}
