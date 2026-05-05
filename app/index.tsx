import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

export default function IndexScreen() {
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    let mounted = true

    async function checkSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!mounted) return
        setHasSession(!!session)
      } catch {
        if (mounted) setHasSession(false)
      } finally {
        if (mounted) setReady(true)
      }
    }

    checkSession()

    return () => {
      mounted = false
    }
  }, [])

  if (!ready) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: COLORS.background,
        }}
      >
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>Loading...</Text>
      </SafeAreaView>
    )
  }

  return hasSession ? <Redirect href="/(tabs)" /> : <Redirect href="/sign-in" />
}