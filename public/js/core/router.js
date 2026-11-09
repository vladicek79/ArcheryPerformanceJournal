// Hash router (#/name/param). Works on static hosting without server rewrites.

export function parseHash(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || 'new', params: parts.slice(1) };
}

export function createRouter(onChange) {
  const handler = () => onChange(parseHash(location.hash));
  return {
    start() {
      window.addEventListener('hashchange', handler);
      handler();
    },
    current: () => parseHash(location.hash),
    navigate(path) {
      const target = `#/${path}`;
      if (location.hash === target) handler();
      else location.hash = target;
    },
  };
}
