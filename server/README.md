# UNFOLD backend API

Express and TypeScript backend. Tripo API credentials are read from `server/.env` and are never returned to clients.

## Setup

From this directory, install dependencies and copy `.env.example` to `.env`:

```powershell
npm install
Copy-Item .env.example .env
```

Set `TRIPO_API_KEY` in `.env`. Optional settings are `PORT` (default `3000`), `FRONTEND_ORIGIN` (default `http://localhost:5173`), and `TRIPO_MODEL` (default `v3.1-20260211`). Keep `.env` private; it is ignored by Git.

## Run and build

```powershell
npm run dev
npm run build
npm start
```

## API

- `GET /api/health` returns `{ "status": "ok" }`.
- `POST /api/generations` accepts one multipart file in field `image` (JPEG or PNG, up to 20 MB). It responds `202` with the app's generation ID.
- `GET /api/generations/:id` polls Tripo and returns status and progress. `modelUrl` is present once generation succeeds.
- `GET /api/generations/:id/model` downloads a completed GLB into `server/models/` and serves it to the caller.

Check the health endpoint with:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

For a generation smoke test in PowerShell 7 (replace the example image path):

```powershell
$created = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/generations -Form @{ image = Get-Item .\example.png }
Invoke-RestMethod "http://localhost:3000/api/generations/$($created.id)"
Invoke-WebRequest "http://localhost:3000/api/generations/$($created.id)/model" -OutFile .\generated.glb
```

Generation records are kept in memory and expire locally after 24 hours; restarting the server clears active records. Downloaded GLB files remain in `server/models/`. API requests have timeouts and rate limits; generation creation is limited to 10 requests per IP per hour, and API traffic to 120 requests per IP per minute.

The Tripo v3 workflow uses `POST /v3/files` with multipart field `file`, `POST /v3/generation/image-to-model` with `input` set to the returned `file_token`, and `GET /v3/tasks/{task_id}` for status and output.
