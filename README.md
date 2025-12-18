# EventDrop - Frontend + Backend

EventDrop is a web app for easy file uploads and sharing around events.
Guests can upload photos for a host, and everything gets collected and shared.

## Requirements

- Node.js 20.19+ or 22.12+
- Docker (for dev/prod containers)

## Environment variables

Frontend (Vite):

- `VITE_API_BASE_URL` - API base URL in the frontend (required for dev, e.g. `http://localhost:8080`).

Backend (Express):

- `PORT` - Backend port (default: `8080`).
- `DATA_ROOT_PATH` - Root path for subdomain folders (default: `/data/events`).
- `CORS_ORIGIN` - Allowed origins (comma-separated) for dev; empty = allow all.
- `JSON_LIMIT` - Payload limit for `express.json()` (default: `5mb`).
- `ENABLE_API_DOCS` - Enable Swagger/OpenAPI (`true`/`false`, default: `false`).
- `UPLOAD_MAX_FILE_SIZE_BYTES` - Max file size per file in bytes (Multer `fileSize` limit; 0 or empty = no limit).
- `UPLOAD_MAX_TOTAL_SIZE_BYTES` - Max total size per upload in bytes (0 or empty = no limit).
- `LOG_LEVEL` - Log level (`silent`, `error`, `info`, `debug`).
- `ALLOWED_DOMAINS` - Allowed base domains (comma-separated). Required for routing (e.g. `localhost` or `frontend`).
- `SUPPORT_SUBDOMAIN` - Enable subdomain routing (`true`/`false`, default: `true`).
- `ALLOW_EVENT_CREATION` - Enable new event creation (`true`/`false`, default: `true`).
- `SERVER_CONFIG_PATH` - Optional: alternate path to the config file (default: `./server.config.json` relative to the working directory).

## Backend config file (`server.config.json`)

- On backend start, `server.config.json` (or the path from `SERVER_CONFIG_PATH`) is read and validated with Zod.
- If the file does not exist, it is created automatically with defaults.
- Env vars can still override values; the resulting effective config is written to the file.
- Example:

```json
{
  "port": 8080,
  "dataRootPath": "/data/events",
  "corsOrigin": "",
  "jsonLimit": "5mb",
  "uploadMaxFileSizeBytes": 0,
  "uploadMaxTotalSizeBytes": 0,
  "logLevel": "info",
  "enableApiDocs": false,
  "allowedDomains": ["localhost"],
  "supportSubdomain": true,
  "allowEventCreation": true
}
```

- Change values (for example `dataRootPath` or limits) and restart the server to apply them.

## Run locally (no Docker)

```bash
npm install
# Terminal 1: Frontend
npm run dev
# Terminal 2: Backend (TS, via tsx)
npm run dev:api
```

Frontend: http://localhost:5173
Backend: http://localhost:8080

### Frontend / Backend notes

- Default: keep `VITE_API_BASE_URL` empty. API calls use same-origin and in dev `/api` is proxied by Vite to `http://localhost:8080`.
- If the backend runs on another host/port, set `VITE_API_BASE_URL` (for example `http://localhost:8080` or a prod URL) in `.env.local`.

## Docker - Development

Starts Vite + Express with hot reload and mounts a data volume for event folders.

```bash
docker compose --env-file docker/dev/.env -f docker/dev/docker-compose.dev.yml up --build
```

Ports:

- Frontend 5173
- Backend 8080

Data is stored in `project-data`.
Config is stored in `project-config`.

Remote debugging on port 9229 (Node.js Inspector) is available in the API container.

(Port changes and defaults are in file [docker/dev/.env](docker/dev/.env).)

## Docker - Production

Nginx serves the built frontend and proxies `/api` internally to the API container. Only one HTTP port is exposed externally.

```bash
docker compose --env-file docker/prod/.env -f docker/prod/docker-compose.prod.yml up --build
```

Prod runs on port 8080 (configurable via `HTTP_PORT`). The API is proxied under `/api/*`.

```bash
MAIN_DOMAIN=party-upload.de HTTP_PORT=8080 docker compose --env-file docker/prod/.env -f docker/prod/docker-compose.prod.yml up --build
```

More settings: [docker/prod/.env](docker/prod/.env).

## API (Backend)

See Swagger docs at `/api/docs` (only if `ENABLE_API_DOCS=true`, default in dev).

## E2E tests (Playwright)

Playwright supports both routing modes. The backend controls this via `SUPPORT_SUBDOMAIN` and the allowed hostnames via `ALLOWED_DOMAINS`.

### Local (uses dev servers)

```bash
npm install
npx playwright install

# Subdomain mode (default)
E2E_MODE=subdomain E2E_ALLOWED_DOMAINS=localhost npm run test:e2e

# Path mode
E2E_MODE=path E2E_ALLOWED_DOMAINS=localhost npm run test:e2e
```

Windows (PowerShell):

```powershell
npm install
npx playwright install

# Subdomain mode (default)
$env:E2E_MODE="subdomain"; $env:E2E_ALLOWED_DOMAINS="localhost"; npm run test:e2e

# Path mode
$env:E2E_MODE="path"; $env:E2E_ALLOWED_DOMAINS="localhost"; npm run test:e2e
```

If you already run the frontend/backend, set `E2E_START_SERVER=false` and point to your base URL:

```bash
E2E_START_SERVER=false E2E_BASE_URL=http://localhost:5173 E2E_MODE=subdomain npm run test:e2e
```

### Docker

```bash
docker compose -f docker/e2e/docker-compose.e2e.yml up --build --exit-code-from e2e
```

To run in path mode via Docker, set:

- `SUPPORT_SUBDOMAIN=false` in the `api` service of `docker/e2e/docker-compose.e2e.yml`
- `E2E_MODE=path` in the `e2e` service of `docker/e2e/docker-compose.e2e.yml`

## Linting / Formatting

```bash
npm run lint
npm run lint:fix
npm run format
npm run format:fix
```
