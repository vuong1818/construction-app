// Push notifications, delivered from the inbox. (2026-09-12)
//
// The phone asks once for permission, gets its Expo push token, and files it
// in push_tokens for this user. The web cron (/api/cron/push-inbox) turns
// unread inbox events into pushes; tapping one opens the record the event is
// about. Everything here is guarded: on a simulator, on the web, or on a
// binary built before expo-notifications existed, it does nothing.
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { Platform } from 'react-native'
import { clockOut } from '../services/dashboardService'
import { readCurrentLocation } from './clockLocation'
import { ACTION_CLOCK_OUT, ACTION_YES, AUTO_CLOCKED_OUT_KIND, STILL_WORKING_KIND, cancelShiftReminders } from './shiftReminders'
import { supabase } from './supabase'

let registered: string | null = null

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

// Where a notification opens, by the inbox event's kind.
export function routeForNotification(data: Record<string, any> | undefined): string | null {
  if (!data) return null
  const p = data.project_id ? `/project/${data.project_id}` : null
  switch (data.kind) {
    case 'rfi_answered': return p ? `${p}/rfis` : '/projects'
    case 'request_handled': return p ? `${p}/material-requests` : '/projects'
    case 'shift_corrected': return '/timesheet'
    case 'estimate_accepted': return p || '/projects'
    default: return p || '/'
  }
}

export async function registerForPush(): Promise<void> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'SiteOfficeIQ',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      })
    }
    const { status: existing } = await Notifications.getPermissionsAsync()
    let status = existing
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync()
      status = req.status
    }
    if (status !== 'granted') return
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    if (!token || token === registered) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await supabase.from('push_tokens').upsert(
      { user_id: session.user.id, token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' },
    )
    if (!error) registered = token
  } catch {
    // A phone that cannot register must still work.
  }
}

// "No, clock me out" on a still-working reminder (lib/shiftReminders). The
// open shift is looked up fresh rather than trusted from the notification: a
// reminder scheduled for a shift that has since been closed, switched or
// opened on another phone must not end the wrong one. The GPS fix is best
// effort - the worker answered "clock me out", and a missing fix must not
// keep the shift open; the office sees a clock-out with no location, as it
// does for a logout.
async function clockOutFromReminder(expectedId: number | null): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase.from('time_entries').select('id')
      .eq('user_id', session.user.id).is('clock_out_time', null)
      .order('created_at', { ascending: false }).limit(1)
    const id = data?.[0]?.id
    if (!id) { await cancelShiftReminders(); return }
    // The reminder named a shift (online clock-ins do); a different one is
    // open now, so the answer was about a shift that has already ended.
    if (expectedId != null && id !== expectedId) return
    let lat: number | null = null, lng: number | null = null
    try { const loc = await readCurrentLocation(); lat = loc.lat; lng = loc.lng } catch { /* no fix */ }
    await clockOut(id, { lat, lng, snapshotUrl: null, offsite: false, offsiteReason: null, offsiteNote: null })
  } catch {
    // Home shows the truth either way.
  }
}

// One response, from the live listener or the cold-start lookup. A cold-start
// response can be an old one (the last tap, whenever it was), so a clock-out
// is only honoured when the notification is minutes old - never a stale tap
// ending a shift that started the next day.
function handleResponse(resp: Notifications.NotificationResponse, coldStart: boolean) {
  const data = resp.notification.request.content.data as Record<string, any> | undefined
  if (data?.kind === STILL_WORKING_KIND) {
    if (resp.actionIdentifier === ACTION_CLOCK_OUT) {
      // notification.date is seconds on iOS and milliseconds on Android.
      const raw = Number(resp.notification.date) || 0
      const firedAt = raw > 1e12 ? raw : raw * 1000
      const ageMs = Date.now() - firedAt
      const entryId = typeof data.entry_id === 'number' ? data.entry_id : null
      if (!coldStart || ageMs < 10 * 60 * 1000) clockOutFromReminder(entryId)
      router.push('/' as any)
    } else if (resp.actionIdentifier !== ACTION_YES) {
      router.push('/' as any)
    }
    // An answered ask must not be replayed by the next cold start.
    try { Notifications.clearLastNotificationResponseAsync().catch(() => {}) } catch { /* older binary */ }
    return
  }
  if (data?.kind === AUTO_CLOCKED_OUT_KIND) { router.push('/timesheet' as any); return }
  const route = routeForNotification(data)
  if (route) router.push(route as any)
}

// Tapping a notification opens what it is about. Returns the unsubscribe.
export function listenForNotificationTaps(): () => void {
  try {
    const sub = Notifications.addNotificationResponseReceivedListener(resp => {
      handleResponse(resp, false)
    })
    // The app may have been opened from a notification while closed.
    Notifications.getLastNotificationResponseAsync().then(resp => {
      if (resp) setTimeout(() => handleResponse(resp, true), 400)
    }).catch(() => {})
    return () => sub.remove()
  } catch {
    return () => {}
  }
}

export async function unregisterPush(): Promise<void> {
  try {
    if (!registered) return
    await supabase.from('push_tokens').delete().eq('token', registered)
    registered = null
  } catch { /* ignore */ }
}
