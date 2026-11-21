import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requireDemoAuth(request: Request, response: Response, next: NextFunction): void {
  const expected = process.env.UNFOLD_DEMO_TOKEN?.trim() ?? '';
  const expiresAt = Date.parse(process.env.UNFOLD_DEMO_TOKEN_EXPIRES_AT ?? '');
  if (!expected || !Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
    response.status(503).json({ error: { code: 'DEMO_AUTH_UNAVAILABLE', message: 'Demo access is unavailable or expired.' } });
    return;
  }

  const authorization = request.get('authorization') ?? '';
  const candidate = /^Bearer\s+(.+)$/i.exec(authorization)?.[1] ?? '';
  const expectedBytes = Buffer.from(expected);
  const candidateBytes = Buffer.from(candidate);
  const valid = candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
  if (!valid) {
    response.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'A valid demo authorization token is required.' } });
    return;
  }

  next();
}
