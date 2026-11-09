# Local-First PWA – Technical Architecture

**Status:** Pilot · **Date:** 2026-11-09 · **Owner:** Vladimír Gál

The technical foundation for a small personal web app that runs in **mobile Chrome (Android)** as an installable Progressive Web App (PWA). It has no backend, no external APIs and no accounts, and all data stays on the device.

This document covers **only the platform**: hosting and GitHub, storage, offline support, backup and the project skeleton. The app's own features, screens and data fields are defined separately and plug into the extension points described here (§4, §6.4).

---

## 1. Goals and constraints

### Goals
- Runs in mobile Chrome and installs to the home screen (standalone window).
- Works fully **offline** after the first load.
- Persists data locally, with a reliable **backup and restore**.
- Zero running cost and no servers to maintain.
- Deploys automatically on `git push`.

### Constraints

| Constraint | Consequence |
|---|---|
| Target is mobile Chrome on Android | PWA features (manifest, service worker, Web Share API, Storage API) are available |
| No server or database | Data lives in browser storage on the device |
| Small data volume | `localStorage` (~5 MB per origin) is enough; IndexedDB is the upgrade path |
| Data exists only on one device | Export/import is a **required** platform feature |
| Service workers need HTTPS | App is served from a static HTTPS host, never opened as `file://` |
| Browser storage is per origin | The app must keep **one stable URL**; changing it starts with empty storage |

### Out of scope (pilot)
Multi-user use, sync between devices, server-side storage, third-party integrations, and official support for iOS Safari or desktop browsers.

---

## 2. High-level architecture

```
┌────────────────────────── GitHub ───────────────────────────┐
│  repo: main branch ──push──► GitHub Actions                 │
│                               ├─ lint + unit tests          │
│                               └─ deploy ──► GitHub Pages    │
└────────────────────────────────────────────┬────────────────┘
                                             │ HTTPS, static files only
                                             │ (first load + updates)
┌─────────────────── Android phone · Chrome ─▼────────────────┐
│                                                             │
│  Service worker ── app-shell cache ── offline start         │
│                                                             │
│  ┌──────────────── PWA (standalone window) ──────────────┐  │
│  │  App features (defined separately)                    │  │
│  │        │ uses                                         │  │
│  │        ▼                                              │  │
│  │  Platform core: router · state · validation hooks     │  │
│  │        │                                              │  │
│  │        ▼                                              │  │
│  │  Storage repository ──► adapter ──► localStorage      │  │
│  │        │                         (IndexedDB later)    │  │
│  │        ▼                                              │  │
│  │  Backup: export / import JSON ──► Web Share API ──────┼──┼──► Drive · e-mail · Files
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

GitHub Pages serves **code only**. User data never leaves the phone unless the user exports it.

---

## 3. Technology choices

| Area | Choice | Why |
|---|---|---|
| Language | JavaScript, ES modules | Runs in the browser as is; no build step needed |
| UI framework | None by default (vanilla DOM) | Optional later: Preact or Vue with Vite (§10) |
| Routing | Hash router (`#/…`) | Works on static hosting without server rewrites |
| Storage | `localStorage` behind a repository + adapter | Simple and synchronous; swappable for IndexedDB |
| Offline | Service worker, cache-first app shell | Instant start, no network needed |
| Install | Web App Manifest + icons (192, 512, maskable 512) | "Install app" in Chrome, standalone display |
| Backup | JSON file via Web Share API, download as fallback | Native Android share sheet |
| Source control | GitHub repository | Versioning, issues, Actions, Pages in one place |
| CI/CD | GitHub Actions | Tests on every push and PR; deploy from `main` |
| Hosting | GitHub Pages | Free HTTPS hosting, custom domain optional |
| Tests | Vitest (Node) | Unit tests for storage, migrations and backup |
| Lint/format | ESLint + Prettier | Consistent code with no runtime cost |

Dev tooling (Vitest, ESLint, Prettier) uses `package.json` but is **never shipped**. The deployed site is plain static files.

---

## 4. Repository structure

```
<app-name>/
├── .github/
│   └── workflows/
│       ├── ci.yml              # lint + tests on push and PR
│       └── deploy.yml          # deploy /public to GitHub Pages from main
├── public/                     # ← everything deployed, served as site root
│   ├── index.html              # app shell, CSP meta tag
│   ├── manifest.webmanifest
│   ├── sw.js                   # service worker (at root for full scope)
│   ├── icons/
│   ├── css/
│   │   └── base.css            # tokens, light/dark, mobile-first layout
│   └── js/
│       ├── main.js             # bootstrap (§7)
│       ├── config.js           # APP_NAME, STORAGE_KEY, SCHEMA_VERSION, APP_VERSION
│       ├── core/
│       │   ├── router.js       # hash router
│       │   └── state.js        # in-memory state + pub/sub
│       ├── storage/
│       │   ├── repository.js   # public storage API (§6.3)
│       │   ├── localStorageAdapter.js
│       │   └── migrations.js   # schema upgrades (§6.5)
│       ├── backup/
│       │   └── backup.js       # export / import (§8)
│       ├── pwa/
│       │   └── updates.js      # SW registration + "new version" prompt
│       └── app/                # ← APP-SPECIFIC CODE GOES HERE
│           ├── collections.js  # collection names + validators (§6.4)
│           └── views/          # screens
├── tests/
│   ├── repository.test.js
│   ├── migrations.test.js
│   └── backup.test.js
├── package.json                # dev tooling only
├── .gitignore
├── README.md
└── ARCHITECTURE.md
```

**Rule:** platform code lives in `core/`, `storage/`, `backup/` and `pwa/`. App code lives only in `app/` and talks to storage through `repository.js`.

---

## 5. GitHub setup

### 5.1 Repository
- One repository per app. It can be **private**: with a paid plan, GitHub Pages can serve a private repo; on the free plan the repo must be public. App data is never in the repo, so a public repo is acceptable.
- `.gitignore`: `node_modules/`, `coverage/`, `.DS_Store`, `*.local.*`, `backups/`.
- **Never commit exported backup files**; they contain personal data.

### 5.2 Branching
- `main` is the deployed branch and is always releasable.
- Short-lived feature branches (`feature/<topic>`) are merged through pull requests.
- Branch protection on `main`: require the CI check to pass. Reviews are optional for a solo pilot.

### 5.3 CI (`.github/workflows/ci.yml`)
Triggers: `push` and `pull_request`.
1. Check out the code and set up Node LTS.
2. `npm ci`
3. `npm run lint`
4. `npm test`

### 5.4 Deploy (`.github/workflows/deploy.yml`)
Trigger: CI passing on `main` or `main-test`, and manual `workflow_dispatch`. Deployments queue (never cancel a running one).
1. Check out `main` (production) and, if it exists, `main-test` (test).
2. Stamp each: replace `__APP_VERSION__` (short commit SHA) and `__APP_ENV__` (`prod` / `test`) in `sw.js` and `config.js`.
3. Assemble the site: production at the root, test under `/test/` (its manifest renamed *Archery Journal TEST*).
4. Upload with `actions/upload-pages-artifact` and publish with `actions/deploy-pages`.

**Environments:** production `https://<user>.github.io/<repo>/` from `main`; test `https://<user>.github.io/<repo>/test/` from `main-test`. Both share the browser origin, so the test build uses its own storage key (`apj-test.v1`), its own cache prefix and its own Drive file, and shows a **TEST** badge.

Settings: **Repository → Settings → Pages → Source: GitHub Actions**.

### 5.5 URL and origin
- Default URL: `https://<user>.github.io/<app-name>/`. All paths in the app must be **relative** (`./js/main.js`), and the manifest `start_url` and `scope` should be `./`.
- **Pick the URL once.** Storage is tied to the origin, so moving to another domain later means the app starts empty there (users must export and then import).
- Optional custom domain: add a `CNAME` file and DNS record, and enforce HTTPS. Decide before the pilot starts, for the reason above.

---

## 6. Storage

### 6.1 Choice
`localStorage` holds **one JSON document per app** under a single key. One document is atomic to write, trivial to back up and easy to migrate.

### 6.2 Document envelope

```jsonc
// localStorage[STORAGE_KEY]   e.g. "myApp.v1"
{
  "app": "my-app",               // guards against importing another app's backup
  "schemaVersion": 1,
  "updatedAt": "2026-11-09T18:42:10.000Z",
  "meta": {
    "lastBackupAt": null,
    "createdAt": "2026-11-09T18:00:00.000Z"
  },
  "settings": { },               // app-defined key/value settings
  "collections": {               // app-defined collections of records
    "<collectionName>": [ /* Record[] */ ]
  }
}
```

Every record in every collection has these platform fields. The app adds its own fields beside them:

| Field | Type | Set by |
|---|---|---|
| `id` | string (`crypto.randomUUID()`) | repository, on create |
| `createdAt` | ISO datetime | repository, on create |
| `updatedAt` | ISO datetime | repository, on every save |

### 6.3 Repository API (`storage/repository.js`)
The only module that touches persistence. App code never calls `localStorage` directly.

```js
init()                                   // load, migrate, cache in memory
list(collection, { filter, sort })
get(collection, id)
save(collection, record)                 // create or update; runs validator
remove(collection, id)
getSettings() / saveSettings(patch)
exportDocument()                         // → full envelope (object)
importDocument(doc, { mode })            // "replace" | "merge"
subscribe(listener)                      // change notifications for views
```

Behaviour:
- Reads come from an in-memory copy. Each write serialises the whole document and saves it in one `setItem` call.
- Writes are wrapped in `try/catch`. On `QuotaExceededError`, the write is rejected, memory is rolled back and the user is told to export.
- **Merge import:** records are matched by `id`, and the newer `updatedAt` wins. Records that exist on only one side are kept.

### 6.4 Extension point for the app
`app/collections.js` registers what the app stores:

```js
export const collections = {
  items: {
    validate(record) { /* return list of errors, empty if valid */ },
    defaults() { return { /* default field values */ }; },
  },
};
export const defaultSettings = { /* … */ };
```

The repository calls `validate` before every save and on import. No other platform code needs to change for a new app.

### 6.5 Schema migrations
- `config.js` sets `SCHEMA_VERSION`.
- `migrations.js` holds ordered steps `{ from: 1, to: 2, up(doc) { … } }`.
- On `init()` and on import, the document is upgraded step by step to the current version. Old backups always stay importable.
- Before a migration runs, the original document is copied to `STORAGE_KEY + ".pre-v<N>"` as a one-step rollback.
- A document with a **newer** version than the app is refused (the user is told to reload and update).

### 6.6 Persistence protection
- On start-up, call `navigator.storage.persist()`. Chrome normally grants it to installed PWAs, which protects data from automatic eviction.
- Show the result and the usage from `navigator.storage.estimate()` on a settings or diagnostics screen.
- It does **not** protect against the user clearing site data or uninstalling Chrome data. Only backup does (§8).

### 6.7 Upgrade path: IndexedDB
Switch when data contains binary files (photos, GPX), grows past ~2 MB, or needs indexed queries. Write `indexedDbAdapter.js` (Dexie recommended) with the same adapter interface, plus a one-time migration that copies the `localStorage` document across. The repository API and app code stay unchanged.

---

## 7. PWA layer

### 7.1 Manifest (`manifest.webmanifest`)
`name`, `short_name`, `start_url: "./"`, `scope: "./"`, `display: "standalone"`, `background_color`, `theme_color`, and icons 192, 512 and 512 maskable.

### 7.2 Service worker (`sw.js`)
- **Cache name:** `<app-name>-<APP_VERSION>`, stamped at deploy (§5.4).
- **Install:** pre-cache the app-shell file list (HTML, CSS, JS modules, manifest, icons).
- **Fetch:** cache-first for same-origin GET requests, network fallback. No other origins are used.
- **Activate:** delete caches with other versions.
- The service worker **never reads or writes user data**.

### 7.3 Updates (`pwa/updates.js`)
- When a new worker is installed and waiting, show a "New version available – Reload" prompt.
- On confirm, send `SKIP_WAITING` to the worker and reload when control changes.
- Data is untouched by updates; schema changes go through migrations (§6.5).

### 7.4 Bootstrap (`main.js`)
1. Register the service worker.
2. Request persistent storage.
3. `repository.init()` (load, migrate).
4. Start the router and render the first view.
5. Check the backup reminder (§8).

---

## 8. Backup and restore

| | Behaviour |
|---|---|
| **Export** | Build `<app-name>-backup-YYYY-MM-DD.json` from `exportDocument()`. If `navigator.canShare({ files })` returns true, open the Android share sheet (Drive, e-mail, Files); otherwise download the file. Set `meta.lastBackupAt`. |
| **Import** | File picker (`accept="application/json"`), then parse, check `app` matches, run migrations and validators, show a preview (record counts and newest date), then let the user choose **Replace** or **Merge**. Nothing is written before confirmation. |
| **Safety copy** | Before a Replace import, keep the current document in `STORAGE_KEY + ".pre-import"`, with an "Undo last import" action. |
| **Reminder** | If `lastBackupAt` is empty or older than 30 days, the app shows a non-blocking banner. |

Backup files contain personal data in plain JSON. Keep them in private storage, and never commit them to the repository.

---

## 9. Non-functional requirements

| Aspect | Approach |
|---|---|
| **Privacy** | No analytics, no third-party scripts, no fonts or CDNs at runtime. The only outbound requests are the optional sync to the user's own Google Drive (D7): sign-in by redirect to Google and calls to `www.googleapis.com` |
| **Security** | CSP meta tag: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://www.googleapis.com`. User text rendered with `textContent`, never `innerHTML`. Imported data validated before use. |
| **Performance** | Shipped size < 150 KB; start from cache < 1 s on a mid-range phone |
| **Reliability** | Single-document atomic writes, validation on save and import, rollback copies before migrations and imports |
| **Accessibility** | Semantic HTML, labelled controls, tap targets ≥ 48 px, light and dark themes |
| **Compatibility** | Target: current Chrome on Android. Other modern browsers may work but are not tested. |

---

## 10. Development workflow

- **Local server:** `npx serve public` (service workers work on `localhost`).
- **Test on the phone:** connect over USB, open `chrome://inspect` on the PC and use **Port forwarding** (`8080 → localhost:8080`). The phone then loads `http://localhost:8080`, so the service worker and storage behave as in production, and you can use DevTools on the phone page.
- **Unit tests:** `npm test` (Vitest, with a `localStorage` mock) for repository, migrations and backup.
- **Release checklist** (on the phone, after deploy): app installs, starts in airplane mode, update prompt appears, export opens the share sheet, import restores correctly.
- **Optional framework later:** if the app grows, add Vite with Preact or Vue. Vite builds into `dist/`, and `deploy.yml` uploads `dist/` instead of `public/`. Storage, backup and PWA modules carry over unchanged.

---

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| User clears Chrome site data, resets or loses the phone | All data lost | Export/import, 30-day reminder, `storage.persist()` |
| App URL or domain changes | App starts empty at the new origin | Choose the final URL before the pilot; export and import on move |
| Stale app version cached | Old code runs | Version-stamped cache and update prompt |
| Bad migration | Corrupted data | Pre-migration copy, migration unit tests |
| Wrong file imported | Data overwritten | `app` check, validation, preview, pre-import copy and undo |
| `localStorage` quota reached | Saves fail | Error and export prompt; move to IndexedDB (§6.7) |
| Backup file leaked | Personal data exposed | Keep backups in private storage; never in the repo |

---

## 12. Decision log

| # | Decision | Alternatives | Reason |
|---|---|---|---|
| D1 | PWA in mobile Chrome | Native Android app | No store, no native tooling, one codebase |
| D2 | `localStorage`, one JSON document, behind an adapter | IndexedDB (Dexie), SQLite WASM, OPFS | Small data, simplest API and backup; swappable later |
| D3 | Generic collections + app validators | Hard-coded app schema in the platform | Platform reusable for different apps |
| D4 | Manual JSON backup via share sheet | Cloud sync, backend | Meets the "no external API" constraint; user owns the file |
| D5 | GitHub Pages deployed by GitHub Actions | Netlify, Cloudflare Pages, branch-based Pages | Free HTTPS, version stamping and tests before deploy |
| D6 | No build step by default | Vite from day one | Less tooling for the pilot; Vite can be added without touching the platform modules |
| D7 | Optional sync to the user's own Google Drive (`appDataFolder`), OAuth implicit flow by redirect, no Google script; per-record last-write-wins merge with deletion markers; only the gear setup syncs among settings | Firebase/Supabase, server, Google Identity Services script | Multi-device use without a backend; data stays in the user's Drive; CSP keeps `script-src 'self'`. Spec: `specs/google-drive-sync/spec.md` |
| D8 | Test environment from branch `main-test`, published under `/test/` of the same Pages site | Separate repository / Pages site | One Pages site per repo; same origin, so test uses its own storage key, cache prefix and Drive file |
