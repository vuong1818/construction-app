import { router, Stack } from 'expo-router'
import { useEffect } from 'react'
import { LanguageProvider } from '../lib/i18n'
import { supabase } from '../lib/supabase'

export default function RootLayout() {
  // Global auth listener — redirect to sign-in if session expires or token refresh fails
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        router.replace('/sign-in')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <LanguageProvider>
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#16356B' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '700', color: '#FFFFFF' },
        headerBackTitleVisible: false,
        contentStyle: { backgroundColor: '#D6E8FF' },
      }}
    >
      <Stack.Screen name="index"                          options={{ headerShown: false }} />
      <Stack.Screen name="sign-in"                        options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)"                         options={{ headerShown: false }} />
      <Stack.Screen name="projects"                       options={{ title: 'Projects' }} />
      <Stack.Screen name="safety"                         options={{ title: 'Safety' }} />
      <Stack.Screen name="safety-manual"                  options={{ title: 'Safety Manual' }} />
      <Stack.Screen name="weekly-safety-meeting"          options={{ title: 'Weekly Safety Meeting' }} />
      <Stack.Screen name="project/[id]"                   options={{ title: 'Project' }} />
      <Stack.Screen name="project/[id]/new-report"        options={{ title: 'New Daily Report' }} />
      <Stack.Screen name="project/[id]/report/[reportId]" options={{ title: 'Daily Report' }} />

      <Stack.Screen name="manager/workers"    options={{ title: 'Workers' }} />
      <Stack.Screen name="manager/time-clock" options={{ title: 'Time Clock' }} />
      <Stack.Screen name="manager/plans"      options={{ title: 'Plans' }} />
      <Stack.Screen name="manager/reports"    options={{ title: 'Reports' }} />

      <Stack.Screen name="smart-tools/index"      options={{ title: 'Smart Tools' }} />
      <Stack.Screen name="smart-tools/electrical"  options={{ title: 'Electrical Tools' }} />
      <Stack.Screen name="smart-tools/plumbing"    options={{ title: 'Plumbing Tools' }} />
      <Stack.Screen name="smart-tools/mechanical"  options={{ title: 'Mechanical Tools' }} />
      <Stack.Screen name="smart-tools/building"    options={{ title: 'Building Tools' }} />
      <Stack.Screen name="smart-tools/backflow/index" options={{ title: 'Backflow Tests' }} />
      <Stack.Screen name="smart-tools/backflow/new"   options={{ title: 'New Backflow Test' }} />
      <Stack.Screen name="smart-tools/backflow/[id]"  options={{ title: 'Backflow Test' }} />
    </Stack>
    </LanguageProvider>
  )
}