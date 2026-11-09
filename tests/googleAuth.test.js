import { describe, it, expect } from 'vitest';
import { createGoogleAuth } from '../public/js/sync/googleAuth.js';

function fakeEnv(hash = '#/log') {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  const loc = { origin: 'https://example.github.io', pathname: '/app/', hash, assigned: null, assign(u) { this.assigned = u; } };
  let t = 1_000_000;
  const auth = createGoogleAuth({ clientId: 'cid', scope: 'drive.appdata', keyPrefix: 'k', storage, loc, now: () => t });
  return { auth, loc, tick: (ms) => (t += ms) };
}

describe('Google sign-in redirect', () => {
  it('builds the authorization request and accepts the token on return', () => {
    const { auth, loc, tick } = fakeEnv('#/settings');
    auth.signIn();
    const url = new URL(loc.assigned);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.github.io/app/');
    expect(url.searchParams.get('response_type')).toBe('token');
    const state = url.searchParams.get('state');

    loc.hash = `#access_token=abc&token_type=Bearer&expires_in=3600&state=${state}`;
    let restored = null;
    const res = auth.consumeRedirect((h) => (restored = h));
    expect(res.kind).toBe('signed-in');
    expect(restored).toBe('#/settings');
    expect(auth.isSignedIn()).toBe(true);
    expect(auth.getToken()).toBe('abc');
    tick(3600 * 1000);
    expect(auth.getToken()).toBeNull(); // expired
    expect(auth.isSignedIn()).toBe(true); // still connected; renewed silently on next start
  });

  it('rejects an answer with a wrong state', () => {
    const { auth, loc } = fakeEnv();
    auth.signIn();
    loc.hash = '#access_token=abc&expires_in=3600&state=forged';
    expect(auth.consumeRedirect(() => {})).toMatchObject({ kind: 'error', error: 'state_mismatch' });
    expect(auth.getToken()).toBeNull();
  });

  it('reports a failed silent renewal so the app does not loop', () => {
    const { auth, loc } = fakeEnv();
    auth.signIn({ silent: true });
    expect(new URL(loc.assigned).searchParams.get('prompt')).toBe('none');
    const state = new URL(loc.assigned).searchParams.get('state');
    loc.hash = `#error=interaction_required&state=${state}`;
    expect(auth.consumeRedirect(() => {})).toEqual({ kind: 'error', error: 'interaction_required', silent: true });
  });

  it('ignores normal app hashes and signs out cleanly', () => {
    const { auth, loc } = fakeEnv('#/history/abc');
    expect(auth.consumeRedirect(() => {})).toEqual({ kind: 'none' });
    auth.signIn();
    const state = new URL(loc.assigned).searchParams.get('state');
    loc.hash = `#access_token=x&expires_in=3600&state=${state}`;
    auth.consumeRedirect(() => {});
    auth.signOut();
    expect(auth.isSignedIn()).toBe(false);
    expect(auth.getToken()).toBeNull();
  });
});
