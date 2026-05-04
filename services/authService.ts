import { supabase } from '../lib/supabase'

export type AppProfile = {
  id: string
  full_name: string | null
  role: string | null
}

export async function getSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
    throw new Error(error.message)
  }

  return session
}

export async function requireSessionUser() {
  const session = await getSession()

  if (!session?.user) {
    throw new Error('You must be signed in.')
  }

  return session.user
}

/**
 * Keep both names so older and newer files both work.
 */
export async function getProfile(userId: string): Promise<AppProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function getUserProfile(userId: string): Promise<AppProfile | null> {
  return getProfile(userId)
}

export async function requireProfile(userId: string): Promise<AppProfile> {
  const profile = await getProfile(userId)

  if (!profile) {
    return {
      id: userId,
      full_name: null,
      role: null,
    }
  }

  return profile
}

export async function getCurrentUserProfile(): Promise<AppProfile> {
  const user = await requireSessionUser()
  return requireProfile(user.id)
}

export async function getCurrentUserFullName(): Promise<string | null> {
  const profile = await getCurrentUserProfile()
  return profile.full_name
}

export async function getUserFullName(userId: string): Promise<string | null> {
  const profile = await getProfile(userId)
  return profile?.full_name ?? null
}

export async function getCurrentUserRole(): Promise<string> {
  const profile = await getCurrentUserProfile()
  return profile.role || 'worker'
}

export async function signOutLocal() {
  const { error } = await supabase.auth.signOut({ scope: 'local' })

  if (error) {
    throw new Error(error.message)
  }
}

/**
 * Optional default export so both named imports and namespace imports work.
 * Example:
 *   import * as authService from '../services/authService'
 */
const authService = {
  getSession,
  requireSessionUser,
  getProfile,
  getUserProfile,
  requireProfile,
  getCurrentUserProfile,
  getCurrentUserFullName,
  getUserFullName,
  getCurrentUserRole,
  signOutLocal,
}

export default authService