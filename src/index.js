/* =============================================================================
   TrailPack Worker entry point.

   This was an assets-only Worker — static files out of ./frontend and no code
   at all. It now has one route, /api/nearby-trails; every other path is still
   the static site, served by the asset server with the same html_handling and
   404 behaviour as before.

   The route exists because the browser cannot afford the Overpass response. A
   100-mile search around New York is 18.22 MB and 77 seconds upstream, and the
   fields TrailPack renders are 378 KB of it gzipped. Fetching here means that
   cost is paid once per location per day rather than once per user, and it
   means an overloaded Overpass reaches people as "the trail service is busy"
   instead of as "there are no trails near you".

   Deliberately thin. Everything worth testing lives in handler.js and
   trails.js, which are CommonJS so the jest suite can require them; esbuild
   bundles them into this module at deploy time.
   ========================================================================== */

import { createHandler } from './handler.js';

// One handler per isolate, so its in-flight counter and request coalescing
// persist across requests the way the backpressure design assumes.
const api = createHandler();

/* Origins allowed to call /api/nearby-trails cross-origin.

   The route was same-origin-only by construction: it shipped alongside the
   pages that call it, so it needed no CORS headers at all. That stopped being
   true when the frontend was also deployed to Vercel as plain static files —
   that host has no serverless functions, so Discover there has to reach this
   Worker across origins or not work.

   An allowlist rather than `*`, even though the payload is public trail data:
   `*` would also let any page anywhere spend this Worker's Overpass budget,
   which is the scarce thing here. Requests carry no credentials and the route
   reads nothing user-specific, so an echoed origin leaks nothing.

   Same-origin requests send no Origin header and never reach this list. */
const ALLOWED_ORIGINS = [
  'https://trailpack-smart-camping.vercel.app'
];

/* Adds the CORS header when the caller is on the list. Rebuilt rather than
   mutated: a response served out of the Cache API has immutable headers, and
   this route serves most of its traffic from there. */
function withCors(response, request) {
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return response;

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  // The answer differs by Origin now, so caches must key on it.
  headers.append('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/nearby-trails') {
      // Second boundary. handle() already catches its own work; this covers
      // anything that could go wrong reaching it, so the route cannot fall
      // through to the runtime's plain-text 500 with a stack trace on it.
      // Scoped to the API path on purpose — asset serving keeps the exact
      // behaviour it has today, including its own error handling.
      try {
        return withCors(await api.handle(request, ctx), request);
      } catch (e) {
        console.error('nearby-trails boundary', e && e.stack ? e.stack : e);
        return withCors(new Response(JSON.stringify({ status: 'error', error: 'trail search failed' }), {
          status: 500,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
        }), request);
      }
    }
    // Everything else is the static site, exactly as before.
    return env.ASSETS.fetch(request);
  }
};
