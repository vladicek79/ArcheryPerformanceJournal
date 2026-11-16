// Hash router (#/name/param). Works on static hosting without server rewrites.

export function parseHash(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || 'home', params: parts.slice(1) };
}

export function createRouter(onChange) {
  const handler = () => onChange(parseHash(location.hash));
  return {
    start() {
      window.addEventListener('hashchange', handler);
      handler();
    },
    current: () => parseHash(location.hash),
    /**
     * Go to `#/path`. `replace`: take the place of the current page in the browser history instead of
     * adding a step, so the phone's Back does not return to it (a page that is finished with, such as
     * a session just saved, discarded or deleted).
     */
    navigate(path, { replace = false } = {}) {
      const target = `#/${path}`;
      if (location.hash === target) handler();
      else if (replace) location.replace(`${location.pathname}${location.search}${target}`);
      else location.hash = target;
    },
  };
}
