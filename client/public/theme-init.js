// Runs before first paint (external file so the strict CSP still applies): resolve the theme to avoid a flash.
(function () {
  var stored = null;
  try { stored = window.localStorage.getItem('ymt.theme'); } catch (error) { stored = null; } // storage can be blocked
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var resolved = stored === 'light' || stored === 'dark' ? stored : (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', resolved);
})();
