// The inbox: field records and events shown until the reader marks them read.
// Read state is per person (inbox_reads); the list comes from the
// inbox_items() RPC — this work week and the one before, newest first.
// Mirrors lib/inbox.js on the web.
import { supabase } from './supabase'

export type InboxKind =
  | 'daily_report' | 'rfi' | 'material_request'
  | 'rfi_answered' | 'request_handled' | 'shift_corrected' | 'estimate_accepted'

export type InboxItem = {
  kind: InboxKind
  id: number
  project_id: number | null
  project_name: string | null
  title: string
  meta: string | null
  created_at: string
  is_read: boolean
}

export async function loadInbox(): Promise<InboxItem[]> {
  const { data, error } = await supabase.rpc('inbox_items')
  if (error) throw error
  return (data || []) as InboxItem[]
}

export async function markInboxRead(kind: InboxKind, id: number): Promise<void> {
  const { error } = await supabase.rpc('inbox_mark_read', { p_kind: kind, p_id: id })
  if (error) throw error
}

export async function markAllInboxRead(): Promise<number> {
  const { data, error } = await supabase.rpc('inbox_mark_all_read')
  if (error) throw error
  return (data as number) || 0
}

// Where an item opens on the phone.
export function inboxRoute(item: InboxItem): string {
  const p = item.project_id ? `/project/${item.project_id}` : '/projects'
  switch (item.kind) {
    case 'daily_report':
      return `${p}/report/${item.id}`
    case 'rfi':
    case 'rfi_answered':
      return `${p}/rfis`
    case 'material_request':
    case 'request_handled':
      return `${p}/material-requests`
    case 'estimate_accepted':
      return p
    case 'shift_corrected':
      return '/timesheet'
    default:
      return p
  }
}

// The current week is listed; older unread items collapse to one count.
export function splitInbox(items: InboxItem[], weekStart: Date) {
  const ws = weekStart.getTime()
  const thisWeek = items.filter(i => new Date(i.created_at).getTime() >= ws)
  const olderUnread = items.filter(i => new Date(i.created_at).getTime() < ws && !i.is_read).length
  const unread = items.filter(i => !i.is_read).length
  return { thisWeek, olderUnread, unread }
}

export function inboxMeta(item: InboxItem): string {
  const when = item.created_at
    ? new Date(item.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : ''
  return [item.project_name, item.meta, when].filter(Boolean).join(' · ')
}
