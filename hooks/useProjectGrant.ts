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
 * How a project list should present shared work. One query for the whole
 * list rather than one per row.
 *
 * Mirrors the web's Projects screen:
 *   ownerByProject   project id → the owning company, for THEIR row
 *   hiddenProjects   their rows we suppress because one of OUR projects is
 *                    linked to the same job — one job, one row
 *   workingForByProject  our project id → the company we are doing it for
 *
 * RLS already limits grants to those this org is named on, so there is no org
 * filter on the grant query beyond picking the side we are on.
 */
export function useSharedProjectPresentation() {
  const [ownerByProject, setOwnerByProject] = useState<Record<number, string>>({})
  const [hiddenProjects, setHiddenProjects] = useState<Set<number>>(new Set())
  const [workingForByProject, setWorkingForByProject] = useState<Record<number, string>>({})

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      const { data: prof } = await supabase
        .from('profiles').select('org_id').eq('id', uid).single()
      if (!prof?.org_id) return

      const [{ data: grants }, { data: mine }] = await Promise.all([
        supabase
          .from('project_access_grants')
          .select('id, project_id, owner_org_name')
          .eq('grantee_org_id', prof.org_id)
          .eq('status', 'active'),
        supabase
          .from('projects')
          .select('id, linked_grant_id')
          .not('linked_grant_id', 'is', null),
      ])

      if (!alive) return

      const byGrant = new Map<number, any>()
      const owners: Record<number, string> = {}
      for (const g of grants || []) {
        byGrant.set((g as any).id, g)
        owners[(g as any).project_id] = (g as any).owner_org_name || 'Another company'
      }

      const hidden = new Set<number>()
      const workingFor: Record<number, string> = {}
      for (const pr of mine || []) {
        const g = byGrant.get((pr as any).linked_grant_id)
        if (!g) continue
        hidden.add(g.project_id)
        workingFor[(pr as any).id] = g.owner_org_name || 'Another company'
      }

      setOwnerByProject(owners)
      setHiddenProjects(hidden)
      setWorkingForByProject(workingFor)
    })()
    return () => { alive = false }
  }, [])

  return { ownerByProject, hiddenProjects, workingForByProject }
}
