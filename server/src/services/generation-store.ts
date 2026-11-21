import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GenerationRecord, GenerationStatus } from '../../../shared/contracts';

const GENERATION_TTL_MS = 24 * 60 * 60 * 1000;
const serverRoot = path.basename(path.resolve(__dirname, '../../..')) === 'dist'
  ? path.resolve(__dirname, '../../../../')
  : path.resolve(__dirname, '../..');
const DEFAULT_STORE_FILE = path.resolve(serverRoot, 'data', 'generations.json');
const records = new Map<string, GenerationRecord>();

let storeFile = DEFAULT_STORE_FILE;
let initialized = false;
let operationQueue: Promise<void> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(() => undefined, () => undefined);
  return result;
}

/** Load persistent records before the HTTP server begins accepting requests. */
export function initializeGenerationStore(filePath = DEFAULT_STORE_FILE): Promise<void> {
  return serialize(async () => {
    if (initialized) return;
    storeFile = path.resolve(filePath);
    await mkdir(path.dirname(storeFile), { recursive: true });

    let contents: string;
    try {
      contents = await readFile(storeFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      records.clear();
      initialized = true;
      await persistRecords();
      return;
    }

    if (!contents.trim()) {
      records.clear();
      initialized = true;
      await persistRecords();
      return;
    }

    const parsed: unknown = JSON.parse(contents);
    if (!Array.isArray(parsed)) throw new Error('Generation storage must contain a JSON array.');
    records.clear();
    for (const candidate of parsed) {
      const record = deserializeRecord(candidate);
      if (record) records.set(record.id, record);
    }
    initialized = true;
    // Rewrite the allowlisted record shape to discard unknown or sensitive fields.
    await persistRecords();
  });
}

export function createGeneration(tripoTaskId: string): Promise<GenerationRecord> {
  return serialize(async () => {
    assertInitialized();
    const previousRecords = new Map(records);
    const nowMs = Date.now();
    for (const [id, record] of records) {
      if (nowMs >= Date.parse(record.expiresAt)) records.delete(id);
    }

    const now = new Date(nowMs).toISOString();
    const generation: GenerationRecord = {
      id: randomUUID(),
      tripoTaskId,
      status: 'queued',
      progress: 0,
      createdAt: now,
      expiresAt: new Date(nowMs + GENERATION_TTL_MS).toISOString(),
    };
    records.set(generation.id, generation);
    try {
      await persistRecords();
    } catch (error) {
      restoreRecords(previousRecords);
      throw error;
    }
    return cloneRecord(generation);
  });
}

export function getGeneration(id: string): Promise<GenerationRecord | undefined> {
  return serialize(async () => {
    assertInitialized();
    const record = records.get(id);
    if (!record) return undefined;
    if (Date.now() >= Date.parse(record.expiresAt) && record.status !== 'expired') {
      const previous = cloneRecord(record);
      record.status = 'expired';
      record.progress = Math.min(record.progress, 99);
      record.errorMessage = 'Generation record expired after 24 hours.';
      try {
        await persistRecords();
      } catch (error) {
        records.set(id, previous);
        throw error;
      }
    }
    return cloneRecord(record);
  });
}

export function updateGeneration(
  id: string,
  update: Partial<Pick<GenerationRecord, 'status' | 'progress' | 'errorMessage' | 'completedAt' | 'modelPath'>>,
): Promise<GenerationRecord | undefined> {
  return serialize(async () => {
    assertInitialized();
    const record = records.get(id);
    if (!record) return undefined;
    if (Date.now() >= Date.parse(record.expiresAt)) {
      const previous = cloneRecord(record);
      record.status = 'expired';
      record.progress = Math.min(record.progress, 99);
      record.errorMessage = 'Generation record expired after 24 hours.';
      try {
        await persistRecords();
      } catch (error) {
        records.set(id, previous);
        throw error;
      }
      return cloneRecord(record);
    }

    const previous = cloneRecord(record);
    const currentIsTerminal = isTerminal(record.status);
    if (!currentIsTerminal) {
      if (update.status && statusRank(update.status) >= statusRank(record.status)) record.status = update.status;
      if (typeof update.progress === 'number') record.progress = Math.max(record.progress, Math.min(100, update.progress));
      if (update.errorMessage !== undefined) record.errorMessage = cleanMessage(update.errorMessage);
      if (update.completedAt !== undefined) record.completedAt = update.completedAt;
    }
    // Model paths are process-local implementation details; never write them to the JSON store.
    if (update.modelPath !== undefined) record.modelPath = update.modelPath;

    try {
      await persistRecords();
    } catch (error) {
      records.set(id, previous);
      throw error;
    }
    return cloneRecord(record);
  });
}

function assertInitialized(): void {
  if (!initialized) throw new Error('Generation storage has not been initialized.');
}

function isTerminal(status: GenerationStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'expired';
}

function statusRank(status: GenerationStatus): number {
  if (status === 'queued') return 0;
  if (status === 'running') return 1;
  return 2;
}

function cloneRecord(record: GenerationRecord): GenerationRecord {
  return { ...record };
}

function restoreRecords(snapshot: Map<string, GenerationRecord>): void {
  records.clear();
  for (const [id, record] of snapshot) records.set(id, record);
}

function cleanMessage(message: string): string {
  const apiKey = process.env.TRIPO_API_KEY?.trim();
  let safe = message
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(api[ _-]?key|authorization|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/https?:\/\/\S+/gi, '[URL redacted]');
  if (apiKey) safe = safe.split(apiKey).join('[redacted]');
  return safe.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function deserializeRecord(value: unknown): GenerationRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<GenerationRecord>;
  const statuses: GenerationStatus[] = ['queued', 'running', 'succeeded', 'failed', 'expired'];
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.tripoTaskId !== 'string' ||
    typeof candidate.status !== 'string' || !statuses.includes(candidate.status as GenerationStatus) ||
    typeof candidate.progress !== 'number' || !Number.isFinite(candidate.progress) ||
    typeof candidate.createdAt !== 'string' || !Number.isFinite(Date.parse(candidate.createdAt)) ||
    typeof candidate.expiresAt !== 'string' || !Number.isFinite(Date.parse(candidate.expiresAt))
  ) return undefined;

  return {
    id: candidate.id,
    tripoTaskId: candidate.tripoTaskId,
    status: candidate.status as GenerationStatus,
    progress: Math.max(0, Math.min(100, candidate.progress)),
    createdAt: candidate.createdAt,
    expiresAt: candidate.expiresAt,
    ...(typeof candidate.completedAt === 'string' ? { completedAt: candidate.completedAt } : {}),
    ...(typeof candidate.errorMessage === 'string' ? { errorMessage: cleanMessage(candidate.errorMessage) } : {}),
  };
}

async function persistRecords(): Promise<void> {
  await mkdir(path.dirname(storeFile), { recursive: true });
  const snapshot = JSON.stringify([...records.values()].map((record) => ({
    id: record.id,
    tripoTaskId: record.tripoTaskId,
    status: record.status,
    progress: record.progress,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    ...(record.completedAt ? { completedAt: record.completedAt } : {}),
    ...(record.errorMessage ? { errorMessage: cleanMessage(record.errorMessage) } : {}),
  })), null, 2);
  const temporaryFile = `${storeFile}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryFile, snapshot, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryFile, storeFile);
  } catch (error) {
    await rm(temporaryFile, { force: true });
    throw error;
  }
}
