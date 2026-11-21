import cors from 'cors';
import dotenv from 'dotenv';
import express, { ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { generationsRouter } from './routes/generations';
import { apiErrorHandler } from './middleware/api-error-handler';
import { initializeGenerationStore } from './services/generation-store';
import type { HealthResponse } from '../../shared/contracts';

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;
// Expo's web dev server commonly uses 8081; 5173 remains supported for the
// project's earlier Vite-style local frontend setup. Set FRONTEND_ORIGIN to a
// comma-separated list to allow a LAN-hosted frontend during development.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://localhost:8081')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(cors({ origin: allowedOrigins, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
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

app.use('/api/generations', generationsRouter);
app.use(apiErrorHandler as ErrorRequestHandler);

async function startServer(): Promise<void> {
  await initializeGenerationStore();
  app.listen(port, () => {
    console.log(`UNFOLD API listening on http://localhost:${port}`);
  });
}

void startServer().catch(() => {
  console.error('Failed to initialize persistent generation storage.');
  process.exitCode = 1;
});
