# AlumniConnect

A centralized alumni management and engagement platform for educational institutions, connecting graduates, current students, faculty, and administrators through a unified web application.

## 🚀 Tech Stack

**Frontend**
- React 18 + Vite 6
- lucide-react (icons)
- Vanilla CSS (responsive, mobile-first)

**Backend**
- Node.js ≥ 20 (ESM)
- Express 5
- PostgreSQL (via `pg`)
- JWT authentication (jsonwebtoken)
- bcryptjs password hashing

**Deployment**
- Backend → [Render](https://render.com) (Node web service)
- Frontend → [Vercel](https://vercel.com) (static + API proxy)

---

## 📦 Local Setup

### Prerequisites
- Node.js ≥ 20
- PostgreSQL 14+

### 1. Clone & install dependencies
```bash
git clone https://github.com/unnati-09m/AlumniConnect.git
cd AlumniConnect
npm run install:all
```

### 2. Configure environment
```bash
cp server/.env.example server/.env
# Edit server/.env and fill in your DATABASE_URL, JWT_SECRET, etc.
```

### 3. Set up the database
```bash
# Create the database in PostgreSQL first:
# createdb alumniconnect

npm run db:setup
```

### 4. Seed demo data
```bash
npm run seed
```

This creates the following demo accounts (password: `Demo@123`):
| Email | Role |
|-------|------|
| admin@alumniconnect.test | Admin |
| alumni@alumniconnect.test | Alumni (Aarav Alumni) |
| sana@alumniconnect.test | Alumni (Sana Mehta) |
| kabir@alumniconnect.test | Alumni (Kabir Shah) |
| riya@alumniconnect.test | Alumni (Riya Deshmukh) |
| student@alumniconnect.test | Student |

### 5. Run in development mode
```bash
npm run dev
# API → http://localhost:4000
# UI  → http://localhost:5173
```

---

## 🔧 Environment Variables

Configure these in `server/.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `4000` |
| `DATABASE_URL` | PostgreSQL connection string | — (required) |
| `JWT_SECRET` | Secret for signing JWTs | — (required) |
| `CLIENT_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |
| `CLIENT_ORIGINS` | Comma-separated CORS origins | — |
| `DB_SSL` | Enable SSL for DB connection | `false` |
| `DEMO_PASSWORD` | Password used by seed script | `Demo@123` |
| `NODE_ENV` | Environment mode | `development` |

---

## 🌐 Deployment

### Backend on Render

1. Create a new **Web Service** on Render
2. Connect this GitHub repository
3. Set **Build Command**: `npm install && npm --prefix server install && npm --prefix client install && npm run build`
4. Set **Start Command**: `node server/src/setup.js && npm start`
5. Add environment variables:
   - `DATABASE_URL` → your PostgreSQL connection string
   - `DB_SSL` → `true`
   - `JWT_SECRET` → generate a strong random secret
   - `NODE_ENV` → `production`
   - `CLIENT_ORIGIN` → your Vercel frontend URL

The included `render.yaml` can be used for Blueprint deployments.

### Frontend on Vercel

1. Import this repository on Vercel
2. Update `vercel.json` → replace `your-render-service.onrender.com` with your actual Render service URL
3. Set **Output Directory**: `client/dist`
4. Deploy

---

## 📂 Project Structure

```
alumniconnect/
├── client/                   # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx           # Complete SPA (role-based views)
│   │   ├── main.jsx          # React entry point
│   │   └── styles.css        # Global stylesheet
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── server/                   # Node.js + Express backend
│   ├── src/
│   │   ├── index.js          # App entry point (routes + middleware)
│   │   ├── db.js             # PostgreSQL pool
│   │   ├── auth.js           # JWT auth middleware
│   │   ├── schema.sql        # Database schema
│   │   ├── setup.js          # Schema migration runner
│   │   ├── seed.js           # Demo data seeder
│   │   ├── smoke-test.js     # End-to-end API test
│   │   └── routes/           # Modular route handlers
│   │       ├── auth.js
│   │       ├── profile.js
│   │       ├── alumni.js
│   │       ├── opportunities.js
│   │       ├── mentorship.js
│   │       ├── events.js
│   │       ├── notifications.js
│   │       ├── announcements.js
│   │       ├── career.js
│   │       ├── donations.js
│   │       └── admin.js
│   ├── package.json
│   └── .env.example
├── .gitignore
├── .env.example
├── package.json              # Root workspace scripts
├── render.yaml               # Render deployment config
└── vercel.json               # Vercel deployment config
```

---

## 👥 Team Structure & Module Allocation

This platform is developed collaboratively with clear separation of responsibilities:

| Module | Developer | Branch | Status / Responsibility |
|--------|-----------|--------|-------------------------|
| **Auth + Student + Foundation** | **Unnati** | `feat/unnati-core-student` | **Lead Foundation**: Authentication, session persistence, role authorization, student onboarding, student dashboard, full DB schema, Express app core, responsive SPA shell. |
| **Alumni Directory & Career** | **Arshiyan** | `feat/arshiyan-alumni-directory` | **Completed & Integrated**: Alumni directory search & filter, detailed professional profiles, career history management, opportunity posting & student application lifecycle, admin CSV export. |
| **Engagement & Admin** | **Nayan Jyoti** | `feat/nayan-engagement-admin` | Mentorship request lifecycle, events & registrations, notifications inbox, announcements broadcast, alumni verification, donation pledge tracking, reports. |

### Team Integration Guidelines
- All developers build on the shared foundation established in `feat/unnati-core-student`.
- **Database**: The complete relational schema is centralized in `server/src/schema.sql`.
- **Authentication**: All protected endpoints use `authenticate`, `requireActive`, and `allowRoles('student', 'alumni', 'admin')` from `server/src/auth.js`.
- **API Convention**: Every JSON endpoint returns either `{ message, data }` or the created/updated resource directly with standard HTTP status codes (`200`, `201`, `400`, `401`, `403`, `404`, `409`, `500`).
- **Feature Modules**: Each feature area is contained within its own router in `server/src/routes/` and mounted in `server/src/index.js`.

---

## 🔌 API Integration Points

All routes follow consistent `{ message, data }` patterns.

- **Auth middleware**: `authenticate`, `allowRoles(...roles)` from `server/src/auth.js`
- **Database pool**: `pool` from `server/src/db.js`
- **Adding routes**: Create a file in `server/src/routes/` and mount it in `server/src/index.js`

### Role-based access
- `student` — Active after registration
- `alumni` — Requires admin verification (`pending` → `active`)
- `admin` — Provisioned via seed script only

---

## 📋 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run install:all` | Install all dependencies (root + server + client) |
| `npm run dev` | Start both API and UI in development mode |
| `npm run dev:server` | Start API only |
| `npm run dev:client` | Start UI only |
| `npm run db:setup` | Run database schema migrations |
| `npm run seed` | Insert demo accounts and sample data |
| `npm test` | Run smoke tests (requires running server) |
| `npm run build` | Build the React frontend |
| `npm start` | Start production server |

# Contribution marker

<!-- trigger contributor update -->

<!-- Unnati contribution marker -->

<!-- Mohammad contribution marker -->
