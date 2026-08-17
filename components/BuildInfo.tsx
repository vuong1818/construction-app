import Constants from 'expo-constants'
import * as Updates from 'expo-updates'
import { Text, View } from 'react-native'
import { COLORS } from '../lib/theme'

// What this device is actually running.
//
// TestFlight shows the BINARY version and nothing else, which is only half the
// answer: the JavaScript can be newer than the binary, because an OTA replaces
// it without changing the version Apple displays. A tester saying "I'm on
// 1.1.0" is therefore not saying which code they have — and that gap cost real
// time this week, chasing a bug that had already been fixed in a bundle the
// phone had not taken yet.
//
// So both are shown: the store version, and the update actually loaded.
//
//   Embedded  — the JS that shipped inside the binary, no OTA taken yet
//   Update    — an OTA is running; its id and publish date identify exactly which
//
// The id is the first characters of the EAS update group, which is what appears
// in `eas update:list`, so a screenshot of this line is enough to find the exact
// bundle a tester is on.
export function BuildInfo() {
  const version = Constants.expoConfig?.version ?? '—'
  const build =
    Constants.expoConfig?.ios?.buildNumber ??
    String(Constants.expoConfig?.android?.versionCode ?? '') ??
    ''

  // In development there is no update to describe, and Updates.* throws rather
  // than returning empty — hence the guard rather than optional chaining.
  const embedded = Updates.isEmbeddedLaunch
  const id = Updates.updateId ? Updates.updateId.slice(0, 8) : null
  const created = Updates.createdAt
    ? Updates.createdAt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null
  const channel = Updates.channel || null

  const line2 = embedded
    ? 'Embedded — no update downloaded yet'
    : id
      ? `Update ${id}${created ? ` · ${created}` : ''}`
      : 'Update — details unavailable'

  return (
    <View style={{ paddingHorizontal: 4, paddingVertical: 14 }}>
      <Text style={{ color: COLORS.subtext, fontSize: 12, textAlign: 'center' }}>
        v{version}{build ? ` (${build})` : ''}{channel ? ` · ${channel}` : ''}
      </Text>
      <Text selectable style={{ color: COLORS.subtext, fontSize: 11, textAlign: 'center', marginTop: 2 }}>
        {line2}
      </Text>
    </View>
  )
}
