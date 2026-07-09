# Menler LMS

Standalone LMS for Menler — its own backend + frontend, sharing the marketing site's
MongoDB Atlas cluster (uses only `lms_*` collections, so it never touches leads/orders).

```
menler-lms/
├── server/   Express + Mongoose API  → /api/lms   (port 4100)
└── client/   React + Vite frontend    → app.menler.in (port 5174)
```

## Run locally

### 1. Backend
```bash
cd server
npm install
cp .env.example .env        # then edit .env
#   MONGODB_URI  = the SAME connection string as the marketing backend
#   JWT_SECRET   = any long random string
npm run seed                # creates admin@menler.in / ChangeMe123! + sample programs
npm run dev                 # http://localhost:4100
```

### 2. Frontend
```bash
cd client
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:4100/api/lms
npm run dev                 # http://localhost:5174
```

Open http://localhost:5174 and log in with the seeded admin.

## Roles
`student` · `mentor` · `admin` · `partner` — a user has one. Signup is student-only;
mentors/admins/partners are provisioned by an admin.

## API (Phase 1)
- `POST /api/lms/auth/register | login | refresh | forgot | reset`
- `GET | PATCH /api/lms/me`
- `GET /api/lms/programs` · `GET /api/lms/programs/:id` · `POST|PATCH` (admin only)

## Deploy
- **Backend** → Render (new Web Service, root `server/`, start `npm start`). Env: `MONGODB_URI`,
  `JWT_SECRET`, `LMS_APP_URL=https://app.menler.in`.
- **Frontend** → Vercel (root `client/`). Env: `VITE_API_URL=https://<render-lms>/api/lms`.
  Point `app.menler.in` at it.

## Data isolation rule
This service must only ever read/write `lms_*` collections. Never touch the marketing
collections (`leads`, `orders`, `users`) — that keeps the shared database safe.
