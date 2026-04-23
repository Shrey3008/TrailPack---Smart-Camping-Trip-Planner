// Single source of truth for backend API base URL.
// Loaded before every other script so window.API_URL is always defined.
(function () {
  if (window.__trailpackConfigLoaded) return;
  window.__trailpackConfigLoaded = true;

  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '';

  // Allow override via <meta name="trailpack-api" content="https://..."> or ?api=... for debugging.
  const metaOverride = document.querySelector('meta[name="trailpack-api"]')?.content;
  const queryOverride = new URLSearchParams(window.location.search).get('api');

  const DEFAULT_LOCAL = 'http://localhost:3000';
  const DEFAULT_PROD = 'http://trailpack-prod-env-v2.eba-4zfgqhmh.us-east-1.elasticbeanstalk.com';

  window.API_URL = queryOverride || metaOverride || (isLocalhost ? DEFAULT_LOCAL : DEFAULT_PROD);
})();
