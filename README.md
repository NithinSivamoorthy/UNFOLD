# UNFOLD backend

The backend is an Express API written in TypeScript. It currently provides a health endpoint; Tripo image-to-3D generation is not implemented yet.

## Requirements

- Node.js 18 or newer
- npm

## Start locally

From the repository root:

```sh
cd server
npm install
```

Copy `server/.env.example` to `server/.env` and adjust `PORT` or `FRONTEND_ORIGIN` if needed. Keep `TRIPO_API_KEY` on the server only; do not expose it through frontend environment variables or return it from API responses.

Start the development server:

```sh
npm run dev
```

The API listens at `http://localhost:3000` by default. Check `http://localhost:3000/api/health` for `{ "status": "ok" }`.

For a production build, run `npm run build` and then `npm start`.
