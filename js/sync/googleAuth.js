// Google sign-in for a static site: OAuth 2.0 implicit (token) flow by full-page redirect.
// No Google script is loaded. The access token lasts about an hour; there is no refresh token,
// so an expired token is renewed by redirecting again with prompt=none (silent when possible).
// `scope` is a string, or a function giving the scopes to ask for now (extra ones, such as Google
// Photos, are added once the user has allowed them); the scopes Google granted are remembered.

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const EXPIRY_MARGIN_MS = 60 * 1000;

export function createGoogleAuth({ clientId, scope, keyPrefix, storage = globalThis.localStorage, loc = globalThis.location, now = () => Date.now() }) {
  const K = {
    token: `${keyPrefix}.google.token`, // { accessToken, expiresAt }
    signedIn: `${keyPrefix}.google.signedIn`, // '1' once the user connected Google on this device
    pending: `${keyPrefix}.google.pending`, // { state, returnHash, silent } during a redirect
    email: `${keyPrefix}.google.email`,
    scopes: `${keyPrefix}.google.scopes`, // the scopes Google granted, space-separated
  };

  const read = (k) => {
    try {
      return storage.getItem(k);
    } catch {
      return null;
    }
  };
  const write = (k, v) => {
    try {
      if (v == null) storage.removeItem(k);
      else storage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  };

  const redirectUri = () => `${loc.origin}${loc.pathname}`;
  const scopeNow = () => (typeof scope === 'function' ? scope() : scope);

  return {
    configured: !!clientId,

    isSignedIn: () => read(K.signedIn) === '1',

    email: () => read(K.email),
    setEmail: (e) => write(K.email, e || null),

    /** Whether Google granted `s` (as far as this device knows). */
    hasScope: (s) => (read(K.scopes) || '').split(' ').includes(s),

    /** Forget that `s` was granted (Google answered that it is not). */
    forgetScope(s) {
      write(K.scopes, (read(K.scopes) || '').split(' ').filter((x) => x && x !== s).join(' ') || null);
    },

    /** A valid access token, or null when missing or about to expire. */
    getToken() {
      try {
        const t = JSON.parse(read(K.token) || 'null');
        return t && t.expiresAt - EXPIRY_MARGIN_MS > now() ? t.accessToken : null;
      } catch {
        return null;
      }
    },

    /**
     * Leave the app for Google's sign-in page. `silent` asks Google not to show any screen.
     * `extraScopes` are asked for on top of the usual ones (e.g. Google Photos, when it is switched on).
     */
    signIn({ silent = false, extraScopes = [] } = {}) {
      const state = randomState();
      write(K.pending, JSON.stringify({ state, returnHash: loc.hash || '#/settings', silent }));
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri(),
        response_type: 'token',
        scope: [...new Set([...scopeNow().split(' '), ...extraScopes])].filter(Boolean).join(' '),
        state,
        include_granted_scopes: 'true',
        prompt: silent ? 'none' : 'select_account',
      });
      loc.assign(`${AUTH_ENDPOINT}?${params}`);
    },

    /**
     * Call at start-up, before the hash router: picks up Google's answer from the URL fragment,
     * restores the app route and returns { kind: 'none' | 'signed-in' | 'error', error, silent }.
     */
    consumeRedirect(replaceHash) {
      const hash = loc.hash || '';
      if (!/(^|[#&])(access_token|error)=/.test(hash)) return { kind: 'none' };
      const p = new URLSearchParams(hash.replace(/^#/, ''));
      let pending = null;
      try {
        pending = JSON.parse(read(K.pending) || 'null');
      } catch {
        pending = null;
      }
      write(K.pending, null);
      replaceHash(pending?.returnHash || '#/settings');
      if (!pending || p.get('state') !== pending.state) return { kind: 'error', error: 'state_mismatch', silent: !!pending?.silent };
      if (p.get('error')) return { kind: 'error', error: p.get('error'), silent: pending.silent };
      const expiresIn = Number(p.get('expires_in') || 3600);
      write(K.token, JSON.stringify({ accessToken: p.get('access_token'), expiresAt: now() + expiresIn * 1000 }));
      write(K.signedIn, '1');
      // Google says which scopes it granted (all of them, with include_granted_scopes)
      if (p.get('scope') != null) write(K.scopes, p.get('scope'));
      return { kind: 'signed-in', silent: pending.silent };
    },

    /** Forget the token and stop syncing on this device. Local journal data is kept. */
    signOut() {
      write(K.token, null);
      write(K.signedIn, null);
      write(K.email, null);
      write(K.scopes, null);
      write(K.pending, null);
    },

    /** Drop only the token (e.g. after Drive answered 401). */
    dropToken() {
      write(K.token, null);
    },
  };
}

function randomState() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
