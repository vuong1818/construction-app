// Native crash reporting.
//
// Everything else we log is written from JavaScript: the fetch wrapper catches
// failed queries, installGlobalErrorLogger catches uncaught JS errors, and both
// end up in app_error_logs. None of them can catch a NATIVE crash — an
// out-of-memory kill, a fault in a native module — because the process is gone
// before any JavaScript runs. That is the gap this fills, and the reason it
// needs a native module of its own.
//
// ── Why this is defensive to the point of being fussy ─────────────────────
// A native module only exists in a binary that was built with it. OTA updates
// ship JavaScript to binaries that already exist. So a bundle that touches
// Sentry, delivered over the air to a phone running a build from before Sentry
// was added, crashes that app on startup — for every user, on both platforms,
// with no way to fix it except a store release.
//
// What this file can do:
//
//   With no DSN, init() returns before the require(), so the module is never
//   evaluated and nothing native is ever reached. That is what makes the
//   current bundle safe to ship anywhere today — no DSN is set.
//
// What this file CANNOT do, and the reason the rule below matters:
//
//   EXPO_PUBLIC_SENTRY_DSN is inlined when a bundle is built — and `eas update`
//   builds a fresh bundle. So the moment that variable exists in the update
//   environment, an OTA carries a DSN, and it is delivered by runtimeVersion,
//   not by which binary you had in mind. runtimeVersion is `appVersion`, so
//   every phone in the field today is 1.0.0 and would receive it.
//
// The rule, which only a human can keep:
//
//   Introducing the DSN must happen in the same change as an app.json version
//   bump, and must ship as an EAS build, never as an OTA. The bump gives the
//   new binary its own runtimeVersion so a DSN-carrying bundle can only reach
//   binaries that have the native module. See AGENTS.md.

import Constants from 'expo-constants'
import { Platform } from 'react-native'

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || ''

let started = false

/** Whether crash reporting is actually running — useful in a diagnostics screen. */
export function crashReportingActive(): boolean {
  return started
}

/**
 * Start native crash reporting. Safe to call unconditionally: without a DSN, or
 * on a binary built before the native module existed, it does nothing and says
 * so in the console rather than throwing.
 */
export function initCrashReporting(): void {
  if (started || !DSN) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native')
    Sentry.init({
      dsn: DSN,
      // Errors only by default. Traces are a separate cost and a separate
      // decision; turn them on deliberately, not as a side effect of wanting
      // crash reports.
      tracesSampleRate: 0,
      // The JS layer already reports itself into app_error_logs. Sending the
      // same thing twice makes two incomplete pictures instead of one good one.
      enableAutoSessionTracking: true,
      environment: __DEV__ ? 'development' : 'production',
      release: `${Constants.expoConfig?.version ?? '?'}`,
      dist: String(
        Platform.select<string | number | undefined>({
          ios: Constants.expoConfig?.ios?.buildNumber,
          android: Constants.expoConfig?.android?.versionCode,
          default: undefined,
        }) ?? '0',
      ),
      // Never let a crash report carry the session. Supabase puts the access
      // token in a header, and a token in a third-party service is exactly the
      // kind of thing yesterday's audit was about.
      beforeSend(event: any) {
        try {
          if (event?.request?.headers) {
            delete event.request.headers.Authorization
            delete event.request.headers.authorization
            delete event.request.headers.apikey
          }
        } catch { /* scrubbing must not stop the report */ }
        return event
      },
    })
    started = true
  } catch (e) {
    // A binary without the native module lands here. That is expected on any
    // build made before Sentry was added, and must not be fatal.
    console.warn('[crash] native crash reporting unavailable:', (e as Error)?.message)
  }
}

/**
 * Tell crash reports who they belong to, after sign-in.
 *
 * Ids only — no name, email or phone. A crash report is a debugging artefact,
 * not a place to copy the customer's directory into. The ids are enough to join
 * back to profiles and organizations in our own database when we need to.
 */
export function setCrashUser(userId: string | null, orgId?: string | null): void {
  if (!started) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native')
    Sentry.setUser(userId ? { id: userId } : null)
    if (orgId) Sentry.setTag('org_id', orgId)
  } catch { /* never break sign-in over a diagnostics tag */ }
}
