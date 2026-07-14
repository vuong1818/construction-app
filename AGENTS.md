# Autopilot mode — commit + push automatically

Standing authorization from the user (2026-07-14). This is the Expo / React Native mobile app (bilingual EN/ES) on the shared Supabase backend. After each logical unit of work is done and the code type-checks, push without asking:

1. **Type-check first** — run `npx tsc --noEmit` and make sure the files you changed introduce no new errors (the repo has some pre-existing errors in unrelated files; don't let those block you, but don't add new ones in your files).
2. **Then commit + push** — `git add` only the files you changed (no `-A`/`.`), commit with a brief lowercase message in the existing style plus the standard `Co-Authored-By: Claude` line, then `git push origin main`.

**Don't push mid-task.** Wait for a logical unit (feature, fix, related set of changes) to be complete and type-checking clean, then push the whole thing as one commit.

**Backend note.** DB schema/RLS lives in the web repo (`nguyenmep-website/supabase/migrations`), not here. If a mobile change needs a schema change, make the migration in the web repo (its own autopilot rules apply) and apply it before shipping the mobile code that depends on it.

**Still pause and confirm for:**
- `git push --force` / `--force-with-lease`
- EAS builds / TestFlight submissions (`eas build`, `eas submit`) — these are outside the repo and cost build minutes; confirm first unless the user asked for a build in the same request.
- Anything outside the repo (App Store Connect, key/credential changes, dashboard changes)
