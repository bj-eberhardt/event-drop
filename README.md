# EventDrop - Frontend + Backend

![logo.png](src/img/logo.png)

> EventDrop is a web app for easy file uploads and sharing around events.
> Guests can upload photos for a host, and everything gets collected and shared.

## Table of contents

- [Usage](#usage)
  - [Further configuration](#further-configuration)
- [Configuration](#configuration)
- [Development](#development)
  - [Requirements](#requirements)
  - [Run locally (no Docker)](#run-locally-no-docker)
  - [Docker - Development](#docker---development)
  - [Docker - Production](#docker---production)
  - [API (Backend)](#api-backend)
  - [E2E tests (Playwright)](#e2e-tests-playwright)
  - [Linting / Formatting](#linting--formatting)

## Usage

Easiest is to use the complete stack via **Docker**.

Just use the following compose file:

```yaml
services:
  web:
    image: beberhardt/eventdrop-web:latest
    ports:
      - "8080:80"
    depends_on:
      - api

  api:
    image: beberhardt/eventdrop-api:latest
    environment:
      - PORT=8080
      - ALLOWED_DOMAINS=localhost # change to your domain or frontend hostname
      - SUPPORT_SUBDOMAIN=false
      - ALLOW_EVENT_CREATION=true
      - UPLOAD_MAX_FILE_SIZE_BYTES=0
    volumes:
      - ./data:/data/events
      - ./config:/config
    expose:
      - "8080"

# Optional web config (nginx)
# - RATE_LIMIT_ENABLED=1 # set to 1/0 to enable/disable nginx rate limits
```

start the stack via:

```bash
docker compose up -d
```

Access the app at `http://localhost:8080`.

### Further configuration

You can use this behind your own reverse proxy, change ports, and configure limits via environment variables (see below).

## Configuration

You can either pass the following variables as environment variables or set them in the backend config file (`server.config.json`).

- `PORT` - Backend port (default: `8080`).
- `CORS_ORIGIN` - Allowed origins (comma-separated) for dev; empty = allow all.
- `JSON_LIMIT` - Payload limit for `express.json()` (default: `5mb`).
- `ENABLE_API_DOCS` - Enable Swagger/OpenAPI (`true`/`false`, default: `false`).
- `UPLOAD_MAX_FILE_SIZE_BYTES` - Max file size per file in bytes (Multer `fileSize` limit; 0 or empty = no limit).
- `UPLOAD_MAX_TOTAL_SIZE_BYTES` - Max total size per upload in bytes (0 or empty = no limit).
- `UPLOAD_TEMP_PATH` - Temporary upload directory for multipart uploads (default: `/data/uploads`).
- `LOG_LEVEL` - Log level (`silent`, `error`, `info`, `debug`).
- `ALLOWED_DOMAINS` - Allowed base domains (comma-separated). Required for routing (e.g. `localhost` or `frontend`).
- `SUPPORT_SUBDOMAIN` - Enable subdomain routing (`true`/`false`, default: `true`). If you don't have a domain with certificates on wildcard subdomains, set this to `false` to use URL path routing.
- `ALLOW_EVENT_CREATION` - Enable new event creation for everyone (`true`/`false`, default: `true`).
- `AUTH_RATE_LIMIT_MAX_ATTEMPTS` - Failed auth attempts before blocking (default: `10`, set `0` to disable).
- `AUTH_RATE_LIMIT_WINDOW_MS` - Window for counting failed auth attempts in ms (default: `60 seconds`).
- `AUTH_RATE_LIMIT_BLOCK_MS` - Block duration after limit in ms (default: `5 minutes`).

**Backend config file (`server.config.json`)**

- ENV variables override values in the config file, but are persisted on bootup.
- Example:

```json
{
  "port": 8080,
  "dataRootPath": "/data/events",
  "corsOrigin": "",
  "jsonLimit": "5mb",
  "uploadMaxFileSizeBytes": 0,
  "uploadMaxTotalSizeBytes": 0,
  "uploadTempPath": "/data/uploads",
  "logLevel": "info",
  "enableApiDocs": false,
  "allowedDomains": ["localhost"],
  "supportSubdomain": true,
  "allowEventCreation": true,
  "authRateLimitMaxAttempts": 10,
  "authRateLimitWindowMs": 300000,
  "authRateLimitBlockMs": 300000
}
```

## Development

### Requirements

- Node.js 22.12+
- optional Docker (for dev/prod containers)

### Run locally (no Docker)

```bash
npm install
# Terminal 1: Start Frontend
npm run dev
# Terminal 2: Start Backend (TS, via tsx)
npm run dev:api
```

You can access them:

- Frontend: http://localhost:5173
- Backend: http://localhost:8080

### Docker - Development

Starts Vite + Express with hot reload and mounts a data volume for event folders.

```bash
docker compose --env-file docker/dev/.env -f docker/dev/docker-compose.dev.yml up --build
```

(you can overwrite and configure ports and other settings in [docker/dev/.env](docker/dev/.env))

Ports:

- Frontend 5173
- Backend 8080

Storage:

- Data is stored in folder `project-data`.
- Config is stored in folder `project-config`.

Remote debugging on port 9229 (Node.js Inspector) is available in the API container.

### Docker - Production

Nginx serves the built frontend and proxies `/api` internally to the API container. Only one HTTP port is exposed externally.

```bash
docker compose --env-file docker/prod/.env -f docker/prod/docker-compose.prod.yml up --build
```

Prod runs per default on port 8080 (configurable via `HTTP_PORT`).
The API is proxied under `/api/*`.

More settings: [docker/prod/.env](docker/prod/.env).

### API (Backend)

See Swagger docs at `/api/docs` (only if `ENABLE_API_DOCS=true`, default in dev).

### E2E tests (Playwright)

Playwright supports both routing modes. The backend controls this via `SUPPORT_SUBDOMAIN` and the allowed hostnames via `ALLOWED_DOMAINS`.

#### Local (uses dev servers)

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

### Linting / Formatting

```bash
npm run lint
npm run lint:fix
npm run format
npm run format:fix
```
