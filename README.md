# Party Upload – Frontend + Backend

Vite + React Frontend mit Express-Backend in TypeScript. Für jede Subdomain wird ein Ordner angelegt und die Projektkonfiguration als `project.json` gespeichert; Upload-Verzeichnisse werden vorbereitet.

## Voraussetzungen
- Node.js 20.19+ oder 22.12+
- Docker (für Dev/Prod-Container)

## Umgebungsvariablen
Frontend (Vite):
- `VITE_MAIN_DOMAIN` - Basis-Domain im Frontend (Default: `party-upload.de`).
- `VITE_API_BASE_URL` - API-Basis-URL im Frontend (fuer Dev noetig, z. B. `http://localhost:8080`).

Backend (Express):
- `PORT` - Backend-Port (Default: `8080`).
- `DATA_ROOT_PATH` - Wurzelpfad fuer Subdomain-Ordner (Default: `/data/parties`).
- `MAIN_DOMAIN` - Basis-Domain fuer Projekt-Domains (Fallback: `VITE_MAIN_DOMAIN` oder `party-upload.de`).
- `CORS_ORIGIN` - Erlaubte Origins (comma-separated) fuer Dev; leer = alle.
- `JSON_LIMIT` - Payload-Limit fuer `express.json()` (Default: `5mb`).
- `ENABLE_API_DOCS` - Swagger/OpenAPI aktivieren (`true`/`false`, Default: `false`).
- `UPLOAD_MAX_FILE_SIZE_BYTES` - Max. Dateigroesse pro Datei in Bytes (Multer `fileSize` Limit; 0 oder leer = kein Limit).
- `UPLOAD_MAX_TOTAL_SIZE_BYTES` - Max. Gesamtgroesse pro Upload in Bytes (0 oder leer = kein Limit).
- `LOG_LEVEL` - Log-Level (`silent`, `error`, `info`, `debug`).

## Lokal starten (ohne Docker)
```bash
npm install
# Terminal 1: Frontend
npm run dev
# Terminal 2: Backend (TS, via tsx)
npm run dev:api
```
Frontend: http://localhost:5173  
Backend: http://localhost:8080

### Hinweise Frontend ↔ Backend
- Default: `VITE_API_BASE_URL` leer lassen, dann laufen API-Calls same-origin; im Dev wird `/api` via Vite-Proxy auf `http://localhost:8080` weitergeleitet.
- Wenn Backend auf anderem Host/Port läuft, setze `VITE_API_BASE_URL` (z. B. `http://localhost:8080` oder prod-URL) in `.env.local`.

## Docker - Development
Startet Vite + Express mit Hot Reload und bindet ein Daten-Volume fuer die Projekt-Ordner.
```bash
docker compose --env-file docker/dev/.env -f docker/dev/docker-compose.dev.yml up --build
```
Ports: Frontend 5173, Backend 8080. Daten liegen im Volume `party-data` (Standard-Pfad `/data/parties` im Container).

## Docker - Production
Nginx serviert das gebaute Frontend und leitet `/api` intern an den API-Container weiter. Nur ein HTTP-Port wird extern gemappt.
```bash
docker compose --env-file docker/prod/.env -f docker/prod/docker-compose.prod.yml up --build
```
Prod laeuft auf Port 8080 (einstellbar via `HTTP_PORT`), API unter `/api/*`, Frontend direkt aus `dist`.
Build only: `docker compose --env-file docker/prod/.env -f docker/prod/docker-compose.prod.yml build`.
Beispiel mit Variablen (ohne `VITE_` Prefix in der `.env`):
```bash
MAIN_DOMAIN=party-upload.de HTTP_PORT=8080 docker compose --env-file docker/prod/.env -f docker/prod/docker-compose.prod.yml up --build
```

### Subdomains lokal (z. B. `party.localhost`)
- Du kannst Subdomains über `*.localhost` aufrufen. Beispiel: `bjoern.localhost:5173` (Frontend) spricht per Proxy/API den Backend-Port 8080 an.
- Bei Aufruf mit Subdomain zeigt das Frontend automatisch die Projekt-Ansicht und holt `GET /api/events/{eventId}`. 200 → Projektinfo, 404 → Fehlerseite.

## API (Backend)
- TypeScript + Zod-Validierung; Interfaces für Projekt-Konfiguration.
- `GET /api/events/:eventId` → `200` wenn vorhanden (`{ eventId, secured, allowGuestDownload }`), `404` wenn frei.
- `POST /api/events` → legt Ordner `${DATA_ROOT_PATH}/<eventId>/` an, erstellt `project.json`, speichert Passworthashes:
  - `auth.guestPasswordHash` (optional, wenn übergeben)
  - `auth.adminPasswordHash`
- `PATCH /api/events/:eventId` → aktualisiert Gäste-Passwort (optional) und Flag `settings.allowGuestDownload` (Admin Basic Auth).
- `POST /api/events/:eventId/files` → Upload mehrerer Dateien (`multipart/form-data` Feldname `files`), speichert unter `${DATA_ROOT_PATH}/<eventId>/files/`. Responst `{ uploaded: n }`. Bei gesetztem Gäste-Passwort Basic Auth (user `guest`) senden.
- `GET /api/events/:eventId/files` → Listet Dateien + Größe + Datum, erfordert Admin Basic Auth (`admin:<pass>`), oder Gäste-Basic-Auth wenn `allowGuestDownload` aktiv ist.
- `GET /api/events/:eventId/files/:filename` → Einzelner Download, Admin Basic Auth oder Gäste-Basic-Auth wenn `allowGuestDownload` aktiv ist.
- `GET /api/events/:eventId/files.zip` → Alle Dateien als ZIP, Admin Basic Auth oder Gäste-Basic-Auth wenn `allowGuestDownload` aktiv ist.
- `DELETE /api/events/:eventId` → Löscht das komplette Projekt inkl. Dateien, Admin Basic Auth.

Validierung:
- Subdomain: 3–32 Zeichen, nur a–z, 0–9, `-`.
- Admin-Passwort: min. 8 Zeichen, muss bestätigt werden.
- Gäste-Passwort: optional, wenn gesetzt min. 4 Zeichen.

## Frontend-Flow
- Home-Screen mit CTA „Neue Party anlegen“.
- Formular prüft Subdomain live über `/api/events/{eventId}` (404 = frei, 200 = belegt).
- Submit sendet an `/api/events`; bei Erfolg Hinweis mit Domain.
- Aufruf über Subdomain (`sub.localhost`) zeigt Projekt-Seite; wenn Gäste-Passwort aktiv ist, fragt der Client nach dem Passwort, speichert es in `sessionStorage` und nutzt es für spätere Requests/Uploads.
- Admin-Link (`/admin`) auf der Subdomain fragt Admin-Passwort (Basic Auth user `admin`), speichert es in `sessionStorage`, zeigt Dateiliste inkl. Größe/Datum, bietet Einzel-Download, Vorschau und ZIP-Download.

## Linting
```bash
npm run lint
npm run lint:fix
```

