// Applies the light / dark theme chosen in Settings before the first paint, so the page does not
// flash in the other theme while the app loads. A classic (non-module) script, loaded in <head>;
// main.js writes the key and applies the theme again once the settings are read.
// The key matches STORAGE_KEY in config.js: the test build (served under /test/) has its own.
(function () {
  try {
    var test = /\/test\//.test(new URL(document.currentScript.src).pathname);
    var theme = localStorage.getItem((test ? 'apj-test.v1' : 'apj.v1') + '.theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  } catch {
    // storage blocked: the system theme is used until the app applies the setting
  }
})();
