import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import 'react-native-url-polyfill/auto'
import { installOrgScopedStorage } from './storageOrgScope'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// installOrgScopedStorage prefixes every storage path with the caller's org, so
// uploads land where storage_tenant_isolation can find them and call sites keep
// passing the short path. See lib/storageOrgScope.ts for why the database
// cannot do this itself.
export const supabase = installOrgScopedStorage(createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
}))
