# Google Drive sync — one-time Google Cloud setup

Takes about 10 minutes. Everything here is free. You need the Google account you will sync with.

## 1. Project and Drive API

1. Open <https://console.cloud.google.com/> and create a project, e.g. **Archery Journal**.
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.

## 2. OAuth consent screen

1. **APIs & Services → OAuth consent screen** (or *Google Auth Platform → Branding / Audience*).
2. User type **External**; app name *Archery Journal*; your e-mail as support and developer contact.
3. **Scopes / Data access**: add `.../auth/drive.appdata` ("See, create, and delete its own configuration data in your Google Drive").
4. **Audience / Test users**: add your own Google account. Leave the app in **Testing** status (no verification needed; Google may show an "unverified app" notice on first sign-in — continue).

## 3. OAuth client ID

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**.
2. **Authorized JavaScript origins**:
   - `https://vladicek79.github.io`
   - `http://localhost:8080` (local development)
3. **Authorized redirect URIs** (must match exactly, including the trailing slash):
   - `https://vladicek79.github.io/ArcheryPerformanceJournal/` (production)
   - `https://vladicek79.github.io/ArcheryPerformanceJournal/test/` (test environment)
   - `http://localhost:8080/` (local development)
4. Create, then copy the **Client ID** (`…apps.googleusercontent.com`). There is no secret to keep — the ID is public.

## 4. Put the client ID in the app

Set `GOOGLE_CLIENT_ID` in `public/js/config.js` to the copied ID and deploy (test first via `main-test`).

## 5. Try it

1. Open the app → Dashboard → Settings (gear icon) → **Sync with Google Drive** → **Continue with Google**.
2. Choose your account and allow access. You return to Settings showing *Connected as …* and *Last synced …*.
3. On a second device, do the same: the journal appears there.

Each environment keeps its own Drive file in the hidden app folder (`archery-journal.json` for production, `archery-journal-test.json` for test, `archery-journal-dev.json` for local development), so testing never touches the real journal.
