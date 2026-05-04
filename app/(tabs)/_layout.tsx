import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function TabsLayout() {
  const [isManager, setIsManager] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    async function loadRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (active) setLoaded(true)
        return
      }
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (!active) return
      setIsManager(prof?.role === 'manager')
      setLoaded(true)
    }
    loadRole()
    // Re-check on auth state changes so the tab strip updates if the user
    // signs out + back in as a different role on the same device.
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadRole()
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#19B6D2',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          height: 88,
          paddingTop: 8,
          paddingBottom: 20,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Manager',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group-outline" size={size} color={color} />
          ),
          // Hide the Manager tab entirely for workers + contractors so they
          // don't tap it expecting something useful and land on a "no
          // permission" screen. Default to hidden until the role load
          // completes — flashing the tab on then off is worse UX.
          href: loaded && isManager ? undefined : null,
        }}
      />
    </Tabs>
  )
}
