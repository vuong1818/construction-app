import Constants from 'expo-constants'
import { router, Stack } from 'expo-router'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context'
import { LanguageProvider } from '../lib/i18n'
import { initCrashReporting, setCrashUser } from '../lib/crashReporting'
import { installGlobalErrorLogger } from '../lib/logger'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

// Capture uncaught JS errors app-wide into the error log.
installGlobalErrorLogger()

// Native crashes — the ones that kill the process before any JS can run, so
// installGlobalErrorLogger above never sees them. Inert without a DSN, and
// inert on any binary built before the native module existed.
initCrashReporting()

// Tell the office this phone is alive and what it is running. Crew → Workers
// on the web reads it: auth records a sign-in, but a mobile session lasts
// months, so "last signed in" reports a daily user as absent since March. This
// is also the only moment the running build is known — which is how you tell
// whether an OTA has actually reached somebody's phone.
//
// Fire and forget. A phone that cannot report itself must still work.
function stampAppSession() {
  const version = Constants.expoConfig?.version ?? null
  const build = Platform.select({
    ios: Constants.expoConfig?.ios?.buildNumber,
    android:
      Constants.expoConfig?.android?.versionCode != null
        ? String(Constants.expoConfig.android.versionCode)
        : undefined,
    default: undefined,
  })
  supabase
    .rpc('record_app_session', {
      p_platform: Platform.OS,
      p_app_version: version,
      p_build: build ?? null,
    })
    .then(() => {}, () => {})
}

export default function RootLayout() {
  // Global auth listener — redirect to sign-in if session expires or token refresh fails
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        setCrashUser(null)
        router.replace('/sign-in')
      } else if (session?.user?.id) {
        // Id only — a crash report is a debugging artefact, not somewhere to
        // copy the customer's directory.
        setCrashUser(session.user.id)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Once per app start, and again on a fresh sign-in. Not on every token
  // refresh: the row is "what are they on", not a log of every wake-up.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) stampAppSession() })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') stampAppSession()
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    // Every SafeAreaView in this app was measuring nothing. react-native-safe-area-context
    // returns zero insets without a provider above it, so "safe area" meant no
    // padding at all — headers sat under the notch and their close buttons sat
    // under the status bar, where the system swallows the tap. That is why the
    // X "does not work or is very hard to tap" and why people were force-quitting
    // the app to get out of a screen.
    //
    // initialWindowMetrics seeds the first frame from native, so the insets are
    // right immediately instead of the layout jumping once they resolve.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <LanguageProvider>
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: COLORS.navy },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: '700', color: COLORS.white },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: COLORS.background },
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
      {/* Without an entry here expo-router falls back to the ROUTE as the title,
          so these screens were headed "project/[id]/job-kit". Every one of them
          is reached from inside a project, so each says which project thing it
          is rather than repeating the job's name. */}
      <Stack.Screen name="project/[id]/job-kit"           options={{ title: 'Project Tasks' }} />
      <Stack.Screen name="project/[id]/rfis"              options={{ title: 'Project RFIs' }} />
      <Stack.Screen name="project/[id]/expenses"          options={{ title: 'Project Expenses' }} />
      <Stack.Screen name="project/[id]/material-requests" options={{ title: 'Project Material Requests' }} />
      <Stack.Screen name="project/[id]/inspections"       options={{ title: 'Project Inspections' }} />
      <Stack.Screen name="project/[id]/tasks"             options={{ title: 'Project Schedule' }} />
      <Stack.Screen name="project/[id]/edit"              options={{ title: 'Edit Project' }} />
      <Stack.Screen name="equipment"                      options={{ title: 'Tools & Equipment' }} />

      <Stack.Screen name="manager/workers"    options={{ title: 'Workers' }} />
      {/* The screen is the weekly payroll run — hours, receipts, mileage and what
          each worker is owed. "Time Clock" described only the first column. */}
      <Stack.Screen name="manager/time-clock" options={{ title: 'Payroll' }} />
      <Stack.Screen name="manager/reports"    options={{ title: 'Reports' }} />
      <Stack.Screen name="manager/finance"          options={{ title: 'Company Finance' }} />
      <Stack.Screen name="manager/company"          options={{ title: 'Company Information' }} />
      <Stack.Screen name="manager/settings/index"   options={{ title: 'Company Settings' }} />
      <Stack.Screen name="manager/safety/index"     options={{ title: 'Safety Compliance' }} />

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
    </SafeAreaProvider>
  )
}