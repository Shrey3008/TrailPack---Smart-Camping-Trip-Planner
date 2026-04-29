# TrailPack — Smart Camping Trip Planner

A web app that helps campers and backpackers plan trips by generating smart packing checklists tailored to terrain, season, and duration. Includes trip sharing, collaborative packing, AI-assisted gear suggestions, weather forecasts, email reminders, and an admin console.

## Live Demo

- **Frontend (HTTPS):** https://d1lo74lzwr0k57.cloudfront.net/
- **Backend API (HTTPS):** https://dk4c01g0h1v43.cloudfront.net/
- **Region:** `us-east-1`

The frontend and backend are both served via Amazon CloudFront for HTTPS and edge caching. The S3 and Elastic Beanstalk endpoints below still work (HTTP) but the CloudFront URLs are the canonical ones.

<details><summary>Origin endpoints (used internally by CloudFront)</summary>

- S3 website: `http://trailpack-frontend-173480719972.s3-website-us-east-1.amazonaws.com`
- Elastic Beanstalk: `http://trailpack-prod-env-v2.eba-4zfgqhmh.us-east-1.elasticbeanstalk.com`

</details>

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
- AI gear suggestions via Groq (`POST /trips/:id/ai-items`) — falls back to a no-op if `GROQ_API_KEY` is unset
- Open-Meteo weather forecast for trip locations (no API key required)
- Optional OpenAI integration for legacy AI helpers

### Notifications
- Cron-driven email reminders (pre-trip nudges) via AWS SES, gated by `ENABLE_EMAIL_SCHEDULER`
- Local SMTP / Gmail fallback for development

### Auth & accounts
- JWT-based login / register with bcrypt-hashed passwords
- Forgot-password flow with tokenized email reset
- Three-tier role system: `user`, `organizer`, `admin`

### Admin console
- View all users, filter by role/status, search by name/email
- Inline role popover (anchored to each row) — change role with one click
- Permanently deactivate (delete) a user account with a confirmation step

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML / CSS / JS (no framework) — served from S3, fronted by CloudFront |
| Backend | Node.js + Express, deployed to Elastic Beanstalk |
| Database | DynamoDB (single-table for trips/items/collaborators + a separate users table) |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| Email | AWS SES in production, nodemailer/Gmail in dev |
| AI | Groq (primary), OpenAI (legacy) |
| Weather | Open-Meteo (free, no key) |
| Hosting | S3 (static site) + Elastic Beanstalk (API) + CloudFront (HTTPS + caching) |

## Project Structure

```
TrailPack/
├── backend/                          # Node.js + Express API
│   ├── server.js                     # App entry, CORS, route mounting
│   ├── db.js                         # DynamoDB document client
│   ├── routes/                       # admin, ai, auth, items, notifications,
│   │                                   sharedTrips, trips, weather
│   ├── middleware/                   # auth (JWT) + adminMiddleware
│   ├── services/                     # checklist, ai, email, dashboard,
│   │                                   notification scheduler, dynamoDB,
│   │                                   provisions, sharedTrips
│   ├── __tests__/                    # Jest test suite
│   └── .env.example                  # Backend env template
│
├── frontend/                         # Static site
│   ├── login.html, register.html,
│   │ forgot-password.html            # Auth pages
│   ├── index.html                    # Dashboard (rotating hero + stats)
│   ├── my-trips.html                 # Full trips list with filters
│   ├── create-trip.html              # Plan a new trip
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
├── aws-configs/                      # CloudFront distribution configs
│   ├── cf-frontend.json              # S3 → CloudFront
│   └── cf-backend.json               # EB → CloudFront
│
├── deploy.sh                         # One-command deploy script
├── .env.example                      # Root env template (full reference)
└── README.md
```

## Local Development

### Prerequisites

- **Node.js** 18+ (current LTS)
- **AWS account** with credentials in `~/.aws/credentials` or env vars (the backend talks to DynamoDB even in dev — there is no local DB fallback)
- **DynamoDB tables** named `TrailPack-Trips` and `TrailPack-Users` in `us-east-1` (or override via env vars)
- **`aws` CLI** for the deploy script
- **`eb` CLI** for backend deploys: `pip install --user awsebcli`

### 1. Clone and install

```bash
git clone https://github.com/Shrey3008/TrailPack---Smart-Camping-Trip-Planner.git
cd TrailPack---Smart-Camping-Trip-Planner/backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Open .env and fill in:
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
#   JWT_SECRET           (any random 32+ char string for dev)
#   GROQ_API_KEY         (optional — enables AI gear suggestions)
#   WEATHER_API_KEY      (optional — only for legacy OpenWeather features)
```

The full annotated reference lives in the **root** `.env.example` — it documents every supported variable across CORS, AWS, email, AI, and weather.

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

`config.js` auto-detects `localhost` and points API calls to `http://localhost:3000`. In production builds it points to the backend CloudFront URL — no manual switch needed.

### 5. Run tests

```bash
cd backend
npm test
```

Jest runs the full route + service suite. Tests use stubbed AWS env vars so they don't hit real DynamoDB.

## Deployment

A single script handles everything:

```bash
./deploy.sh             # backend (EB) + frontend (S3) + CloudFront invalidations
./deploy.sh frontend    # frontend only
./deploy.sh backend     # backend only
```

The script:

1. Runs `eb deploy trailpack-prod-env-v2` from `backend/`
2. Syncs `frontend/` to `s3://trailpack-frontend-173480719972/` (excludes `_originals/`, backups, logs, `.DS_Store`)
3. Submits CloudFront invalidations for both distributions
4. Prints all public URLs at the end

### AWS architecture

```
                    ┌────────────────────────────┐
   browser ──HTTPS──▶│  CloudFront  d1lo74...     │──▶ S3 static site
                    └────────────────────────────┘     (frontend bucket)
                    
                    ┌────────────────────────────┐
   browser ──HTTPS──▶│  CloudFront  dk4c01...     │──▶ Elastic Beanstalk
                    │  (caching disabled — API)  │     (Node.js API)
                    └────────────────────────────┘            │
                                                              ▼
                                                    ┌──────────────────┐
                                                    │     DynamoDB     │
                                                    │ TrailPack-Trips  │
                                                    │ TrailPack-Users  │
                                                    └──────────────────┘
                                                              │
                                                              ▼
                                                          AWS SES
                                                       (transactional email)
```

| Component | AWS resource |
|---|---|
| Frontend hosting | S3 bucket `trailpack-frontend-173480719972` (static website) |
| Frontend CDN | CloudFront `E2DQVML6TDR39D` → `d1lo74lzwr0k57.cloudfront.net` |
| Backend hosting | Elastic Beanstalk env `trailpack-prod-env-v2` (single t2.micro / t3.micro) |
| Backend CDN | CloudFront `E1A4XC62OW633P` → `dk4c01g0h1v43.cloudfront.net` (caching disabled) |
| Database | DynamoDB tables `TrailPack-Trips` and `TrailPack-Users` |
| Email | AWS SES (`us-east-1`) |

Free-tier footprint: well under all limits (CloudFront 1 TB out + 10M req/mo are perpetually free; EB on a single micro instance is free for 12 months; DynamoDB 25 GB + 25 RCU/WCU always free; SES 200 emails/day from EC2 always free).

### CORS

The backend allowlist is built from:

1. Hardcoded production origins (S3 website + CloudFront frontend) in `backend/server.js`
2. Anything in the `CORS_ALLOWED_ORIGINS` env var (comma-separated, supports `*.subdomain` wildcards)
3. Localhost on any port (always allowed)

To allow a new origin in production:

```bash
cd backend
eb setenv CORS_ALLOWED_ORIGINS=https://your-new-origin.example.com
```

## API Reference (overview)

All routes are mounted at the backend root. Auth-required routes need `Authorization: Bearer <jwt>`.

### `auth`
- `POST /auth/register` — create account
- `POST /auth/login` — get JWT
- `POST /auth/forgot-password` — email reset link
- `POST /auth/reset-password` — consume reset token
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
- `GET    /weather?lat=&lon=&start=&end=` — Open-Meteo forecast

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
