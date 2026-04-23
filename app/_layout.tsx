import { Stack } from 'expo-router'

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: '#16356B',
        },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: {
          fontWeight: '700',
          color: '#FFFFFF',
        },
        headerBackTitleVisible: false,
        contentStyle: {
          backgroundColor: '#F6F8FB',
        },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="projects" options={{ title: 'Projects' }} />
      <Stack.Screen name="safety" options={{ title: 'Safety' }} />
      <Stack.Screen name="project/[id]" options={{ title: 'Project' }} />
      <Stack.Screen name="project/[id]/new-report" options={{ title: 'New Daily Report' }} />
      <Stack.Screen name="project/[id]/report/[reportId]" options={{ title: 'Daily Report' }} />
      <Stack.Screen name="project/[id]/pdf/[fileId]" options={{ title: 'PDF Viewer' }} />

      <Stack.Screen name="manager/workers" options={{ title: 'Workers' }} />
      <Stack.Screen name="manager/time-clock" options={{ title: 'Time Clock' }} />
      <Stack.Screen name="manager/plans" options={{ title: 'Plans' }} />
      <Stack.Screen name="manager/reports" options={{ title: 'Reports' }} />

      <Stack.Screen name="smart-tools/index" options={{ title: 'Smart Tools' }} />
      <Stack.Screen name="smart-tools/electrical" options={{ title: 'Electrical Tools' }} />
      <Stack.Screen name="smart-tools/plumbing" options={{ title: 'Plumbing Tools' }} />
      <Stack.Screen name="smart-tools/mechanical" options={{ title: 'Mechanical Tools' }} />
      <Stack.Screen name="smart-tools/building" options={{ title: 'Building Tools' }} />
    </Stack>
  )
}