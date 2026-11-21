import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { TripoTaskResponse } from '../../../shared/contracts';

const MODEL_DIR = path.resolve(process.cwd(), 'models');
const MAX_MODEL_BYTES = 512 * 1024 * 1024;
const downloads = new Map<string, Promise<string>>();

function upstreamError(message: string): Error {
  const error = new Error(message);
  Object.assign(error, { status: 502 });
  return error;
}

export function storeModel(generationId: string, task: TripoTaskResponse): Promise<string> {
  const currentDownload = downloads.get(generationId);
  if (currentDownload) return currentDownload;
  const download = downloadAndStore(generationId, task).finally(() => downloads.delete(generationId));
  downloads.set(generationId, download);
  return download;
}

async function downloadAndStore(generationId: string, task: TripoTaskResponse): Promise<string> {
  const url = task.output?.model_url;
  if (!url) throw upstreamError('Tripo task succeeded without a model URL.');
  const parsed = new URL(url);
  console.log(`Tripo model download hostname: ${parsed.hostname}`);
  if (parsed.protocol !== 'https:' || !(parsed.hostname === 'tripo3d.ai' || parsed.hostname.endsWith('.tripo3d.ai'))) {
    throw upstreamError('Tripo returned an unsafe model URL.');
  }

  const destination = path.join(MODEL_DIR, `${generationId}.glb`);
  try {
    await stat(destination);
    return destination;
  } catch {
    // Download only when no stored model exists.
  }

  const response = await fetch(parsed, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw upstreamError(`Model download failed (HTTP ${response.status}).`);
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MODEL_BYTES) {
    throw upstreamError('Generated model exceeds the 512 MB storage limit.');
  }

  await mkdir(MODEL_DIR, { recursive: true });
  const temporary = `${destination}.part`;
  let total = 0;
  const prefix: number[] = [];
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      for (let i = 0; i < chunk.length && prefix.length < 4; i += 1) prefix.push(chunk[i]);
      if (total > MAX_MODEL_BYTES) return callback(upstreamError('Generated model exceeds the 512 MB storage limit.'));
      callback(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), limiter, createWriteStream(temporary, { flags: 'w' }));
    if (Buffer.from(prefix).toString('ascii') !== 'glTF') throw upstreamError('Tripo output is not a valid GLB file.');
    await rename(temporary, destination);
    return destination;
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
