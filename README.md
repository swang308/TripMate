# TripMate

**TripMate** is a full-stack, real-time group trip planner — plan itineraries, split budgets, invite travel companions, and get AI-powered destination recommendations, all in one place.

Built as a group capstone project (PRJ666, Group 8).

Members: Heng-Min Tsao, Jackey Zhou, Syed Abdullah, Uny Li, Shan-Yun Wang
Professor: Robert Stewart

## Screenshots

| Landing | Login | Create Account |
| --- | --- | --- |
| ![Landing](pics/landing.png) | ![Login](pics/login.png) | ![Create Account](pics/create_account.png) |

| Homepage | AI Recommendations | Trip Details |
| --- | --- | --- |
| ![Homepage](pics/homepage.png) | ![AI Recommendations](pics/ai_recommendation.png) | ![Trip Details](pics/trip_details.png) |

| Profile | Settings | About |
| --- | --- | --- |
| ![Profile](pics/profile_page.png) | ![Settings](pics/setting.png) | ![About](pics/about.png) |

| Add Trip | Budget | Group Management |
| --- | --- | --- |
| ![Add Trip](pics/add_trip.png) | ![Budget](pics/budget.png) | ![Group Management](pics/group_management.png) |

| Contact | Accessibility Mode |
| --- | --- |
| ![Contact](pics/contact.png) | ![Accessibility Mode](pics/after_applied_accessibility.png) |

## Tech Stack

**Frontend**
- React 19 + React Router 7
- CRACO (custom CRA config) + Tailwind CSS
- Radix UI primitives, `lucide-react` icons, `sonner` toasts
- `@dnd-kit` (drag-and-drop itinerary ordering)
- `react-leaflet` / Leaflet (interactive maps)
- `recharts` (budget charts), `react-hook-form` + `zod` (forms/validation)
- `socket.io-client` (real-time updates)

**Backend**
- Node.js + Express 5
- MySQL (via `mysql2`) with a `docker-compose` MySQL container for local dev
- JWT authentication (`jsonwebtoken`) + `bcrypt` password hashing
- Socket.IO (real-time itinerary/budget/edit-lock events)
- Feature-based modular architecture (see [Backend Architecture](#backend-architecture))

**Testing**
- Node.js built-in test runner (`node:test`) for backend security/authorization tests

## Features

- **Auth**: register, login, password reset/recovery, JWT-protected sessions
- **Trips**: create, edit, delete trips; role-based access (Owner / Editor / Viewer)
- **Itinerary**: add/edit/delete/reorder day-by-day itinerary items (drag-and-drop)
- **Budget**: track and split trip expenses among members
- **Groups**: invite members, manage roles, remove members
- **AI Assistant**: chat-based destination recommendations with ratings, via the AI popup
- **Comments**: per-trip discussion thread
- **Real-time collaboration**: live edit locks and itinerary/budget sync across members via Socket.IO
- **Interactive map**: visualize visited/planned locations with Leaflet

## How to Use

Once both servers are running (see [Getting Started](#getting-started) — frontend on `:3000`, backend on `:5050`):

1. **Register / Login** — go to `http://localhost:3000`, create an account (or log in). Password reset is available from the login page.
2. **Create a trip** — from the Home page, click "New Trip" and fill in destination, dates, and details.
3. **Build the itinerary** — open a trip, add day-by-day items, and drag-and-drop to reorder.
4. **Manage the budget** — track expenses and see how costs are split across members.
5. **Invite your group** — from the trip's Group tab, invite collaborators by email and assign roles (Owner / Editor / Viewer).
6. **Ask the AI assistant** — open the AI popup on a trip to chat and get destination/activity recommendations, then rate suggestions.
7. **Discuss** — leave comments on a trip for group discussion.
8. **Collaborate live** — edits made by one member (itinerary, budget) sync in real time to everyone else viewing the trip.

Role permissions at a glance:

| Action | Owner | Editor | Viewer |
| --- | ---: | ---: | ---: |
| View trip data | Yes | Yes | Yes |
| Edit itinerary / budget | Yes | Yes | No |
| Manage invitations / roles / remove members | Yes | No | No |
| Delete the trip | Yes | No | No |

## API Overview

All routes require a `Bearer` JWT (via `Authorization` header) unless noted otherwise.

| Module | Endpoints |
| --- | --- |
| Health | `GET /`, `GET /api/health` |
| Users | registration, login, recovery, profile |
| Trips | `GET/POST /api/trips`, `GET/PUT/DELETE /api/trips/:tripId` |
| Itinerary | `GET /api/trips/:tripId/itinerary`, `POST` item, `PUT /api/itinerary-items/:itemId`, `PUT /api/itinerary-days/:id/items/order`, `DELETE /api/itinerary-items/:itemId` |
| Budget | `GET/PUT /api/trips/:tripId/budget` |
| Groups | `GET /api/trips/:tripId/group`, `POST/DELETE /api/trips/:tripId/invitations`, `PATCH/DELETE /api/trips/:tripId/members/:memberUserId`, `GET /api/invitations`, `POST /api/invitations/:id/respond` |
| AI Recommendations | `GET/DELETE /api/trips/:tripId/ai-chat`, `POST /api/trips/:tripId/recommendations`, `POST /api/recommendations/:id/rating` |
| Comments | `GET/POST /api/trips/:tripId/comments`, `PUT/DELETE /api/comments/:commentId` |

## Getting Started

### Prerequisites

- Node.js (recommended: Node 20+)
- Docker Desktop (for MySQL via Docker Compose)

### Option A (Recommended): MySQL via Docker + Frontend/Backend via Node

#### 0) Start MySQL (Docker Compose)

From repo root:

1) Copy `.env.mysql.example` to `.env.mysql`:

macOS/Linux:

```bash
cp .env.mysql.example .env.mysql
```

Windows PowerShell:

```powershell
copy .env.mysql.example .env.mysql
```

2) Edit `.env.mysql` and update at least:

- `MYSQL_ROOT_PASSWORD=...`
- `MYSQL_PASSWORD=...`

3) Start MySQL:

```bash
docker compose up -d mysql
```

Schema auto-initializes from:

- `backend/db/schema.sql`

Do not use `docker compose up -d` for Option A. That starts every service in
`docker-compose.yml`, including the Docker frontend on port `3000`. For local
frontend development, only start the `mysql` service with Docker.

#### 1) Configure Backend Environment (.env)

1) Create `backend/.env`:

macOS/Linux:

```bash
cp backend/.env.example backend/.env
```

Windows PowerShell:

```powershell
copy backend\.env.example backend\.env
```

2) Edit `backend/.env` and set at least:

- `DB_PASSWORD=` (use the same value as `MYSQL_PASSWORD` from `.env.mysql`)

#### 2) Generate a JWT Secret

Generate a secret:

```bash
node backend/scripts/generate-jwt-secret.js
```

Copy the output into `backend/.env`:

- `JWT_SECRET=...`

#### 3) Install & Start Backend API

In a new terminal:

```bash
cd backend
npm install
npm start
```

Backend runs on `http://localhost:5050` by default.

Quick checks:

- `http://localhost:5050/`
- `http://localhost:5050/api/health` (verifies DB connection)

#### 4) Install & Start Frontend

In another terminal:

```bash
cd frontend
npm install
npm start
```

Frontend runs on `http://localhost:3000` by default and calls the backend at `http://localhost:5050`.

To override the API URL, set `REACT_APP_API_URL` before running `npm start`.

### Option B: Run MySQL + Frontend via Docker Compose

`docker-compose.yml` includes a `frontend` service, so you can run the DB and frontend with Docker.
The backend API is **not** in `docker-compose.yml`, so you still need to run the backend locally (see Step 3 above).

From repo root:

macOS/Linux:

```bash
cp .env.mysql.example .env.mysql
docker compose up -d mysql
docker compose up --build frontend
```

Windows PowerShell:

```powershell
copy .env.mysql.example .env.mysql
docker compose up -d mysql
docker compose up --build frontend
```

Ports:

- Frontend: `http://localhost:3000`
- MySQL: `localhost:3306`

Stop containers:

```bash
docker compose down
```

If the Docker frontend is already running, you can use Docker frontend
```bash
open http://localhost:3000
```
Or if you want to use local `npm start`
instead, stop only the frontend container:

```bash
docker stop tripmate-frontend
```

Then run `npm start` inside `frontend/`.

## Backend Architecture

The backend uses a feature-based modular structure. The original `server.js`
contained the Express setup, routes, SQL, authorization, AI logic, real-time
events, and startup logic in one file. It has been reduced to the application
startup entry point, while each feature now owns its router and business
helpers.

```mermaid
flowchart TD
    Client[React Client] --> HTTP[server.js<br/>HTTP server + startup]
    HTTP --> Socket[Socket.IO realtime layer]
    HTTP --> App[src/app.js<br/>Express configuration]

    App --> Users[Users / Authentication]
    App --> Trips[Trips]
    App --> Itinerary[Itinerary]
    App --> Budget[Budget]
    App --> Locks[Edit Locks]
    App --> Groups[Groups / Invitations]
    App --> AI[AI Recommendations / Chat]
    App --> Comments[Comments]

    Users --> Auth[Authentication middleware]
    Trips --> Permissions[Trip permissions]
    Itinerary --> Permissions
    Budget --> Permissions
    Locks --> Permissions
    Groups --> Permissions
    AI --> Permissions
    Comments --> Permissions

    Trips --> Shared[Shared services<br/>audit, notification, actor]
    Itinerary --> Shared
    Budget --> Shared
    Groups --> Shared
    Comments --> Shared

    Users --> DB[(MySQL)]
    Trips --> DB
    Itinerary --> DB
    Budget --> DB
    Locks --> DB
    Groups --> DB
    AI --> DB
    Comments --> DB
```

The main backend folders are:

```text
backend/
├─ server.js                         # Environment, HTTP/Socket.IO, schema and listen
├─ src/
│  ├─ app.js                         # Express middleware, health check and routers
│  ├─ config/                        # Environment and JWT configuration
│  ├─ db/                            # Database connection and schema initialization
│  ├─ middleware/
│  │  └─ authenticateUser.js         # Bearer JWT verification
│  ├─ modules/
│  │  ├─ users/                      # Registration, login, recovery and profile
│  │  ├─ trips/                      # Trip CRUD and RBAC permission queries
│  │  ├─ itinerary/                  # Itinerary CRUD, ordering and version checks
│  │  ├─ budget/                     # Expenses, shares and budget version checks
│  │  ├─ edit-locks/                 # Collaborative edit locking
│  │  ├─ groups/                     # Invitations, members and roles
│  │  ├─ recommendations/            # AI chat, recommendations and ratings
│  │  └─ comments/                   # Trip comments
│  ├─ realtime/                      # Socket.IO rooms and events
│  ├─ services/                      # Audit, notification and actor services
│  └─ utils/                         # Shared date utilities
└─ test/                             # Node.js security and authorization tests
```

Frontend structure (`frontend/src/`):

```text
frontend/src/
├─ pages/          # Landing, Login, Register, Home, CreateTrip, Itinerary,
│                  # Budget, Group, Profile, Settings, Account Recovery, etc.
├─ components/     # AppHeader, TripCard, VisitedMap, AI Assist popup, etc.
├─ hooks/ · lib/ · utils/
```

`src/app.js` can be imported without starting the HTTP listener. This keeps
application construction separate from `server.js` and makes future API
integration testing easier.

## Backend Security Unit Tests

The security tests use the built-in Node.js test runner (`node:test`), so no
additional testing framework is required.

Run all backend tests:

```bash
cd backend
npm test
```

If Windows PowerShell blocks `npm.ps1`, use:

```powershell
cd backend
npm.cmd test
```

### Test Authentication Security

File: `backend/test/authentication-security.test.js`

These tests exercise the JWT authentication boundary without requiring a live
database:

- Requests without an `Authorization` header are rejected with `401`.
- Non-Bearer and malformed headers are rejected.
- A correctly signed, unexpired token is accepted.
- Only the trusted `userId` and `email` claims are copied to `req.user`.
- Tampered tokens are rejected.
- Tokens signed with another secret are rejected.
- Expired tokens are rejected.
- Authentication fails closed when `JWT_SECRET` is missing.
- Weak JWT secrets are rejected in production.

The SRS also calls for password hashing/salting and a 30-minute inactivity
timeout. Password hashing is implemented with bcrypt, but database-backed
registration/login integration tests should be added separately. The current
JWT configuration uses a fixed token expiration (15 minutes by default), not a
30-minute inactivity timeout; this requirement should not be considered tested
until inactivity tracking or token refresh/revocation is implemented.

### Test Authorization Rules

File: `backend/test/authorization-rules.test.js`

The authorization tests inject a mock database connection into the Trip
permission functions. This makes the tests deterministic and verifies both the
allow/deny result and the SQL rules used to enforce RBAC.

The expected permission matrix is:

| Action | Owner | Editor | Viewer | Removed/Non-member |
| --- | ---: | ---: | ---: | ---: |
| View trip data | Yes | Yes | Yes | No |
| Edit itinerary | Yes | Yes | No | No |
| Edit budget | Yes | Yes | No | No |
| Manage invitations | Yes | No | No | No |
| Change member roles | Yes | No | No | No |
| Remove members | Yes | No | No | No |
| Delete the trip | Yes | No | No | No |

The current unit tests verify:

- Access requires either ownership or an active membership.
- Removed and non-member users are denied.
- Editing requires an active `Owner` or `Editor` role.
- A `Viewer` is excluded from edit permission.
- Group management requires the `Owner` role.
- Ownership checks require both the Trip ID and creator ID.
- Database query parameters are passed in the expected order.

These unit tests protect the central permission rules. Future API integration
tests should additionally call real protected endpoints and confirm their HTTP
responses after role changes and member removal.

## Troubleshooting

### `'craco' is not recognized...`

This usually means frontend dependencies were not installed (missing `frontend/node_modules`).

```powershell
cd frontend
npm install
npm start
```

### PowerShell blocks `npm` (npm.ps1 ExecutionPolicy error)

If PowerShell shows an error like "script execution is disabled", run:

```powershell
npm.cmd install
npm.cmd start
```

## More Detailed Backend Setup

See `backend/README.SETUP.md`.
