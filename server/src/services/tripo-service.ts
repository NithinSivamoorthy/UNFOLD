import type { TripoTaskResponse } from '../../../shared/contracts';

const TRIPO_BASE_URL = 'https://openapi.tripo3d.ai/v3';
const TRIPO_TIMEOUT_MS = 30_000;

export type TripoOperation = 'file_upload' | 'task_creation' | 'task_status';

interface TripoFailure {
  operation: TripoOperation;
  responseStatus: number;
  upstreamStatus?: number;
  upstreamCode?: number | string;
  upstreamMessage?: string;
  insufficientCredits?: boolean;
}

export class TripoApiError extends Error {
  readonly operation: TripoOperation;
  readonly responseStatus: number;
  readonly upstreamStatus?: number;
  readonly upstreamCode?: number | string;
  readonly upstreamMessage?: string;
  readonly insufficientCredits: boolean;

  constructor(failure: TripoFailure) {
    const message = failure.insufficientCredits
      ? 'Tripo has insufficient available API credits to start this generation.'
      : failure.upstreamMessage || `Tripo ${operationLabel(failure.operation)} request failed.`;
    super(message);
    this.name = 'TripoApiError';
    this.operation = failure.operation;
    this.responseStatus = failure.responseStatus;
    this.upstreamStatus = failure.upstreamStatus;
    this.upstreamCode = failure.upstreamCode;
    this.upstreamMessage = failure.upstreamMessage;
    this.insufficientCredits = failure.insufficientCredits ?? false;
  }
}

function apiKey(): string {
  const key = process.env.TRIPO_API_KEY?.trim();
  if (!key) {
    const error = new Error('Tripo API is not configured on the server.');
    Object.assign(error, { status: 503 });
    throw error;
  }
  return key;
}

async function requestJson<T>(url: string, init: RequestInit, operation: TripoOperation): Promise<T> {
  const key = apiKey();
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TRIPO_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${key}`, ...init.headers },
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new TripoApiError({
      operation,
      responseStatus: timedOut ? 504 : 502,
      upstreamMessage: timedOut
        ? `Tripo ${operationLabel(operation)} request timed out.`
        : `Could not reach Tripo during ${operationLabel(operation)}.`,
    });
  }

  const body = await response.json().catch(() => undefined) as {
    code?: unknown;
    message?: unknown;
    error?: { code?: unknown; message?: unknown };
    data?: T;
  } | undefined;
  const rawCode = body?.code ?? body?.error?.code;
  const upstreamCode = typeof rawCode === 'number' || typeof rawCode === 'string' ? rawCode : undefined;
  const rawMessage = body?.message ?? body?.error?.message;
  const upstreamMessage = typeof rawMessage === 'string' ? sanitizeUpstreamMessage(rawMessage, key) : undefined;
  if (!response.ok || !body || rawCode !== 0 || body.data === undefined) {
    const insufficientCredits = rawCode === 2010 || rawCode === '2010';
    throw new TripoApiError({
      operation,
      responseStatus: response.status >= 400 && response.status <= 599 ? response.status : 502,
      upstreamStatus: response.status,
      upstreamCode,
      upstreamMessage,
      insufficientCredits,
    });
  }
  return body.data;
}

function operationLabel(operation: TripoOperation): string {
  if (operation === 'file_upload') return 'file upload';
  if (operation === 'task_creation') return 'image-to-model task creation';
  return 'task status';
}

function sanitizeUpstreamMessage(message: string, key: string): string | undefined {
  let safe = message
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(api[ _-]?key|authorization|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/https?:\/\/\S+/gi, '[URL redacted]');
  if (key) safe = safe.split(key).join('[redacted]');
  safe = safe.replace(/\s+/g, ' ').trim().slice(0, 300);
  return safe || undefined;
}

function malformedResponse(operation: TripoOperation, message: string): TripoApiError {
  return new TripoApiError({ operation, responseStatus: 502, upstreamMessage: message });
}

export async function uploadImage(image: Express.Multer.File): Promise<string> {
  const form = new FormData();
  const imageBytes = new Uint8Array(image.buffer.byteLength);
  imageBytes.set(image.buffer);
  form.append('file', new Blob([imageBytes], { type: image.mimetype }), image.originalname);
  const data = await requestJson<{ file_token: string }>(`${TRIPO_BASE_URL}/files`, { method: 'POST', body: form }, 'file_upload');
  if (typeof data.file_token !== 'string' || data.file_token.length === 0) {
    throw malformedResponse('file_upload', 'Tripo upload response did not include a file token.');
  }
  return data.file_token;
}

export async function createImageToModelTask(fileToken: string): Promise<string> {
  const data = await requestJson<{ task_id: string }>(`${TRIPO_BASE_URL}/generation/image-to-model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: fileToken, model: process.env.TRIPO_MODEL || 'v3.1-20260211' }),
  }, 'task_creation');
  if (typeof data.task_id !== 'string' || data.task_id.length === 0) {
    throw malformedResponse('task_creation', 'Tripo task response did not include a task ID.');
  }
  return data.task_id;
}

export async function getTripoTask(taskId: string): Promise<TripoTaskResponse> {
  const data = await requestJson<TripoTaskResponse>(`${TRIPO_BASE_URL}/tasks/${encodeURIComponent(taskId)}`, { method: 'GET' }, 'task_status');
  if (typeof data.status !== 'string' || typeof data.progress !== 'number') {
    throw malformedResponse('task_status', 'Tripo task status response was incomplete.');
  }
  return data;
}
