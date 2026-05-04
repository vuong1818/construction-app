// AsyncStorage-backed queue for ops that should survive network drops.
//
// Scope:
//   - clock_in: original case. Worker may tap Clock In with no signal.
//   - task_status_update: worker on site may toggle a task to in_progress
//     or completed; the row already exists server-side so there is no
//     chained-op problem. Safe to queue.
//
// Clock-out is still excluded because it would need to wait for a queued
// clock-in to flush before it could resolve the target row id.
//
// Lifecycle:
//   1. Worker taps Clock In on the home screen.
//   2. clockIn() in dashboardService checks NetInfo; if offline OR if
//      the supabase insert fails with a network-shaped error, the
//      payload is pushed here.
//   3. The home screen shows a "pending sync" chip whose count comes
//      from subscribe(). The chip is tappable to force-drain.
//   4. When NetInfo flips to connected, drainQueue() runs automatically.
//      Each successful op disappears from the queue; failures stay
//      with attempts++ for the next try.
//
// Storage key is versioned (sync_queue_v1) so we can change shape later
// with a one-shot migration if needed.

import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from './supabase'

const STORAGE_KEY = 'sync_queue_v1'

export type ClockInQueueOp = {
  id: string
  kind: 'clock_in'
  payload: {
    project_id: number
    user_id: string
    user_name: string | null
    clock_in_time: string
    clock_in_lat: number | null
    clock_in_lng: number | null
    clock_in_snapshot_url: string | null
    clock_in_offsite: boolean
    clock_in_offsite_reason: string | null
    clock_in_offsite_note: string | null
  }
  queued_at: string
  attempts: number
}

export type TaskStatusUpdateOp = {
  id: string
  kind: 'task_status_update'
  payload: {
    task_id: number
    status: 'assigned' | 'in_progress' | 'completed'
  }
  queued_at: string
  attempts: number
}

export type QueueOp = ClockInQueueOp | TaskStatusUpdateOp

// ── Storage primitives ──────────────────────────────────────────────────────
async function readQueue(): Promise<QueueOp[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeQueue(ops: QueueOp[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ops))
}

function makeId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ── Subscribers (for the pending-count chip) ────────────────────────────────
type Listener = (count: number) => void
const listeners = new Set<Listener>()

async function notify(): Promise<void> {
  const ops = await readQueue()
  listeners.forEach((l) => l(ops.length))
}

export function subscribePending(listener: Listener): () => void {
  listeners.add(listener)
  // Fire once with the current count so subscribers don't have to await.
  readQueue().then((ops) => listener(ops.length)).catch(() => {})
  return () => {
    listeners.delete(listener)
  }
}

export async function pendingCount(): Promise<number> {
  return (await readQueue()).length
}

// ── Public ops ──────────────────────────────────────────────────────────────
export async function queueClockIn(
  payload: ClockInQueueOp['payload'],
): Promise<void> {
  const ops = await readQueue()
  ops.push({
    id: makeId(),
    kind: 'clock_in',
    payload,
    queued_at: payload.clock_in_time, // honor the time worker actually clocked in
    attempts: 0,
  })
  await writeQueue(ops)
  await notify()
}

export async function queueTaskStatusUpdate(
  payload: TaskStatusUpdateOp['payload'],
): Promise<void> {
  const ops = await readQueue()
  // Collapse duplicate updates for the same task: latest intent wins so the
  // queue can't snowball into a stack of redundant writes.
  const filtered = ops.filter(
    (op) => !(op.kind === 'task_status_update' && op.payload.task_id === payload.task_id),
  )
  filtered.push({
    id: makeId(),
    kind: 'task_status_update',
    payload,
    queued_at: new Date().toISOString(),
    attempts: 0,
  })
  await writeQueue(filtered)
  await notify()
}

// ── Drain ───────────────────────────────────────────────────────────────────
let draining = false

export async function drainQueue(): Promise<{ synced: number; remaining: number }> {
  if (draining) return { synced: 0, remaining: 0 }
  draining = true
  let synced = 0
  try {
    const ops = await readQueue()
    if (ops.length === 0) return { synced: 0, remaining: 0 }

    const remaining: QueueOp[] = []
    for (const op of ops) {
      try {
        if (op.kind === 'clock_in') {
          const { error } = await supabase.from('time_entries').insert(op.payload)
          if (error) throw new Error(error.message)
          synced++
        } else if (op.kind === 'task_status_update') {
          const { error } = await supabase
            .from('project_tasks')
            .update({ status: op.payload.status })
            .eq('id', op.payload.task_id)
          if (error) throw new Error(error.message)
          synced++
        }
      } catch {
        // Keep the op for the next attempt; bump attempts so we can
        // surface "stuck" ops in a future maintenance pass.
        remaining.push({ ...op, attempts: op.attempts + 1 })
      }
    }
    await writeQueue(remaining)
    await notify()
    return { synced, remaining: remaining.length }
  } finally {
    draining = false
  }
}

// ── Auto-drain on reconnect ─────────────────────────────────────────────────
let netUnsubscribe: (() => void) | null = null

export function startAutoDrain(): () => void {
  // Idempotent: tearing down a previous listener if startAutoDrain is
  // called more than once (e.g. on hot-reload during dev).
  if (netUnsubscribe) netUnsubscribe()
  netUnsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      drainQueue().catch(() => {})
    }
  })
  // One-shot drain on attach in case we're already online.
  drainQueue().catch(() => {})
  return () => {
    if (netUnsubscribe) {
      netUnsubscribe()
      netUnsubscribe = null
    }
  }
}

// Quick connectivity probe. Used by clockIn() to decide whether to try
// the supabase call directly or skip straight to queue. We don't fail
// based on isInternetReachable === null (some networks don't report it
// reliably) — only treat false as "definitely offline".
export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch()
  if (state.isConnected === false) return false
  if (state.isInternetReachable === false) return false
  return true
}
