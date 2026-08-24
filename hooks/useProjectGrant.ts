// Am I standing on somebody else's jobsite?
//
// A project reaches this app one of two ways: it belongs to my company, or
// another company on SiteOfficeIQ shared it with mine and named me on it. The
// second case looks identical in `projects` — same table, same row shape — and
// the difference matters, because being a manager at my company confers
// nothing on theirs.
//
// This mirrors the web (components/SubcontractorAccessPanel.js and the project
// page) deliberately: one rule, stated the same way in both clients, so the
// phone and the desktop cannot disagree about what a subcontractor may do.
//
// RLS is the real boundary — every table already refuses what it should. This
// is here so the screen doesn't offer buttons that will fail.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type ProjectGrant = {
  id: number
  project_id: number
  owner_org_id: string
  grantee_org_id: string
  status: string
  owner_org_name: string | null
  project_name: string | null
  can_add_photos: boolean
  can_create_rfis: boolean
  can_create_reports: boolean
  can_upload_docs: boolean
  can_check_tasks: boolean
}

export function useProjectGrant(projectId?: number) {
  const [grant, setGrant] = useState<ProjectGrant | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    if (!Number.isFinite(projectId)) {
      setGrant(null)
      setLoading(false)
      return () => { alive = false }
    }
    ;(async () => {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) { if (alive) { setGrant(null); setLoading(false) } ; return }

      const { data: prof } = await supabase
        .from('profiles').select('org_id').eq('id', uid).single()
      if (!prof?.org_id) { if (alive) { setGrant(null); setLoading(false) } ; return }

      const { data } = await supabase
        .from('project_access_grants')
        .select('*')
        .eq('project_id', projectId as number)
        .eq('grantee_org_id', prof.org_id)
        .eq('status', 'active')
        .maybeSingle()

      if (alive) {
        setGrant((data as ProjectGrant) || null)
        setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [projectId])

  return { grant, isGranted: !!grant, loading }
}

/**
 * Which projects in a list reached us through a grant, and from whom.
 * One query for the whole list rather than one per row.
 *
 * Returns a map of project id → the owning company's name, covering only
 * ACTIVE grants where we are the grantee. RLS already limits the rows to
 * grants this org is named on, so there is no org filter here.
 */
export function useSharedProjectOwners() {
  const [ownerByProject, setOwnerByProject] = useState<Record<number, string>>({})

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      const { data: prof } = await supabase
        .from('profiles').select('org_id').eq('id', uid).single()
      if (!prof?.org_id) return

      const { data } = await supabase
        .from('project_access_grants')
        .select('project_id, owner_org_name')
        .eq('grantee_org_id', prof.org_id)
        .eq('status', 'active')

      if (!alive) return
      const map: Record<number, string> = {}
      for (const g of data || []) {
        map[(g as any).project_id] = (g as any).owner_org_name || 'Another company'
      }
      setOwnerByProject(map)
    })()
    return () => { alive = false }
  }, [])

  return ownerByProject
}
