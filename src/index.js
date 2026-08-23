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
        return await api.handle(request, ctx);
      } catch (e) {
        console.error('nearby-trails boundary', e && e.stack ? e.stack : e);
        return new Response(JSON.stringify({ status: 'error', error: 'trail search failed' }), {
          status: 500,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
        });
      }
    }
    // Everything else is the static site, exactly as before.
    return env.ASSETS.fetch(request);
  }
};
