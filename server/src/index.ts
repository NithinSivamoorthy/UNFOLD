import cors from 'cors';
import dotenv from 'dotenv';
import express, { ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { generationsRouter } from './routes/generations';
import { apiErrorHandler } from './middleware/api-error-handler';
import { requireDemoAuth } from './middleware/demo-auth';
import { initializeGenerationStore } from './services/generation-store';
import type { HealthResponse } from '../../shared/contracts';
import path from 'node:path';

dotenv.config();
dotenv.config({ path: '.env.demo-auth', override: true });

const app = express();
const port = Number(process.env.PORT) || 3000;
const indexPath = path.resolve(process.cwd(), 'web', 'index.html');
// Expo's web dev server commonly uses 8081; 5173 remains supported for the
// project's earlier Vite-style local frontend setup. Set FRONTEND_ORIGIN to a
// comma-separated list to allow a LAN-hosted frontend during development.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://localhost:8081')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(cors({ origin: allowedOrigins, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  const body: HealthResponse = { status: 'ok' };
  response.json(body);
});

app.use('/api', rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many API requests. Try again shortly.' } },
}));

app.use('/api/generations', requireDemoAuth, generationsRouter);
app.get('/', (_request, response) => response.sendFile(indexPath));
app.use(apiErrorHandler as ErrorRequestHandler);

async function startServer(): Promise<void> {
  if (!process.env.UNFOLD_DEMO_TOKEN?.trim()) {
    console.error('UNFOLD_DEMO_TOKEN is missing; refusing to start the demo backend without authentication.');
    process.exitCode = 1;
    return;
  }
  console.log(`UNFOLD web entry: ${indexPath}`);
  await initializeGenerationStore();
  app.listen(port, '127.0.0.1', () => {
    console.log(`UNFOLD API listening on http://localhost:${port}`);
  });
}

void startServer().catch(() => {
  console.error('Failed to initialize persistent generation storage.');
  process.exitCode = 1;
});
