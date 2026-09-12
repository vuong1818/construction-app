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

// Tapping a notification opens what it is about. Returns the unsubscribe.
export function listenForNotificationTaps(): () => void {
  try {
    const sub = Notifications.addNotificationResponseReceivedListener(resp => {
      const route = routeForNotification(resp.notification.request.content.data as any)
      if (route) router.push(route as any)
    })
    // The app may have been opened from a notification while closed.
    Notifications.getLastNotificationResponseAsync().then(resp => {
      const route = resp ? routeForNotification(resp.notification.request.content.data as any) : null
      if (route) setTimeout(() => router.push(route as any), 400)
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
