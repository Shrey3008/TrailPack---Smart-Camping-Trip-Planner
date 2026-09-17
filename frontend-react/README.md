# TrailPack — React frontend

The React + TypeScript rewrite of TrailPack's UI, built alongside the existing
vanilla frontend in [`../frontend`](../frontend) rather than replacing it. Both
are live during the migration: the vanilla site serves production today, this
app is developed against the same API, and the cutover happens at the end.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

It needs the API. In another terminal:

```bash
cd ../backend && npm run dev   # http://localhost:3000
```

No CORS configuration is required for local development — the backend allows
`http://localhost` on any port unconditionally (see `backend/server.js`).

`VITE_API_URL` overrides the backend URL. Without it the app uses
`http://localhost:3000` when served from localhost and the Render backend
otherwise, matching `frontend/config.js`.

## How it is arranged

```
src/
  api/          client.ts — the only module that calls fetch
                auth.ts   — /auth endpoints, unwrapping their envelopes
  auth/         AuthContext + authReducer (session state)
                ProtectedRoute / RequireRole (route guards)
  components/   shared form primitives
  pages/        one file per screen
  types/        api.ts — hand-written from backend/models/
```

### Decisions worth knowing

**All network access goes through `src/api/client.ts`.** It attaches the bearer
token and handles 401 in one place, so a session can expire during any request
and the outcome is the same. Genuinely public endpoints — login, register, the
invite preview — pass `public: true` to opt out: a 401 there means "wrong
password", not "session expired", and treating it as the latter would sign the
user out of a session they never had.

**The API's response envelopes are inconsistent** — `GET /trips` answers
`{ trips: [...] }`, `GET /trips/:id` a bare object, `GET /trips/:id/items` a
bare array. That is absorbed in `src/api/`, not fixed on the backend, which
still serves the vanilla frontend and 679 tests that pin the current shapes.

**`src/types/api.ts` is hand-maintained.** Nothing ties it to the Mongoose
schemas automatically, so it is a claim about the API that has to be checked
when the backend changes. Each type names the model it came from.

**Session state lives in `sessionStorage` under the same keys the vanilla app
uses** (`authToken`, `currentUser`), so a session started in one frontend works
in the other while both are live.

**The stored user is never trusted.** On load the app calls `/auth/me` to
verify the token, because the backend reads the user's role fresh from the
database on every request and deliberately keeps it out of the JWT.

## Scripts

| | |
|---|---|
| `npm run dev` | dev server with HMR |
| `npm run build` | typecheck (`tsc -b`) then production build |
| `npm run preview` | serve the production build locally |
