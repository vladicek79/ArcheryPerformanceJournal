# Spec: Sync the journal across devices via Google Drive

**Status:** Implemented on branch `feature/google-drive-sync` (uncommitted) · **Date:** 2026-11-09 · **Owner:** Vladimír Gál · Private project, tracked locally (no issue tracker)

## Problem Statement

The Archery Performance Journal keeps all data in the browser storage of one device. An archer who logs training on the phone at the range cannot see or continue that data on a tablet or computer, and has to move it by hand with *Export backup* and *Import → Merge*. That is slow, easy to forget, and a lost or reset phone loses everything since the last manual backup.

## Solution

An optional **Continue with Google** sign-in in Settings. Once signed in on a device, the app keeps a copy of the whole journal in a hidden, app-only folder in the archer's own Google Drive (`appDataFolder`) and syncs with it automatically: when the app opens, when a session is finished, after other changes (debounced), and on **Sync now**. Every device keeps its full local copy, so the app keeps working offline at the range; changes made offline are synced the next time the device is online. Records are merged per record (newest edit wins), and deletions are carried across devices. No server of our own is involved; the app talks only to Google's sign-in page and the Google Drive API. Signing out stops syncing and leaves local data in place.

## User Stories

1. As an archer, I want to sign in with my Google account from Settings, so that my journal can be stored in my own Google Drive.
2. As an archer, I want sign-in to be optional, so that the app keeps working exactly as today if I never sign in.
3. As an archer, I want the app to ask only for access to its own hidden app data in Drive, so that it cannot read or change my other Drive files.
4. As an archer, I want the journal file to be invisible in my normal Drive file list, so that it does not clutter my Drive.
5. As an archer, I want my data synced automatically when I open the app, so that I see the latest sessions from my other devices.
6. As an archer, I want my data synced automatically when I finish a session, so that it is safe in Drive right after training.
7. As an archer, I want other changes (gear, sight marks, competitions, edits to past sessions) synced shortly after I make them, so that I don't have to remember to sync.
8. As an archer, I want a **Sync now** button, so that I can force a sync before switching devices.
9. As an archer, I want to keep logging arrows with no signal at the range, so that sync never blocks scoring or grading.
10. As an archer, I want changes made offline to sync automatically once I am back online, so that nothing is lost.
11. As an archer, I want to see when the last successful sync happened and whether it is in progress or failed, so that I know whether my devices are up to date.
12. As an archer, I want a clear message when a sync fails (offline, sign-in expired, Drive error), so that I know what to do.
13. As an archer, I want sessions I logged on the phone to appear on my tablet after both have synced, so that I can review them on a bigger screen.
14. As an archer, I want gear setups, gear snapshots, sight marks and competitions to sync too, so that every device has the same equipment and sight data.
15. As an archer, I want a session I delete on one device to stay deleted on the others, so that deleted data does not come back.
16. As an archer, I want a gear snapshot, sight mark or competition I delete on one device to stay deleted on the others, so that cleanup sticks.
17. As an archer, I want edits to the same record on two devices to resolve to the most recent edit, so that sync never fails because of a conflict.
18. As an archer, I want edits to different records on two devices to both survive, so that working on two devices loses nothing.
19. As an archer, I want my first sign-in on a device that already has data to merge that data with what is in Drive, so that neither side is overwritten.
20. As an archer, I want my first sign-in on a new, empty device to download everything from Drive, so that setting up a second device is one step.
21. As an archer, I want the session I am currently logging (the active session) to sync like any other record, so that I can continue it on another device if needed.
22. As an archer, I want app settings that are personal to a device (such as the accent colour) to stay per device, while the gear setup syncs, so that each device can look the way I like.
23. As an archer, I want to sign out from Settings, so that I can stop syncing on a shared or old device.
24. As an archer, I want signing out to keep the data on the device, so that I don't lose anything by signing out.
25. As an archer, I want to stay signed in between app launches, so that I don't have to sign in every time I open the app.
26. As an archer, I want the app to renew Google access quietly when it expires, and to show a quick sign-in screen only when Google requires it, so that sync stays mostly invisible.
27. As an archer, I want the manual *Export backup* and *Import* to keep working, so that I still have an offline backup independent of Google.
28. As an archer, I want the app to refuse a Drive journal written by a newer app version and tell me to update, so that an old app never corrupts newer data.
29. As an archer, I want an older Drive journal to be upgraded by the same migrations as local data, so that sync keeps working after app updates.
30. As an archer, I want sync to never run in the middle of my tapping (no blocking spinners on the Log screen), so that logging stays fast.
31. As an archer, I want the app to keep working if Google is unreachable or blocked, so that sync problems never stop training.
32. As an archer, I want no analytics or third-party scripts to be added for sync, so that my data still goes nowhere except my own Drive.
33. As the developer, I want the Google OAuth client ID in the app config, so that it can be set once for the GitHub Pages address.
34. As the developer, I want step-by-step instructions to create the Google Cloud project and OAuth client, so that the one-time setup takes minutes.

## Implementation Decisions

**Architecture change.** ARCHITECTURE.md is updated: "no outbound requests" becomes "no outbound requests except optional sync to the user's own Google Drive"; decision log entries D2/D4 get a new entry recording optional Drive sync. CSP gains `connect-src https://www.googleapis.com` only. No Google JavaScript library is loaded (`script-src 'self'` stays).

**Sign-in: OAuth 2.0 implicit (token) flow by full-page redirect, no SDK.**
- Settings → *Continue with Google* navigates to Google's authorization endpoint with `response_type=token`, the client ID from config, scope `https://www.googleapis.com/auth/drive.appdata` (plus `openid email` to show which account is connected), a random `state`, and `redirect_uri` = the app's own URL.
- On return, the app reads `access_token`, `expires_in` and `state` from the URL fragment before the hash router starts, checks `state`, stores the token and expiry in session-scoped storage, and clears the fragment.
- Static hosting cannot keep a refresh token. On expiry the app redirects again with `prompt=none` (silent); only when Google answers `interaction_required` or `login_required` does it show the normal sign-in. Redirects never happen while the Log screen has an unsaved interaction; sync just waits until the next app open or **Sync now**.
- A "signed in" flag and the account e-mail are kept in local settings (per device, not synced).

**Google Cloud setup (one-time, by the owner).** A Google Cloud project with the Drive API enabled; OAuth consent screen in *Testing* status with the owner as test user; an OAuth client of type *Web application* with authorized JavaScript origin `https://vladicek79.github.io` and redirect URI `https://vladicek79.github.io/ArcheryPerformanceJournal/` (plus `http://localhost:8080/` for development). The client ID is public and goes into the app config; there is no client secret.

**Drive storage.** One JSON file named after the app (for example `archery-journal.json`) in `appDataFolder`, holding the same document envelope as local storage and backups (`app`, `schemaVersion`, `updatedAt`, `meta`, `settings`, `collections`). Read with `files.list` (spaces=appDataFolder) + `files.get?alt=media`; written with multipart create or `files.update` (uploadType=media). Writes use the file's version/ETag as a precondition so that a concurrent write from another device is detected and the sync retries (read → merge → write).

**New module: Drive store (adapter).** A small interface the sync service depends on: `read()` → `{ doc, version }` or `null` when no file exists, and `write(doc, expectedVersion)` → new version, failing with a "conflict" error when the version changed. The real implementation calls the Drive REST API with the access token. Tests use an in-memory fake with the same interface.

**New module: Sync service.** Deep module with a narrow interface: `sync()` runs one full cycle and returns a result (`{ status, pulled, pushed, at }` or an error kind: `offline`, `auth`, `newer-version`, `drive`). One cycle:
1. Read the remote document (if any) and migrate it with the existing migrations; refuse a newer schema.
2. Merge remote into local (see merge rules) and save locally in one atomic write.
3. If the merged result differs from what was read remotely, write it to Drive with the version precondition; on a conflict, repeat from step 1 (bounded retries).
4. Record `lastSyncAt` in local meta.
Only one cycle runs at a time; requests that arrive during a cycle are coalesced into one follow-up cycle.

**Triggers** (in the app shell, not in views): after app start once signed in; when a session is finished; debounced (~10–30 s) after any repository change; on the browser `online` event; on **Sync now**. All are skipped when signed out or offline.

**Merge rules** (extends the existing merge-import logic in the repository):
- Records are matched by `id` per collection; the record with the newer `updatedAt` wins as a whole (no field-level merge).
- **Deletions become tombstones.** `remove()` no longer drops a record outright: it keeps `{ id, deletedAt, updatedAt }` (a tombstone). A tombstone beats any version of the record with an older `updatedAt`. `list()`/`get()` hide tombstones from views. Tombstones older than a retention period (for example 180 days) are purged during sync.
- Synced settings: only the gear setup (`gear`, `activeSnapshotId`), `lastSetup` and `sightsSeeded`, merged as one unit by a `settingsUpdatedAt` timestamp. Device-local settings (accent colour, sign-in state) never leave the device.
- Validation runs on every merged record exactly as on import; an invalid remote record is skipped and reported, never written locally.

**Schema change.** `SCHEMA_VERSION` 1 → 2 with a migration that adds `settingsUpdatedAt` and an empty tombstone convention; existing records are unchanged. Old backups stay importable through the migration chain.

**Clock skew.** Last-write-wins relies on device clocks. `updatedAt` is assigned by the repository; the sync service also never lets a device write a record with `updatedAt` more than a few minutes in the future (it clamps to "now" on that device) to limit damage from a wrong clock.

**Settings UI.** A new *Sync* card in Settings: *Continue with Google* (signed out) or the account e-mail with *Sync now* and *Sign out* (signed in), plus a status line (*Synced 2 min ago*, *Syncing…*, *Offline — will sync later*, *Sign-in expired — tap to reconnect*, *Drive error*). No sync UI on the Log screen beyond, at most, a small status dot on the Dashboard header.

**Service worker.** Unchanged in role: it never touches user data and never caches Google API responses (cross-origin requests are already passed through).

## Testing Decisions

- **One test seam: the sync service**, exercised with Vitest against an in-memory fake Drive store and the existing in-memory storage adapter + repository (two "devices" = two repositories sharing one fake Drive). Tests assert only observable outcomes: what each device's repository lists after `sync()`, what the fake Drive holds, and the returned status. They never inspect internal steps.
- Scenarios to cover: first sync with empty Drive (upload); first sync on an empty device (download); both sides have different records (union); same record edited on both (newer `updatedAt` wins); deletion on one device propagates and is not resurrected; a tombstone older than an edit loses; concurrent write conflict (fake store changes version between read and write) → retry succeeds; remote document with a newer schema → `newer-version`, local data untouched; remote document with an older schema → migrated; invalid remote record skipped; device-local settings not synced, gear settings synced; offline/auth errors from the store → reported, local data untouched; tombstone purge after retention.
- Repository changes (tombstones in `remove`, hidden from `list`/`get`, merge honouring tombstones) are covered through the same seam plus updates to the existing repository tests where their expectations change.
- Migration 1 → 2 gets a unit test next to the existing migration tests.
- **Prior art:** the merge-import, replace/undo and migration tests in the existing repository and backup test files use the same in-memory adapter and fixed clock; the new tests follow that style.
- **Manual checks on the phone and a second device:** sign-in redirect and return, silent re-auth after expiry, sign-out, offline logging then reconnect, two-device round trip, deletion propagation, and that the Drive file is not visible in the normal Drive UI.

## Out of Scope

- Real-time or live collaboration (changes appear on the next sync, not instantly).
- Field-level or per-arrow merging inside one session; the newer copy of a whole session wins.
- Sharing data with a coach or other users; multiple archers per account.
- Any backend, server-side storage or account system other than the user's own Google Drive.
- Other providers (Dropbox, OneDrive, iCloud) and Google Sheets export.
- Moving local storage to IndexedDB (stays a separate upgrade per ARCHITECTURE.md §6.7).
- Publishing the OAuth app for public users (it stays in Google's *Testing* mode for the owner).
- Encrypting the Drive file on top of Google's own protection.

## Further Notes

- **Session length:** without a refresh token, Google access lasts about an hour; silent re-auth usually works without any screen, but occasional sign-in screens are expected. If this proves annoying, a later option is Google Identity Services' token client (requires loading Google's script and relaxing `script-src`).
- **Testing-mode limits:** fine for a personal app; Google may show an "unverified app" warning on first consent.
- **Open points to confirm during implementation:** the debounce interval for automatic sync; the tombstone retention period; whether the Dashboard should show a small sync status indicator; whether *Sync now* should also be offered on the History screen.
- **Rollout:** ship behind the Settings card only; until the owner signs in, behaviour is identical to today. Recommend one manual *Export backup* before the first sign-in.

## Decisions made during implementation

- **Synced settings are only the gear setup** (`gear`, `activeSnapshotId`). `lastSetup` and `sightsSeeded` stay per device: they change on their own (starting a session, first launch) and would make a fresh device's settings look newer than the real gear setup.
- **Default sight marks get fixed ids** (`seed-18`, …) so the same default row on two devices is one record; after a pull, untouched default rows whose distance another row already covers are removed.
- **Token storage:** the access token is kept in local storage with its expiry (not session storage), so an installed PWA reopened within the hour does not redirect again.
- **Silent renewal happens only at app start**; an expiry during use shows *Sign-in expired* with a *Reconnect Google* button instead of redirecting mid-logging.
- **Account e-mail** comes from Drive's `about` endpoint, so no `openid`/`email` scopes are requested — only `drive.appdata`.
- **Drive v3 has no conditional update**: the file version is re-read just before writing; a change throws a conflict and the cycle retries (up to 3 attempts).
- **Status is shown only in Settings**; status changes re-render only that page, so syncing never disturbs typing on the Log screen.
- **Test environment** (requested alongside): branch `main-test` deploys to `/test/` with its own storage key, cache prefix, Drive file (`archery-journal-test.json`) and a TEST badge.
