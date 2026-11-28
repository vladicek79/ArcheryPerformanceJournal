export const APP_NAME = 'Archery Performance Journal';
export const APP_ID = 'archery-performance-journal';
export const SCHEMA_VERSION = 12;
// Stamped by the deploy workflow (unstamped, in local development, they keep the placeholder text):
//   APP_VERSION   major.minor from package.json, then the number of commits on main (first parent
//                 only, so it goes up by one with every merge): '0.1.158'. The test build carries
//                 the version of the newest main it contains, plus '-test.N' when it has code main
//                 does not: '0.1.158-test.7'
//   APP_COMMIT    the short commit SHA the build was made from, for tracing a bug back to the code
//   APP_BUILT_AT  when the build was made (ISO time)
export const APP_VERSION = '0.1.222';
export const APP_COMMIT = '4b75d80';
export const APP_BUILT_AT = '2026-11-28T16:40:39Z';

/**
 * The version as the archer reads it: 'Version 0.1.158 · 19 Nov 2026', or 'Version dev' for an
 * unstamped local build. `long` adds the commit and the environment, for Settings › Storage & app.
 */
export function versionLabel(
  { version = APP_VERSION, commit = APP_COMMIT, builtAt = APP_BUILT_AT, env = APP_ENV } = {},
  { long = false } = {},
) {
  const stamped = (v) => v && !v.startsWith('__');
  if (!stamped(version)) return long ? `Version dev · ${env} environment` : 'Version dev';
  const time = stamped(builtAt) ? new Date(builtAt) : null;
  const date = time && !Number.isNaN(time.getTime()) ? time.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const parts = [`Version ${version}`, date];
  if (long) parts.push(stamped(commit) ? `build ${commit}` : null, `${env} environment`);
  return parts.filter(Boolean).join(' · ');
}
export const BACKUP_REMINDER_DAYS = 30;
// deleted sessions stay in Recently deleted (History) this long before they are removed for good
export const TRASH_DAYS = 7;

// Environment, stamped by the deploy workflow: 'prod' (main) or 'test' (main-test, its own site
// ArcheryPerformanceJournalTest).
// Unstamped (local development) it still contains the placeholder text and counts as 'dev'.
const STAMPED_ENV = 'prod';
export const APP_ENV = STAMPED_ENV.includes('APP_ENV') ? 'dev' : STAMPED_ENV;

// Test and production share the browser origin (vladicek79.github.io), so the test build keeps
// its data under its own key and never sees the real journal. Local dev uses the normal key.
export const STORAGE_KEY = APP_ENV === 'test' ? 'apj-test.v1' : 'apj.v1';

// ---------------------------------------------------------------- Support (optional)
// The page where people can tip the author (Ko-fi, Buy Me a Coffee, PayPal.Me). Empty = no support card
// in Settings. The landing page (public/welcome/index.html) has its own copy of the link.
export const SUPPORT_URL = 'https://ko-fi.com/archeryjournal';
// PayPal.Me name (the part after paypal.me/), for one-tap tips with the amount filled in. Empty = no
// PayPal buttons; the Ko-fi link above stays as the other way to tip.
export const PAYPAL_ME = 'archeryjournalapp';
// The tip amounts offered as buttons, in euros.
export const TIP_AMOUNTS = [3, 5, 10];

// ---------------------------------------------------------------- Google Drive sync (optional)
// OAuth client ID of type "Web application" from Google Cloud (public, no secret). Empty = sync hidden.
// Setup steps: specs/google-drive-sync/google-setup.md
export const GOOGLE_CLIENT_ID = '677092701785-vp023rq09c6j7l3rh4m64cfl012b1c1l.apps.googleusercontent.com';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
// One file in the hidden app-only Drive folder; test and dev use their own file.
export const DRIVE_FILE_NAME = APP_ENV === 'prod' ? 'archery-journal.json' : `archery-journal-${APP_ENV}.json`;
export const SYNC_DEBOUNCE_MS = 15000;
export const SYNC_TOMBSTONE_RETENTION_DAYS = 180;
