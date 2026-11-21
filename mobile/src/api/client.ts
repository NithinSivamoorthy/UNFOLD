import { Directory, File, Paths } from 'expo-file-system';

import { getApiBaseUrl, getDemoAuthToken, validateBaseUrl } from './config';
import { type GenerationRecord, IMAGE_FIELD, parseGenerationRecord } from './contract';
import { isGlbHeader } from './url';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'config' | 'network' | 'http' | 'timeout' | 'parse' | 'cancelled',
    readonly status?: number
  ) {
    super(message);
  }
}

async function baseUrl(): Promise<string> {
  const url = await getApiBaseUrl();
  const problem = validateBaseUrl(url);
  if (problem) throw new ApiError(problem, 'config');
  return url;
}

async function request(path: string, init: RequestInit & { timeoutMs?: number; signal?: AbortSignal } = {}) {
  const url = `${await baseUrl()}${path}`;
  const token = await getDemoAuthToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), init.timeoutMs ?? 20000);
  const onOuterAbort = () => ctrl.abort('cancelled');
  init.signal?.addEventListener('abort', onOuterAbort);
  try {
    const res = await fetch(url, { ...init, headers, signal: ctrl.signal });
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body?.error?.message ?? body?.error ?? body?.message ?? '';
      } catch {}
      throw new ApiError(detail || `Server responded ${res.status}`, 'http', res.status);
    }
    return res;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (ctrl.signal.aborted) {
      throw ctrl.signal.reason === 'cancelled'
        ? new ApiError('Cancelled', 'cancelled')
        : new ApiError('The server took too long to respond.', 'timeout');
    }
    throw new ApiError(`Can’t reach the UNFOLD server at ${url.split('/api')[0]}. Check that it’s running and on the same Wi-Fi.`, 'network');
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', onOuterAbort);
  }
}

async function readJson(res: Response): Promise<GenerationRecord> {
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) {
    // Typical when the URL points at a captive portal, a tunnel splash page, or the Expo dev server.
    throw new ApiError(`Expected JSON from the UNFOLD server but got "${type || 'unknown'}". Is the server address correct?`, 'parse');
  }
  try {
    return parseGenerationRecord(await res.json());
  } catch (e) {
    throw new ApiError((e as Error).message, 'parse');
  }
}

/** Health probe: only a real UNFOLD API ({ status: 'ok' } from /api/health) counts as connected. */
export async function pingServer(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await request('/api/health', { timeoutMs: 8000 });
    const body = await res.json().catch(() => null);
    if (body && body.status === 'ok') return { ok: true, message: 'Connected to the UNFOLD API.' };
    return { ok: false, message: 'Something answered at this address, but it isn’t the UNFOLD API.' };
  } catch (e) {
    const err = e as ApiError;
    if (err.kind === 'http') {
      return { ok: false, message: `Reached the address, but /api/health returned ${err.status}. Is this the UNFOLD API?` };
    }
    return { ok: false, message: err.message };
  }
}

export async function createGeneration(
  image: { uri: string; mimeType?: string | null; fileName?: string | null },
  signal?: AbortSignal
): Promise<GenerationRecord> {
  const form = new FormData();
  const type = image.mimeType || 'image/jpeg';
  const name = image.fileName || `capture.${type.split('/')[1] ?? 'jpg'}`;
  // React Native's FormData accepts a { uri, name, type } file descriptor.
  form.append(IMAGE_FIELD, { uri: image.uri, name, type } as unknown as Blob);
  const res = await request('/api/generations', { method: 'POST', body: form, timeoutMs: 90000, signal });
  return readJson(res);
}

export async function getGeneration(id: string, signal?: AbortSignal): Promise<GenerationRecord> {
  const res = await request(`/api/generations/${encodeURIComponent(id)}`, { signal });
  return readJson(res);
}

/** Poll until succeeded/failed. Transient network errors are retried a few times. */
export async function waitForGeneration(
  id: string,
  onUpdate: (r: GenerationRecord) => void,
  signal?: AbortSignal,
  { intervalMs = 2500, maxMinutes = 10 } = {}
): Promise<GenerationRecord> {
  const deadline = Date.now() + maxMinutes * 60_000;
  let transientFailures = 0;
  while (true) {
    if (signal?.aborted) throw new ApiError('Cancelled', 'cancelled');
    if (Date.now() > deadline) throw new ApiError('Generation is taking longer than expected.', 'timeout');
    try {
      const rec = await getGeneration(id, signal);
      transientFailures = 0;
      onUpdate(rec);
      if (rec.status === 'succeeded' || rec.status === 'failed') return rec;
    } catch (e) {
      const err = e as ApiError;
      if (err.kind === 'cancelled' || err.kind === 'config' || (err.kind === 'http' && err.status === 404)) throw err;
      if (++transientFailures > 4) throw err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

const generationsDir = () => new Directory(Paths.cache, 'generations');

/**
 * Downloads the real generated GLB to the cache and verifies it really is a GLB (magic bytes),
 * so an HTML error page can never reach the viewer. Returns the local file URI.
 */
export async function downloadGenerationModel(
  id: string,
  onProgress?: (fraction: number | null) => void,
  signal?: AbortSignal
): Promise<string> {
  const dir = generationsDir();
  dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `${id}.glb`);
  const url = `${await baseUrl()}/api/generations/${encodeURIComponent(id)}/model`;
  const token = await getDemoAuthToken();
  let file: File;
  try {
    file = await File.downloadFileAsync(url, dest, {
      idempotent: true,
      signal,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      onProgress: ({ bytesWritten, totalBytes }) => onProgress?.(totalBytes > 0 ? bytesWritten / totalBytes : null),
    });
  } catch (e) {
    if (signal?.aborted) throw new ApiError('Cancelled', 'cancelled');
    throw new ApiError(`Couldn’t download the 3D model: ${(e as Error).message}`, 'network');
  }
  if (!file.exists || !file.size) throw new ApiError('The server sent an empty model file.', 'parse');
  const handle = file.open();
  let header: Uint8Array;
  try {
    header = await handle.readBytes(4);
  } finally {
    handle.close();
  }
  if (!isGlbHeader(header)) {
    // Non-2xx responses land here too: surface the server's { error: { message } } when present.
    let detail = '';
    try {
      const body = JSON.parse(await file.text());
      detail = body?.error?.message ?? '';
    } catch {}
    file.delete();
    throw new ApiError(detail || 'The server’s model endpoint did not return a GLB file.', 'parse');
  }
  return file.uri;
}
