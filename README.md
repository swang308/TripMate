# PRJ666_Group 8 TripMate (Frontend + Backend + MySQL)

Members: Heng-Min Tsao, Jackey Zhou, Syed Abdullah, Uny Li, Shan-Yun Wang  
Professor: Robert Stewart

This repo contains:

- `backend/`: Node.js + Express API (MySQL + JWT auth)
- `frontend/`: React app (CRACO)
- `docker-compose.yml`: Local MySQL container (and optional frontend container)

## Run Locally (Step-by-step)

### Prerequisites

- Node.js (recommended: Node 20+)
- Docker Desktop (for MySQL via Docker Compose)

### Option A (Recommended): MySQL via Docker + Frontend/Backend via Node

### 0) Start MySQL (Docker Compose)

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

### 1) Configure Backend Environment (.env)

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

### 2) Generate a JWT Secret

Generate a secret:

```bash
node backend/scripts/generate-jwt-secret.js
```

Copy the output into `backend/.env`:

- `JWT_SECRET=...`

### 3) Install & Start Backend API

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

### 4) Install & Start Frontend

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
