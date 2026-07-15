# Autopilot mode — commit + push automatically

Standing authorization from the user (2026-07-14). This is the Expo / React Native mobile app (bilingual EN/ES) on the shared Supabase backend. After each logical unit of work is done and the code type-checks, push without asking:

1. **Type-check first** — run `npx tsc --noEmit` and make sure the files you changed introduce no new errors (the repo has some pre-existing errors in unrelated files; don't let those block you, but don't add new ones in your files).
2. **Then commit + push** — `git add` only the files you changed (no `-A`/`.`), commit with a brief lowercase message in the existing style plus the standard `Co-Authored-By: Claude` line, then `git push origin main`.
3. **Then publish an OTA update (JS-only changes)** — standing authorization from the user (2026-07-15): after each mobile change ships, run `npx eas update --channel production --message "<recap>" --non-interactive` so the live TestFlight build picks it up (runtime 1.0.0). This is JS-only delivery — it reaches existing builds without a rebuild.
   - **Skip OTA and note a rebuild is needed** when the change is NOT JS-only: a new/updated native dependency, an `app.json` plugin/native-config change, or a `runtimeVersion` bump. OTA can't deliver native changes.

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
