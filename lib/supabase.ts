import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { createClient } from '@supabase/supabase-js'
import { makeLoggingFetch, type QueryFailure } from './supabaseQueryLog'
import 'react-native-url-polyfill/auto'
import { installOrgScopedStorage } from './storageOrgScope'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// installOrgScopedStorage prefixes every storage path with the caller's org, so
// uploads land where storage_tenant_isolation can find them and call sites keep
// passing the short path. See lib/storageOrgScope.ts for why the database
// cannot do this itself.
// makeLoggingFetch reports failed queries — without it a broken query and an
// empty table look the same, which is how useProjectFinance spent months
// querying a table that no longer existed. See audit 2026-08-09 P5.
export const supabase = installOrgScopedStorage(createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: makeLoggingFetch(report) },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
}))

// Persist what the fetch wrapper saw. Declared after `supabase` deliberately:
// it only runs on a failure, long after this module finishes evaluating.
//
// Fire and forget — a diagnostics write must never slow down or break the
// screen that triggered it. The wrapper skips app_error_logs itself, so a
// failure here cannot feed itself.
function report(info: QueryFailure) {
  void supabase.from('app_error_logs').insert({
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version ?? '?',
    context: `query:${info.table}`,
    message: `${info.status} ${info.message}`,
    severity: info.status >= 500 ? 'error' : 'warn',
    fingerprint: info.fingerprint,
    meta: { status: info.status, table: info.table, details: info.details, hint: info.hint },
    // org_id and user_id are stamped by a trigger; anything sent is ignored.
  }).then(() => {}, () => {})
}
