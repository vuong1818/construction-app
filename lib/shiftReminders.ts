// Still working? (2026-10-16)
//
// A shift nobody clocks out of is closed by the office's cron at the company's
// cap (company_settings.max_shift_hours, 23 by default) and flagged on Time &
// Payroll. Before it gets there, the phone asks. Twelve hours after clock-in a
// notification asks whether the worker is still working, with two buttons:
// "Yes, still working" keeps the shift open, "No, clock me out" ends it. The
// same question repeats every hour until the cap, and one last notification
// says the shift was closed automatically and the office will review it.
//
// Everything is scheduled locally at clock-in, so it fires with no signal and
// with the app closed. A clock-out, a job switch, or a dashboard load that
// finds no open shift cancels what is still pending. The buttons are handled
// in lib/push.ts; the same question is asked in-app on Home.
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { getSavedLanguage, t } from './i18n'

export const STILL_WORKING_CATEGORY = 'still-working'
export const STILL_WORKING_KIND = 'still_working'
export const AUTO_CLOCKED_OUT_KIND = 'auto_clocked_out'
export const ACTION_YES = 'yes'
export const ACTION_CLOCK_OUT = 'clock_out'
/** Hours after clock-in of the first "still working?" ask. */
export const FIRST_ASK_HOURS = 12
/** The office closes the shift here (company_settings.max_shift_hours default). */
export const CAP_HOURS = 23

const HOUR = 3600 * 1000
let categoryLanguage: string | null = null
let scheduledFor: { entryId: number | null; clockIn: string } | null = null

type OpenEntry = { id: number; clock_in_time: string | null; clock_out_time?: string | null }

async function ensureCategory(): Promise<void> {
  const language = await getSavedLanguage()
  if (categoryLanguage === language) return
  await Notifications.setNotificationCategoryAsync(STILL_WORKING_CATEGORY, [
    { identifier: ACTION_YES, buttonTitle: t(language, 'stillWorkingYes'), options: { opensAppToForeground: false } },
    // Clocking out needs the network and, ideally, a GPS fix: open the app.
    { identifier: ACTION_CLOCK_OUT, buttonTitle: t(language, 'stillWorkingClockOut'), options: { opensAppToForeground: true } },
  ])
  categoryLanguage = language
}

function isOurs(n: Notifications.NotificationRequest): boolean {
  const kind = (n.content.data as any)?.kind
  return kind === STILL_WORKING_KIND || kind === AUTO_CLOCKED_OUT_KIND
}

/** Drop every pending reminder. Safe to call when nothing is pending. */
export async function cancelShiftReminders(): Promise<void> {
  scheduledFor = null
  try {
    if (Platform.OS === 'web') return
    const all = await Notifications.getAllScheduledNotificationsAsync()
    await Promise.all(all.filter(isOurs).map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)))
  } catch {
    // A phone that cannot schedule must still clock.
  }
}

/** Schedule the asks for one shift, replacing whatever was pending. */
export async function scheduleShiftReminders(entryId: number | null, clockInIso: string): Promise<void> {
  try {
    if (Platform.OS === 'web') return
    await cancelShiftReminders()
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') return
    const clockIn = new Date(clockInIso).getTime()
    if (!Number.isFinite(clockIn)) return
    const language = await getSavedLanguage()
    await ensureCategory()
    const now = Date.now()
    const trigger = (date: Date): Notifications.DateTriggerInput => ({
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
    })
    for (let h = FIRST_ASK_HOURS; h < CAP_HOURS; h++) {
      const at = new Date(clockIn + h * HOUR)
      if (at.getTime() <= now + 5000) continue
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t(language, 'stillWorkingTitle'),
          body: t(language, 'stillWorkingBody', { hours: h }),
          categoryIdentifier: STILL_WORKING_CATEGORY,
          data: { kind: STILL_WORKING_KIND, entry_id: entryId, hours: h },
          sound: 'default',
        },
        trigger: trigger(at),
      })
    }
    const capAt = new Date(clockIn + CAP_HOURS * HOUR)
    if (capAt.getTime() > now + 5000) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t(language, 'autoClockedOutTitle'),
          body: t(language, 'autoClockedOutBody', { hours: CAP_HOURS }),
          data: { kind: AUTO_CLOCKED_OUT_KIND, entry_id: entryId },
          sound: 'default',
        },
        trigger: trigger(capAt),
      })
    }
    scheduledFor = { entryId, clockIn: clockInIso }
  } catch {
    // Same: never let a notification problem block a clock-in.
  }
}

/**
 * Dashboard load: the open shift (or none) decides what should be pending.
 * Covers a shift opened on another phone, an app reinstall, and a shift the
 * office or the cron closed while the phone was in a pocket.
 */
export async function syncShiftReminders(entry: OpenEntry | null): Promise<void> {
  if (!entry || entry.clock_out_time || !entry.clock_in_time) {
    await cancelShiftReminders()
    return
  }
  if (scheduledFor && scheduledFor.entryId === entry.id && scheduledFor.clockIn === entry.clock_in_time) return
  await scheduleShiftReminders(entry.id, entry.clock_in_time)
}
