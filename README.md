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
| **Log** | New session (distance, face, arrows/end with smart defaults) → arrow-by-arrow logging. Score by tapping the target face or the keypad, then grade M and S in the bottom sheet (3 taps per arrow). Let-downs / correct let-downs and a note per end. The active session is saved on every tap and resumes after a reload. |
| **History** | Training log list → session detail: Total, Avg arrow, 10s (X), Avg M, Avg S, M1–2 %, *avg arrow by mental grade*, and the ends table (`Date · End · Arrows · EndScore · Grade M · Grade S · Let-downs · Correct LD · Note`). |
| **Gear** | Current equipment setup (bow, arrows, string, tuning, stabilisers & accessories) and named setup snapshots. A new session records the current gear and snapshot. |
| **Sights** | Sight marks per distance (shown as a pill on the active session) and the competition log. |
| **Grades** (header) | The M/S grading rubric. |
| **Settings** (header gear icon) | Ask-for-grades toggle, default input, accent colour, **backup export / import (merge or replace, with undo)**, storage diagnostics. |

## Code layout

```
public/                 deployed as-is (no build step)
  js/core/              router, in-memory UI state, DOM builder
  js/storage/           repository (single JSON document), localStorage adapter, migrations
  js/backup/            export (share sheet / download) and import parsing
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
