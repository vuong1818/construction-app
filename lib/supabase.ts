import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { makeLoggingFetch } from './supabaseQueryLog'
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
  global: { fetch: makeLoggingFetch() },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
}))
