# UNFOLD

UNFOLD turns object photos into interactive 3D models. The repository contains an Expo Go mobile app and a protected Express backend, plus a lightweight single-page web demo served by that same backend.

## What works

- Capture or choose an object photo in the mobile app; upload JPEG or PNG images to the backend.
- Submit an image-to-3D generation, poll real task status, and download and inspect the resulting GLB.
- Browse saved models in the mobile app and use the bundled interactive viewer.
- Use `server/web/index.html` as a responsive browser demo with camera/upload input, in-memory demo passcode, explicit paid-generation confirmation, progress, GLB preview, and download.
- Server-side Tripo integration; provider credentials never belong in the client.

Guided scan currently submits a selected single front image through the existing endpoint. Multi-view generation requires a backend endpoint that is not implemented. Expo Go does not provide native LiDAR access. The mobile Lab includes standalone physics demonstration and estimated measurements.

## Requirements

- Node.js and npm
- Expo Go on iPhone/iPad for mobile preview
- A Tripo API key for actual image-to-3D generation

## Mobile app

```bash
cd mobile
npm install
npx expo start --tunnel
```

Scan the terminal QR with the iPhone Camera app and open in Expo Go. The app’s Generation Server settings accept the HTTPS backend root URL and a demo bearer token. The base URL can be changed without a rebuild. The demo token is saved with Expo SecureStore and sent in the Authorization header for generation, polling, and model download. Never use the Tripo key as the demo token.

See [mobile/README.md](mobile/README.md) for capture, upload, scan, viewer, My Models, development checks, and limitations.

## Backend and web demo

From the server directory, create private environment files based on `.env.example`. Put the provider key only in `server/.env`. For the protected demo, configure `UNFOLD_DEMO_TOKEN` in the ignored `server/.env.demo-auth` file. Keep both files private; never commit tokens or API keys.

```bash
cd server
npm install
PORT=3006 npm run dev
```

The server loads its persistent history from `server/data/generations.json` and stores downloaded GLBs in `server/models/`. Build and run the compiled backend with:

```bash
npm run build
PORT=3006 npm start
```

Open `http://localhost:3006/` for the web demo. The page and API share one origin, so it uses relative `/api` paths. `GET /api/health` is the health probe. Generation routes require `Authorization: Bearer <demo token>` and preserve the configured rate limits. Bind to loopback for local development; use a private HTTPS tunnel for remote devices. Do not use a public tunnel for an unprotected backend.

The current Tripo request selects H3.1 `v3.1-20260211` with texture, PBR, and Standard texture quality. Starting a generation consumes provider credits; the web demo requires a deliberate confirmation and should only be used with approval.

## Development checks

```bash
cd mobile && npm run typecheck && npm run lint
cd ../server && npm run build
```

Never commit `.env`, `.env.demo-auth`, API keys, bearer tokens, `node_modules`, Expo/Metro caches, generated build output, generation history, or generated model files. The mobile and server ignore files cover local secrets and generated artifacts.
