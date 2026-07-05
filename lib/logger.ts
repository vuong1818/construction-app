// Central error logger. Always writes to the console; best-effort persists to
// the Supabase `app_error_logs` table so field bugs are debuggable after the
// fact (managers can read the log). Logging is fire-and-forget and NEVER throws
// — a logging failure must not break the screen that called it.

import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

export type ErrorMeta = Record<string, unknown>

function appVersion(): string {
  const v = Constants.expoConfig?.version ?? '?'
  const build = Platform.select({
    ios: Constants.expoConfig?.ios?.buildNumber,
    android:
      Constants.expoConfig?.android?.versionCode != null
        ? String(Constants.expoConfig.android.versionCode)
        : undefined,
    default: undefined,
  })
  return build ? `${v} (build ${build})` : v
}

// Pull a readable message + stack out of anything a catch might hand us:
// Error instances, Supabase error objects ({ message, code }), plain strings.
function toParts(err: unknown): { message: string; stack: string | null } {
  if (err instanceof Error) return { message: err.message, stack: err.stack ?? null }
  if (err && typeof err === 'object') {
    const e = err as Record<string, any>
    const message =
      e.message || e.error_description || e.msg || e.details || safeStringify(e)
    return { message: String(message), stack: e.stack ?? null }
  }
  return { message: String(err), stack: null }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function sanitizeMeta(meta: ErrorMeta): ErrorMeta | null {
  try {
    return JSON.parse(JSON.stringify(meta))
  } catch {
    return { _unserializable: true }
  }
}

/**
 * Log an error. `context` is a short tag for where it happened
 * (e.g. 'ensure_weekly_safety_topic' or 'weekly-safety-meeting.load').
 * `meta` is optional structured context (ids, params, route).
 */
export async function logError(
  context: string,
  err: unknown,
  meta?: ErrorMeta,
): Promise<void> {
  const { message, stack } = toParts(err)

  // Always visible in Metro / device logs.
  // eslint-disable-next-line no-console
  console.error(`[${context}]`, message, meta ?? '', stack ?? '')

  try {
    let userId: string | null = null
    try {
      const { data } = await supabase.auth.getSession()
      userId = data.session?.user?.id ?? null
    } catch {
      // ignore — log anonymously
    }

    await supabase.from('app_error_logs').insert({
      user_id: userId,
      platform: Platform.OS,
      app_version: appVersion(),
      context,
      message: message ? message.slice(0, 4000) : null,
      stack: stack ? stack.slice(0, 8000) : null,
      meta: meta ? sanitizeMeta(meta) : null,
    })
  } catch {
    // Swallow — logging must never surface an error of its own.
  }
}

/**
 * Install a global handler so uncaught JS errors are logged before the app's
 * default handler runs (which, in production, shows the red/blank crash). Safe
 * to call more than once — only the first call takes effect.
 */
export function installGlobalErrorLogger(): void {
  const g = globalThis as any
  if (g.__errorLoggerInstalled) return
  g.__errorLoggerInstalled = true

  const errorUtils = g.ErrorUtils
  if (errorUtils && typeof errorUtils.getGlobalHandler === 'function') {
    const prev = errorUtils.getGlobalHandler()
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      // Fire-and-forget; don't await inside the global handler.
      void logError('global', error, { isFatal: !!isFatal })
      if (typeof prev === 'function') prev(error, isFatal)
    })
  }
}
