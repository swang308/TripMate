# TripMate — `ECONNREFUSED 127.0.0.1:3306` Fix

_Diagnosed 2026-05-31 (automated run; no changes were made to your machine)._

## Root cause

The backend never failed in your code. Every error is just MySQL not being reachable on port 3306, and MySQL isn't running because **Docker Desktop isn't running**:

```
Cannot connect to the Docker daemon at unix:///Users/shanyunwang/.docker/run/docker.sock.
Is the docker daemon running?
```

So `docker compose up -d mysql` silently does nothing, no container exists, and `node server.js` then hits `connect ECONNREFUSED 127.0.0.1:3306`.

## Secondary issue (will bite you right after Docker is up)

Two config problems in the repo:

1. **`backend/.env` is missing.** Only `backend/.env.example` exists. `src/db/connection.js` reads `DB_PASSWORD` from `backend/.env` with **no default**, so the connection would fail auth even once MySQL runs.
2. **`.env.mysql` still has placeholder passwords** (`change_me_root_password`, `change_me_app_password`). And `DB_PASSWORD` in `backend/.env` must match `MYSQL_PASSWORD` in `.env.mysql`.

## Fix — run these in order

1. **Start Docker Desktop** (open the app, wait for the whale icon to go steady), then confirm:
   ```bash
   docker info        # should print server info, not the daemon error
   ```

2. **Set real, matching passwords.**
   - In `.env.mysql`, replace both `change_me_*` values with real passwords.
   - Create `backend/.env` from the example and make `DB_PASSWORD` equal `MYSQL_PASSWORD`:
   ```bash
   cd "/Users/shanyunwang/Desktop/Seneca/academy/S6/PRJ666/PRJ666_Group8_TripMate"
   cp backend/.env.example backend/.env
   # then edit backend/.env so DB_PASSWORD matches MYSQL_PASSWORD in .env.mysql
   ```

3. **Start MySQL fresh.** If you changed `MYSQL_PASSWORD` after the volume was already initialized, the old password is baked into the volume — wipe it:
   ```bash
   docker compose down -v      # -v drops the mysql_data volume so new password/schema apply
   docker compose up -d mysql
   docker compose logs -f mysql   # wait for "ready for connections", then Ctrl-C
   ```

4. **Verify the DB and schema loaded:**
   ```bash
   docker exec -it tripmate-mysql mysql -uroot -p
   # at the mysql> prompt (NOT the zsh prompt — that's why USE/SHOW said "command not found"):
   #   USE tripmate;
   #   SHOW TABLES;
   ```

5. **Start the backend and frontend:**
   ```bash
   cd backend && npm start            # terminal 1
   cd frontend && npm start           # terminal 2
   ```

## Notes on the log
- `zsh: command not found: USE / SHOW` happened because those SQL statements were typed at the **zsh shell**, not inside the `mysql>` client. Run them only after `docker exec ... mysql -uroot -p` connects.
- `zsh: command not found: #` — the `# enter MYSQL_ROOT_PASSWORD...` comment line was pasted into zsh, which doesn't treat `#` as a comment in interactive mode here. Harmless.

## One-line summary
Start Docker Desktop, create `backend/.env` with `DB_PASSWORD` matching `MYSQL_PASSWORD` in `.env.mysql`, then `docker compose down -v && docker compose up -d mysql` before `npm start`.
