# Autopilot mode — commit + push automatically

Standing authorization from the user (2026-07-14). This is the Expo / React Native mobile app (bilingual EN/ES) on the shared Supabase backend. After each logical unit of work is done and the code type-checks, push without asking:

1. **Type-check first** — run `npx tsc --noEmit` and make sure the files you changed introduce no new errors (the repo has some pre-existing errors in unrelated files; don't let those block you, but don't add new ones in your files).
2. **Then commit + push** — `git add` only the files you changed (no `-A`/`.`), commit with a brief lowercase message in the existing style plus the standard `Co-Authored-By: Claude` line, then `git push origin main`.
3. **Then publish an OTA update to BOTH branches (JS-only changes)** — standing authorization from the user (2026-07-15):

   ```
   npx eas update --branch production --message "<recap>" --non-interactive
   npx eas update --branch preview    --message "<recap>" --non-interactive
   ```

   **Both, every time.** iOS ships through TestFlight on the `production`
   channel; Android ships as a direct-download APK built from the `preview`
   profile, which is pinned to the `preview` channel (see `eas.json`). Updating
   only production leaves every Android user behind, silently — they keep
   running whatever JS their APK was built with and nothing warns anybody.

   That is not hypothetical. On 2026-08-08 Android users could not save a photo
   at all: "new row violates row-level security policy". The org-scoped storage
   wrapper had gone out on production two days earlier, the database started
   enforcing the matching write policy the next day, and `preview` was still
   four days stale — so Android was uploading to unprefixed paths the database
   now refused. iOS was fine throughout, which is exactly what makes this kind
   of drift hard to spot.
4. **Then record the release, or the download page lies** — standing
   authorization (2026-09-05):

   ```
   cd E:/Websites/GitHub/nguyenmep-website
   node scripts/record-release.mjs --platform all --kind ota --version <app.json version> --notes "<recap>"
   ```

   siteofficeiq.com/download reads `app_releases`, not an environment variable,
   and that table is only as truthful as the last thing that wrote to it. It
   went three weeks stale because nothing did.

   After an EAS **build** (not an OTA), record the binary instead — Android with
   the APK link uploaded to the public siteofficeiq-releases repo, iOS with the
   PUBLIC TestFlight invite link for that build, so somebody can install without
   being added as a tester by hand:

   ```
   node scripts/record-release.mjs --platform android --kind build --version 1.1.0 --build 3 --url <apk url>
   node scripts/record-release.mjs --platform ios --kind build --version 1.1.0 --build 3 --url https://testflight.apple.com/join/XXXXXXXX
   ```

   - **Skip OTA and note a rebuild is needed** when the change is NOT JS-only: a new/updated native dependency, an `app.json` plugin/native-config change, or a `runtimeVersion` bump. OTA can't deliver native changes.

### Sentry / EXPO_PUBLIC_SENTRY_DSN — the one that can brick the fleet

`@sentry/react-native` is a NATIVE module. It exists only in a binary built
with it. `runtimeVersion` is `{"policy": "appVersion"}`, so every phone in the
field is on runtime `1.0.0` and an OTA published today reaches all of them.

If a bundle that touches Sentry is delivered over the air to a binary built
before Sentry was added, that app crashes on startup — every user, both
platforms, unrecoverable without a store release.

`lib/crashReporting.ts` is written so this cannot happen by accident: with no
DSN it returns before the `require()`, so the module is never evaluated. The
DSN is inlined at BUILD time, so old binaries can never have one.

The rule that code cannot enforce:

> **Introducing `EXPO_PUBLIC_SENTRY_DSN` must happen in the same change as an
> `app.json` version bump, and must ship as an EAS build — never as an OTA.**

The version bump gives the new binary its own `runtimeVersion`, so updates
carrying a DSN can only ever reach binaries that have the native module. Old
binaries stay on their old runtime and never see it.

**Status: done, 2026-08-17.** The DSN is set in `eas.json` under the `preview`
and `production` build profiles, in the same commit as the `1.0.0 → 1.1.0`
version bump. A DSN is not a secret — it only permits SENDING events, and it is
inlined into the shipped binary anyway — so it lives in the repo rather than in
EAS secrets, where it is visible next to the profile it belongs to.

What this means for OTAs from now on:

- Runtime is now `1.1.0`. **Every phone in the field is still on `1.0.0` until
  the new build is installed**, so `eas update` reaches NOBODY in the meantime.
  Publishing one is harmless but pointless; don't mistake a successful
  `eas update` for a shipped change until the build is out.
- Once phones are on 1.1.0, normal JS-only OTA rules resume, and they are safe:
  a 1.1.0 bundle can only reach a 1.1.0 binary, which has the native module.
- The `development` profile deliberately has no DSN, so dev-client runs do not
  report into Sentry and a dev build without the native module still starts.

**Don't push mid-task.** Wait for a logical unit (feature, fix, related set of changes) to be complete and type-checking clean, then push + OTA the whole thing as one commit.

**Backend note.** DB schema/RLS lives in the web repo (`nguyenmep-website/supabase/migrations`), not here. If a mobile change needs a schema change, make the migration in the web repo (its own autopilot rules apply) and apply it before shipping the mobile code that depends on it.

**Testing before TestFlight (preferred flow).** The user wants to test each change before it reaches TestFlight. Do NOT `--auto-submit`. Instead:
1. For iteration, favor the dev-client loop: `npx expo start --dev-client` (the user has a development build installed) or `eas update --branch <channel>` for JS-only OTA changes — no rebuild, instant on-device.
2. When a real build is needed, build WITHOUT auto-submit (e.g. `eas build -p ios --profile production` or `--profile preview` for an internal-distribution test build).
3. Submit to TestFlight (`eas submit -p ios --latest`) ONLY after the user has tested and says to ship.

**Still pause and confirm for:**
- `git push --force` / `--force-with-lease`
- EAS builds / TestFlight submissions (`eas build`, `eas submit`) — outside the repo, cost build minutes; confirm first unless the user asked for a build in the same request. Never auto-submit to TestFlight without explicit approval.
- Anything outside the repo (App Store Connect, key/credential changes, dashboard changes)
