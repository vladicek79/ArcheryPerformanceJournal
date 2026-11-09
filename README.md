# Archery Performance Journal

A phone-first PWA for an Olympic recurve archer. It logs training arrow by arrow and grades every shot on process — **mental program (M)** and **shooting cycle (S)** — following the *With Winning in Mind* approach: measure process quality, not only score.

- **Platform:** [ARCHITECTURE.md](ARCHITECTURE.md) — static files, no backend, data only on the device, offline, installable.
- **Features:** [archery-journal-handoff/HANDOFF.md](archery-journal-handoff/HANDOFF.md) and the reference prototype.

## Run locally

```bash
npm install
npm start          # serves ./public on http://localhost:8080
npm test           # Vitest: scoring, statistics, session flow, repository, backup
npm run lint
```

To test on an Android phone: connect over USB, open `chrome://inspect` on the PC, enable **Port forwarding** `8080 → localhost:8080`, then open `http://localhost:8080` on the phone.

## What's in the app

| Tab | Purpose |
|---|---|
| **Log** | New session (distance, face, arrows/end with smart defaults) → arrow-by-arrow logging. Touch the target face (a magnifier shows the exact spot; release to score) or tap a quick key (X 10 9 8 7 6 M), then tap the M and S grade rows under the target (3 taps per arrow). Tap an arrow to select it, then touch the target or a key to re-score it and tap grades to regrade it; tap it again to deselect. Let-downs / correct let-downs and a note per end. The active session is saved on every tap and resumes after a reload. |
| **Dashboard** | Opens the new-session setup (distance, face, arrows/end), also while a session is in progress (Continue, or start a new one — the running session is then finished or, with no saved ends, discarded). |
| **History** | Training log list → session detail: Total, Avg arrow, 10s (X), Avg M, Avg S, M1–2 %, *avg arrow by mental grade*, and the ends table (`Date · End · Arrows · EndScore · Grade M · Grade S · Let-downs · Correct LD · Note`). |
| **Gear** | Current equipment setup (bow, arrows, string, tuning, stabilisers & accessories) and named setup snapshots. A new session records the current gear and snapshot. |
| **Sights** | Sight marks per distance (shown as a pill on the active session) and the competition log. |
| **Grades** (header) | The M/S grading rubric. |
| **Settings** (header gear icon) | Accent colour, **backup export / import (merge or replace, with undo)**, storage diagnostics. |

## Environments

| Branch | URL | Notes |
|---|---|---|
| `main` | https://vladicek79.github.io/ArcheryPerformanceJournal/ | production |
| `main-test` | https://vladicek79.github.io/ArcheryPerformanceJournal/test/ | test build: **TEST** badge, separate data and Drive file |

Push to `main-test` to try a change on the phone before merging it into `main`. Every deploy republishes both from their branch tips.

## Google Drive sync (optional)

Settings → **Sync with Google Drive** keeps the journal in a hidden app-only folder of your own Google Drive and syncs it between devices (on start, after changes, after finishing a session, when back online, and on *Sync now*). It needs a one-time Google Cloud setup: [specs/google-drive-sync/google-setup.md](specs/google-drive-sync/google-setup.md). Until `GOOGLE_CLIENT_ID` is set in `public/js/config.js`, the card says sync is not set up.

## Code layout

```
public/                 deployed as-is (no build step)
  js/core/              router, in-memory UI state, DOM builder
  js/storage/           repository (single JSON document), localStorage adapter, migrations
  js/backup/            export (share sheet / download) and import parsing
  js/sync/              Google Drive sync: sign-in redirect, Drive client, merge, sync service, controller
  js/pwa/               service worker registration, update prompt, storage persistence
  js/app/               app code: collections + validators, scoring, stats, session logic, views
  sw.js                 cache-first app shell (network-first while unstamped in local dev)
tests/                  Vitest unit tests
scripts/make-icons.mjs  regenerates the PNG icons
.github/workflows/      CI (lint + tests) and GitHub Pages deploy (stamps __APP_VERSION__)
```

## Decisions where the two source documents differ

- **Stack:** HANDOFF suggests Vite + React + TS + Dexie; ARCHITECTURE prescribes vanilla ES modules with no build step. The platform document wins; the handoff marks its stack as a suggestion.
- **Storage:** HANDOFF asks for IndexedDB; ARCHITECTURE (D2) uses one `localStorage` document behind an adapter, with IndexedDB as the upgrade path. Data volume is small, so `localStorage` is used; swapping in an IndexedDB adapter does not change app code.
- **Fonts:** HANDOFF names Space Grotesk / Inter from Google Fonts; ARCHITECTURE forbids runtime CDNs. The font stack lists them first and falls back to system fonts. Bundle the font files into `public/` if the exact look is wanted.

## Backups

Backups are plain JSON with personal data. Keep them private and **never commit them** (`*-backup-*.json` is git-ignored).
