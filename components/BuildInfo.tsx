import * as Application from 'expo-application'
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
// time, chasing a bug that had already been fixed in a bundle the phone had not
// taken yet.
//
// So both are shown: the store version, and the update actually loaded.
//
//   Embedded  — the JS that shipped inside the binary, no OTA taken yet
//   Update    — an OTA is running; its id and publish date identify exactly which
//
// The id is the first characters of the EAS update group, which is what appears
// in `eas update:list`, so a screenshot of this line is enough to find the exact
// bundle somebody is on.
//
// ── Why expo-application and not expoConfig ─────────────────────────────────
// This used to read Constants.expoConfig.ios.buildNumber, which is the value in
// app.json — permanently "1". eas.json sets appVersionSource: "remote", so EAS
// owns the build number and stamps it into the native project at build time;
// app.json never learns it. The screen therefore claimed "1.1.0 (1)" while
// TestFlight showed 1.1.0 (4), which is worse than showing nothing: it is a
// confident wrong answer to the exact question being asked.
//
// expo-application reads Info.plist / PackageInfo at runtime, so it reports the
// number Apple and Android actually installed. expoConfig stays as the fallback
// for Expo Go, where there is no native binary of ours to ask.

function nativeVersion() {
  const version =
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '—'
  const build =
    Application.nativeBuildVersion ??
    Constants.expoConfig?.ios?.buildNumber ??
    (Constants.expoConfig?.android?.versionCode != null
      ? String(Constants.expoConfig.android.versionCode)
      : null)
  return { version, build }
}

// Updates.* throws rather than returning empty when updates are disabled, which
// is every dev-client and Expo Go session. A crash on the dashboard would be a
// steep price for a diagnostic line, so every read is guarded.
function updateInfo() {
  try {
    const embedded = Updates.isEmbeddedLaunch
    const id = Updates.updateId ? Updates.updateId.slice(0, 8) : null
    const created = Updates.createdAt
      ? Updates.createdAt.toLocaleString(undefined, {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        })
      : null
    return { embedded, id, created, channel: Updates.channel || null }
  } catch {
    return { embedded: false, id: null, created: null, channel: null }
  }
}

// One quiet line, for the top of a working screen. Everything support needs to
// identify a build, and nothing else.
export function BuildInfoLine() {
  const { version, build } = nativeVersion()
  const { embedded, id, channel } = updateInfo()

  const parts = [
    `v${version}${build ? ` (${build})` : ''}`,
    channel,
    embedded ? 'embedded' : id,
  ].filter(Boolean)

  return (
    <Text
      selectable
      style={{
        color: COLORS.subtext,
        fontSize: 11,
        textAlign: 'center',
        marginBottom: 10,
        opacity: 0.75,
      }}
    >
      {parts.join(' · ')}
    </Text>
  )
}

export function BuildInfo() {
  const { version, build } = nativeVersion()
  const { embedded, id, created, channel } = updateInfo()

  const line2 = embedded
    ? 'Embedded — no update downloaded yet'
    : id
      ? `Update ${id}${created ? ` · ${created}` : ''}`
      : 'Update — details unavailable'

  return (
    <View style={{ paddingHorizontal: 4, paddingVertical: 14 }}>
      <Text selectable style={{ color: COLORS.subtext, fontSize: 12, textAlign: 'center' }}>
        v{version}{build ? ` (${build})` : ''}{channel ? ` · ${channel}` : ''}
      </Text>
      <Text selectable style={{ color: COLORS.subtext, fontSize: 11, textAlign: 'center', marginTop: 2 }}>
        {line2}
      </Text>
    </View>
  )
}
