# SiteOfficeIQ On-Site (construction-app)

Field-crew mobile app for **SiteOfficeIQ**, used by Nguyen MEP crews and other customer companies. It runs in English and Spanish.
- Customers use the web portal at `app.siteofficeiq.com`. This app is for people in the field.
- Bundle / package: `com.siteofficeiq.onsite`. Slug `nguyenmep-onsite-tech`. URL scheme `onsitetech`.

## Release and commit rules (AGENTS.md)

The release and commit rules are in AGENTS.md, which is imported below and takes priority. Follow its autopilot steps after each logical unit of work:
1. Type-check.
2. Commit only the files you changed.
3. Push.
4. Publish the OTA update to **both** the production and preview branches.
5. Record the release.

@AGENTS.md

**Two corrections to AGENTS.md:**
- **runtimeVersion:** `app.json` is authoritative. It is currently pinned to the literal `"1.3.0"`. AGENTS.md's Sentry section still says `{"policy":"appVersion"}` / 1.1.0, which is out of date.
- **Android builds:** Android now builds with the `production` profile, not "preview pinned to preview channel". The rule to update both branches still applies.

## Stack

- **App framework:**
  - Expo SDK 54 and React Native 0.81, with the New Architecture on.
  - React 19.1 and expo-router 6, with typed routes and the React Compiler on.
- **Language:** TypeScript 5.9, strict.
- **Data and auth:** Supabase (`@supabase/supabase-js` v2).
  - Sign-in is email + password, and the session is kept in AsyncStorage.
- **Device and services:**
  - expo-updates for over-the-air (OTA) updates.
  - expo-notifications for push and local notifications.
  - expo-sqlite.
  - Sentry.
  - Mapbox static maps.
- **Backend:**
  - A shared Supabase project.
  - **This repo has no schema.** Tables, row-level security (RLS) and migrations live in the web repo `nguyenmep-website` (`supabase/migrations`, local copy at `E:/Websites/GitHub/nguyenmep-website`).
  - Make schema changes there first, apply them, and only then ship the mobile code that depends on them.
- **Server endpoints:** server work goes through the web API at `${WEB_BASE}/api/...` (`lib/config.ts`), for example `account/delete` and `portal/notify-*`.

## Commands

```
npm start                      # expo start  (dev client: npx expo start --dev-client)
npm run android | ios | web
npm run lint                   # expo lint
npx tsc --noEmit               # type check (there are pre-existing errors elsewhere; add none in touched files)
npx eas update --branch production --message "..." --non-interactive   # then the same with --branch preview
npx eas build --platform all --profile production --non-interactive    # confirm with the user first
```

- There are no automated tests.
- EAS build profiles are `development`, `preview` and `production`, each with its own channel.
- `appVersionSource` is `local`. Bump `version`, `ios.buildNumber` and `android.versionCode` by hand, and keep the two build numbers equal.

## Layout

| Path | What it is |
|---|---|
| `app/(tabs)/` | Main tabs: index, jobs, explore, warehouse, profile. Which tabs appear depends on the user's role |
| `app/manager/*` | Manager screens: today, crew status, time clock, workers, finance, money, reports, tasks, safety, settings, company |
| `app/project/[id]/*` | Project detail: reports, RFIs, tasks, expenses, inspections, material requests, job kit |
| `app/smart-tools/*` | Field calculators (NEC tables live in `lib/`) |
| `app/owner.tsx`, `app/contractor/` | Owner board and contractor crew hours |
| `components/` | Shared cards (MyDay, MyWeek, Inbox, …). `ui.tsx` is the newer kit (Button, Card, Field, Sheet, Segmented, Tile) — use it for new UI |
| `lib/` | `supabase`, `roles`, `i18n` + `locales/en.ts` / `es.ts`, `theme` (COLORS), `syncQueue`, `storageOrgScope`, `push`, `shiftReminders`, `workWeek`, `time`, `crashReporting`, `logger` |
| `services/` | Auth, clock-in dashboard, project detail, reports, manager summary, photo upload |
| `hooks/` | `useRealtimeRefetch`, `useProject*`, `useCompanyLogo` |
| `constants/theme.ts`, `themed-*`, `reset-project` | Expo template leftovers — don't build on them |

## Conventions

- **Roles** come from `lib/roles.ts`, which mirrors the web's `lib/roles.js`.
  - The roles are owner, general_manager, project_manager, office_manager, supervisor, worker, warehouse, contractor and contractor_manager.
  - The legacy names `manager` and `office` still work.
  - Gate features with the helpers: `isManagerRole`, `canFinance` / `canSeeWages`, `canEditScope`, `canStock`, `isSupervisorPlus`.
- **Every user-facing string** goes through `useLanguage()`.
  - Add each key to `lib/locales/en.ts`, which is the source of truth.
  - Then add it to `es.ts`, which is typed against `en.ts`.
- **Styling** is inline styles using `COLORS` from `lib/theme`. Imports are relative.
- **Money, pay and boards come from server RPCs**, never from client-side math. Examples: `my_pay`, `pay_rates`, `today_board`, `money_board`.
- **Live updates** use `useRealtimeRefetch('<table>', load)`.
- **Storage:**
  - `installOrgScopedStorage` adds the org id to the front of every storage path. Only `company-logos` and `app-downloads` are exempt.
  - Use signed URLs, not `getPublicUrl`.
- **Failed queries** are logged to `app_error_logs`.
- **Comments:** dated explanatory comment blocks are the norm. Keep that style.
- **Commit messages** are short and lowercase, and end with the Co-Authored-By line.

## Gotchas

- **Dates:**
  - The work week starts on Friday by default (`company_settings.work_week_start_day`).
  - `lib/workWeek.ts` must match SQL `work_week_start()`.
  - Use `fmtLocalDate`, not `toISOString().slice(0,10)`, which gives the UTC date. Shifts that cross midnight have caused bugs.
- **Offline:** only clock-in and task status updates are queued (`lib/syncQueue.ts`). Clock-out is not queued.
- **Shift reminders** are local notifications scheduled at clock-in.
  - "Still working?" fires at 12 h.
  - Auto clock-out happens at `company_settings.max_shift_hours`, which defaults to 23.
- **Release records:** `UpdateRequiredBanner` compares the installed version against `app_releases`. Always record releases, because stale records mislead crews.
- **Native vs OTA:**
  - A native change (dependency, plugin, permissions, runtime bump) cannot ship as an OTA. It needs a build on both platforms.
  - The Sentry DSN ships only with a version bump and a build.
- **Secrets:** never commit `.env` and never print its values. The env var names are `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_MAPBOX_TOKEN`.
