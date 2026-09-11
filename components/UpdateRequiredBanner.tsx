// "Your app is behind." (2026-09-11)
//
// Over-the-air updates only reach a binary on the current runtime. When the
// runtime moved to 1.2.0, nine phones stayed on the 1.1.0 binary and quietly
// stopped receiving every fix after it — and nothing on the phone said so.
// The audit found them in user_app_sessions; the crew had no way to know.
//
// So the phone compares the version Apple or Android actually installed
// (expo-application, not the JS bundle's app.json) with the newest BUILD the
// download page records in app_releases, and when it is behind, says so at the
// top of the home screen with the link that fixes it: TestFlight on iOS, the
// APK on Android. app_releases is readable by everyone signed in.
import * as Application from 'expo-application'
import { useEffect, useState } from 'react'
import { Linking, Platform, Pressable, Text, View } from 'react-native'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'

type Release = { version: string | null; build_number: string | null; download_url: string | null }

// 1.2.0 vs 1.10.0 compares numerically, segment by segment.
function behind(installed: string | null | undefined, current: string | null | undefined) {
  if (!installed || !current) return false
  const a = installed.split('.').map(n => parseInt(n, 10) || 0)
  const b = current.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

export function UpdateRequiredBanner() {
  const { t } = useLanguage()
  const [release, setRelease] = useState<Release | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const platform = Platform.OS === 'ios' ? 'ios' : 'android'
      const { data } = await supabase
        .from('app_releases')
        .select('version, build_number, download_url')
        .eq('platform', platform)
        .eq('kind', 'build')
        .eq('is_current', true)
        .order('released_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (alive) setRelease((data as Release) || null)
    })().catch(() => {})
    return () => { alive = false }
  }, [])

  const installed = Application.nativeApplicationVersion
  if (!release || !behind(installed, release.version)) return null

  return (
    <Pressable
      onPress={() => { if (release.download_url) Linking.openURL(release.download_url).catch(() => {}) }}
      style={{
        backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 14,
        paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14,
      }}
    >
      <Text style={{ color: '#92400E', fontWeight: '800', fontSize: 15 }}>
        {t('updateRequiredTitle', { version: release.version || '' })}
      </Text>
      <Text style={{ color: '#92400E', marginTop: 3, lineHeight: 18, fontSize: 13 }}>
        {t('updateRequiredBody', { installed: installed || '?' })}
        {release.download_url ? ` ${t('updateRequiredTap')}` : ''}
      </Text>
    </Pressable>
  )
}

export default UpdateRequiredBanner
