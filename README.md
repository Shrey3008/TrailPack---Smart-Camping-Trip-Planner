# TrailPack — Smart Camping Trip Planner

A web app that helps campers and backpackers plan trips by generating smart packing checklists tailored to terrain, season, and duration. Includes trip sharing, collaborative packing, AI-assisted gear suggestions, weather forecasts, email reminders, and an admin console.

## Live Demo

- **App:** https://mytrailpack.netlify.app
- **Backend API:** https://trailpack-smart-camping-trip-planner.onrender.com

The frontend is a static site on Netlify; the backend is a Node/Express API on Render backed by MongoDB Atlas. The backend is on Render's free tier, so the first request after a period of inactivity can take 30–60s to wake up.

## Features

### Trips & checklists
- Create trips with name, terrain (mountain / forest / desert / lake / beach), season, dates, and duration
- Smart packing list auto-generated from terrain × season × duration
- Interactive checklist with packed/unpacked toggling and live progress bar
- Add, edit, and delete custom items per trip
- Trip status flow: Planning → Active → Completed / Cancelled
- Filter, search, and sort trips on the My Trips page

### Collaboration
- Invite collaborators by email — they join via a tokenized accept-invite link
- Collaborative checklist: every collaborator sees who packed what and when
- Shared-trips section on the dashboard

### AI & external data
- AI gear suggestions via Groq (`POST /trips/:id/ai-items`) — falls back to a rule-based generator if `GROQ_API_KEY` is unset
- Weather forecasts via OpenWeatherMap, with Open-Meteo for geocoding and UV index (no key required)
- Optional OpenAI integration for legacy AI helpers

### Notifications
- Cron-driven email reminders (pre-trip nudges) via Gmail SMTP (nodemailer), gated by `ENABLE_EMAIL_SCHEDULER`
- No-ops silently when email isn't configured (`DISABLE_EMAIL=true` or missing credentials)

### Auth & accounts
- JWT-based login / register with bcrypt-hashed passwords
- Forgot-password flow with a security question (no email dependency required)
- Three-tier role system: `user`, `organizer`, `admin`

### Admin console
- View all users, filter by role/status, search by name/email
- Inline role popover (anchored to each row) — change role with one click
- Permanently deactivate (delete) a user account with a confirmation step

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML / CSS / JS (no framework) — static hosting on Netlify |
| Backend | Node.js + Express, deployed to Render |
| Database | MongoDB Atlas (Mongoose ODM) |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| Email | Gmail SMTP via nodemailer (no-op if unconfigured) |
| AI | Groq (primary), OpenAI (legacy) |
| Weather | OpenWeatherMap (current + forecast), Open-Meteo (geocoding + UV, no key) |
| Hosting | Netlify (frontend) + Render (backend API) + MongoDB Atlas (database) |

## Project Structure

```
TrailPack/
├── backend/                          # Node.js + Express API
│   ├── server.js                     # App entry, CORS, route mounting
│   ├── db.js                         # MongoDB (Mongoose) connection
│   ├── models/                       # Mongoose schemas: User, Trip, Item,
│   │                                   Notification, Collaborator, Invite,
│   │                                   SentReminder
│   ├── routes/                       # admin, ai, auth, items, notifications,
│   │                                   sharedTrips, trips, weather
│   ├── middleware/                   # auth (JWT) + adminMiddleware
│   ├── services/                     # checklist, ai, email, dashboard,
│   │                                   notification scheduler, dynamoDBService
│   │                                   (Mongo-backed, name kept for history),
│   │                                   provisions, sharedTrips
│   ├── __tests__/                    # Jest test suite
│   └── .env.example                  # Backend env template
│
├── frontend/                         # Static site
│   ├── index.html                    # Public landing page (hero, features,
│   │                                   pricing, FAQ) — redirects logged-in
│   │                                   users to dashboard.html
│   ├── dashboard.html                # Authenticated dashboard (hero rotation,
│   │                                   trip stats, recent trips)
│   ├── login.html, register.html,
│   │ forgot-password.html            # Auth pages
│   ├── my-trips.html                 # Full trips list with filters
│   │                                   (also hosts the Create Trip modal)
│   ├── checklist.html                # Active checklist view
│   ├── checklist-preview.html        # Preview before saving
│   ├── organizer.html                # Manage collaborators
│   ├── accept-invite.html            # Accept a share invite
│   ├── profile.html                  # Account settings
│   ├── admin.html                    # Admin console
│   ├── config.js                     # API base URL (auto-switches local/prod)
│   ├── app.js                        # Trip + checklist logic
│   ├── auth.js, ui.js                # Auth state + toasts/confirm dialogs
│   ├── nav-menu.js                   # Hamburger / desktop nav
│   ├── dashboard-light.{js,css}      # Dashboard hero rotation + theme
│   ├── admin.js                      # Admin console logic
│   └── assets/hero/                  # Rotating hero photos
│
└── README.md
```

## Local Development

### Prerequisites

- **Node.js** 18+ (current LTS)
- **MongoDB Atlas** account with a free M0 cluster (or any MongoDB-compatible connection string)

### 1. Clone and install

```bash
git clone https://github.com/Shrey3008/TrailPack---Smart-Camping-Trip-Planner.git
cd TrailPack---Smart-Camping-Trip-Planner/backend
git checkout dev   # dev is the actively developed branch
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Open .env and fill in:
#   MONGODB_URI          (from Atlas → Connect → Drivers)
#   MONGODB_DB            (defaults to "trailpack")
#   JWT_SECRET             (any random 32+ char string, e.g. `openssl rand -hex 32`)
#   GROQ_API_KEY          (optional — enables AI gear suggestions)
#   WEATHER_API_KEY      (optional — enables OpenWeatherMap current + forecast)
```

`backend/.env.example` documents every supported variable, including email and CORS options.

### 3. Run the backend

```bash
# from /backend
npm run dev          # nodemon, auto-restart on file changes
# or
npm start            # plain node
```

Backend listens on `http://localhost:3000`.

### 4. Serve the frontend

The frontend is fully static. Any local web server works:

```bash
# from repo root
cd frontend
python3 -m http.server 8080
# or use the VS Code "Live Server" extension
```

Open `http://localhost:8080/login.html`.

`config.js` auto-detects `localhost` and points API calls to `http://localhost:3000`. In production it points to the Render backend URL — no manual switch needed.

### 5. Run tests

```bash
cd backend
npm test
```

Jest runs the route + service suite.

## Deployment

The app deploys as three independent, free-tier services, each auto-deploying from GitHub:

```
   browser ──HTTPS──▶  Netlify (static frontend)
                              │
                              │ fetch (CORS)
                              ▼
   browser ──HTTPS──▶  Render (Node.js/Express API)
                              │
                              ▼
                       MongoDB Atlas (M0)
```

| Component | Service | Notes |
|---|---|---|
| Frontend hosting | Netlify | Publish directory: `frontend`, no build step (static site) |
| Backend hosting | Render | Root dir: `backend`, build: `npm install`, start: `node server.js`, health check: `/health` |
| Database | MongoDB Atlas | Free M0 cluster (512 MB) |
| Email | Gmail SMTP via nodemailer | Set `EMAIL_USER` / `EMAIL_PASS` (Google App Password), or leave unset to no-op |

Both Netlify and Render redeploy automatically on every push to the connected branch (`dev`). There is no manual deploy script — push to Git and the platforms handle the rest.

### CORS

The backend allowlist ([backend/server.js](backend/server.js)) is built from:

1. Any `*.netlify.app` subdomain, hardcoded as a default
2. Anything in the `CORS_ALLOWED_ORIGINS` env var (comma-separated, supports `*.subdomain` wildcards)
3. Localhost on any port (always allowed)

To allow a new origin in production, set `CORS_ALLOWED_ORIGINS` in the Render dashboard's Environment tab and let it redeploy.

## API Reference (overview)

All routes are mounted at the backend root. Auth-required routes need `Authorization: Bearer <jwt>`.

### `auth`
- `POST /auth/register` — create account
- `POST /auth/login` — get JWT
- `POST /auth/forgot-password` — get the account's security question
- `POST /auth/reset-password` — reset password via security answer
- `GET  /auth/me` — current user profile
- `PUT  /auth/me` — update profile

### `trips`
- `GET    /trips` — list current user's trips
- `POST   /trips` — create trip (auto-generates checklist)
- `GET    /trips/:id` — trip details
- `PUT    /trips/:id` — update trip
- `DELETE /trips/:id` — delete trip + checklist
- `PUT    /trips/:id/status` — change status
- `GET    /trips/:id/items` — checklist
- `GET    /trips/:id/recommendations` — gear suggestions
- `POST   /trips/:id/ai-items` — AI gear suggestions (Groq)

### `items`
- `POST   /items` — add custom item
- `PUT    /items/:id` — toggle packed / edit
- `DELETE /items/:id` — remove item

### `shared-trips`
- `GET    /shared-trips/mine` — trips shared with me
- `POST   /shared-trips/:tripId/invite` — send invite email
- `POST   /shared-trips/accept/:token` — accept invite
- (collaborator + role management routes)

### `weather`
- `GET    /weather?lat=&lon=&start=&end=` — weather forecast

### `notifications`
- `GET    /notifications` — list current user's notifications
- (mark-read, scheduling helpers)

### `admin` (admin role only)
- `GET    /admin/users` — list users
- `GET    /admin/stats` — system stats
- `PUT    /admin/users/:userId/role` — change role (`user` / `organizer` / `admin`)
- `PUT    /admin/users/:userId/status` — toggle active flag (legacy)
- `DELETE /admin/users/:userId` — permanently delete account
- `POST   /admin/setup` — promote current user to admin (bootstrap)

## Checklist Generation Rules

The smart-checklist engine starts from a base list and adds items per terrain, season, and duration. The full rule set lives in `backend/services/checklistService.js`. Summary:

- **Base** (every trip): backpack, water bottle, first aid kit, headlamp, whistle, map & compass
- **Mountain**: hiking boots, warm layers, trekking poles
- **Forest**: bug spray, tarp, long pants
- **Desert**: extra water, sun hat, sunscreen, sunglasses
- **Winter**: winter jacket, gloves, warm hat, insulated sleeping bag
- **Summer**: lightweight clothing, cooling towel, lightweight tent
- **Fall / Spring**: layered clothing, rain jacket, warm sleeping bag, waterproof boots
- **1+ nights**: tent, sleeping pad, camping stove, food supplies
- **3+ nights**: extra batteries, water purification tablets, multi-tool

## Author

**Shrey Patel** — original author and primary developer.

## License

MIT
