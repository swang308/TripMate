# TripMate Backend Setup (Local Dev + Docker MySQL)

This guide assumes you have not set up anything yet.

## 1) Start MySQL (Docker Compose)

1. Make sure Docker Desktop is installed and running.
2. From the repo root, create your MySQL env file:

macOS/Linux:

```bash
cp .env.mysql.example .env.mysql
```

Windows PowerShell:

```powershell
copy .env.mysql.example .env.mysql
```

3. Open `.env.mysql` and update at least:

- `MYSQL_ROOT_PASSWORD=...`
- `MYSQL_PASSWORD=...`

4. Start MySQL:

```bash
docker compose up -d mysql
```

Use `docker compose up -d mysql` when you only need the database. Running
`docker compose up -d` starts every service in `docker-compose.yml`, including
the frontend container on port `3000`.

5. Confirm the container is running:

```bash
docker compose ps
```

## 2) Verify Schema Initialized (Users/Profiles Tables)

1. Enter the MySQL container using the root account:

```bash
docker exec -it tripmate-mysql mysql -uroot -p
```

2. When prompted, enter the `MYSQL_ROOT_PASSWORD` value from `.env.mysql`.
3. In the MySQL shell, run:

```sql
USE tripmate;
SHOW TABLES;
```

You should see at least:

- `Users`
- `Profiles`

## 3) Configure Backend Environment (JWT + DB + OpenRouter)

1. Create your backend `.env` file:

macOS/Linux:

```bash
cp backend/.env.example backend/.env
```

Windows PowerShell:

```powershell
copy backend\.env.example backend\.env
```

2. Open `backend/.env` and set at least:

- `DB_PASSWORD=` (use the `MYSQL_PASSWORD` value from `.env.mysql`)

For the AI assistant, also set:

```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_SITE_URL=http://localhost:3000
```

Keep `OPENROUTER_API_KEY` backend-only. Do not put it in frontend code or any
`REACT_APP_*` variable.

`OPENROUTER_MODEL` is optional. If it is omitted, the backend uses
`openai/gpt-4o-mini`.

## 4) Generate and Set `JWT_SECRET`

1. Generate a JWT secret (run from repo root or from `backend/`):

```bash
node backend/scripts/generate-jwt-secret.js
```

2. Copy the output and paste it into `backend/.env`:

- `JWT_SECRET=...`

## 5) Check `JWT_SECRET` Is Loaded

Run:

```bash
node backend/scripts/check-env.js
```

If you see `OK: JWT secret is configured.`, you are good to go.

## 6) Check OpenRouter Credits

From `backend/`:

```bash
npm run check:credits
```

This reads `OPENROUTER_API_KEY` from `backend/.env` and prints OpenRouter usage
and remaining credits. The script masks the key in terminal output.

## 7) Start Backend

From `backend/`:

```bash
npm start
```

Backend runs on:

```text
http://localhost:5050
```

Health check:

```text
http://localhost:5050/api/health
```

## 8) AI Assistant Notes

The assistant role and guardrails are stored in:

```text
backend/ai/SYSTEM_PROMPT.md
```

Current rule: the assistant only answers travel-planning questions. Off-topic
requests such as coding, math, legal, medical, finance, politics, or homework
are refused.

AI endpoints:

```http
POST /api/trips/:tripId/recommendations
POST /api/recommendations/:recommendationId/rating
```

Both endpoints require the normal authenticated TripMate user session.

Backend has no `npm run build` script. If you are already inside `backend/`,
syntax check with:

```bash
node --check server.js
```

After changing `.env`, restart the backend server.
