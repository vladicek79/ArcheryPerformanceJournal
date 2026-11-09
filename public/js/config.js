export const APP_NAME = 'Archery Performance Journal';
export const APP_ID = 'archery-performance-journal';
export const SCHEMA_VERSION = 2;
export const APP_VERSION = '__APP_VERSION__';
export const BACKUP_REMINDER_DAYS = 30;

// Environment, stamped by the deploy workflow: 'prod' (main) or 'test' (main-test, served under /test/).
// Unstamped (local development) it still contains the placeholder text and counts as 'dev'.
const STAMPED_ENV = '__APP_ENV__';
export const APP_ENV = STAMPED_ENV.includes('APP_ENV') ? 'dev' : STAMPED_ENV;

// Test and production share the browser origin (vladicek79.github.io), so the test build keeps
// its data under its own key and never sees the real journal. Local dev uses the normal key.
export const STORAGE_KEY = APP_ENV === 'test' ? 'apj-test.v1' : 'apj.v1';

// ---------------------------------------------------------------- Google Drive sync (optional)
// OAuth client ID of type "Web application" from Google Cloud (public, no secret). Empty = sync hidden.
// Setup steps: specs/google-drive-sync/google-setup.md
export const GOOGLE_CLIENT_ID = '677092701785-vp023rq09c6j7l3rh4m64cfl012b1c1l.apps.googleusercontent.com';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
// One file in the hidden app-only Drive folder; test and dev use their own file.
export const DRIVE_FILE_NAME = APP_ENV === 'prod' ? 'archery-journal.json' : `archery-journal-${APP_ENV}.json`;
export const SYNC_DEBOUNCE_MS = 15000;
export const SYNC_TOMBSTONE_RETENTION_DAYS = 180;
