import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';

import { isGlbHeader } from '@/api/url';

/**
 * On-device model library.
 *  - Files: <Documents>/models/<id>/{model.glb, source.jpg, thumb.jpg} — the Documents directory
 *    persists across app restarts and is never purged by iOS (unlike Caches).
 *  - Metadata: expo-sqlite table `models`. Only paths RELATIVE to Documents are stored, because the
 *    absolute container path can change between installs/updates.
 */
export type ModelOrigin = 'generated' | 'imported' | 'scan';

export interface SavedModel {
  id: string;
  name: string;
  createdAt: number;
  origin: ModelOrigin;
  generationId: string | null;
  dims: { x: number; y: number; z: number } | null;
  sizeBytes: number;
  glbUri: string;
  thumbUri: string | null;
  sourceUri: string | null;
  /** false when the GLB is missing on disk (e.g. deleted outside the app) */
  available: boolean;
}

type Row = {
  id: string;
  name: string;
  created_at: number;
  origin: string;
  generation_id: string | null;
  dims: string | null;
  size_bytes: number;
  has_thumb: number;
  has_source: number;
};

export class LibraryError extends Error {}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await SQLite.openDatabaseAsync('unfold.db');
      await d.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS models (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          origin TEXT NOT NULL,
          generation_id TEXT,
          dims TEXT,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          has_thumb INTEGER NOT NULL DEFAULT 0,
          has_source INTEGER NOT NULL DEFAULT 0
        );
      `);
      return d;
    })().catch((e) => {
      dbPromise = null; // allow a retry on the next call
      throw new LibraryError(`Couldn’t open the model library: ${(e as Error).message}`);
    });
  }
  return dbPromise;
}

const root = () => new Directory(Paths.document, 'models');
const modelDir = (id: string) => new Directory(Paths.document, 'models', id);
const glbFile = (id: string) => new File(modelDir(id), 'model.glb');
const thumbFile = (id: string) => new File(modelDir(id), 'thumb.jpg');
const sourceFile = (id: string) => new File(modelDir(id), 'source.jpg');

function toModel(r: Row): SavedModel {
  const glb = glbFile(r.id);
  const thumb = thumbFile(r.id);
  const src = sourceFile(r.id);
  let dims: SavedModel['dims'] = null;
  try {
    dims = r.dims ? JSON.parse(r.dims) : null;
  } catch {}
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    origin: (['generated', 'imported', 'scan'].includes(r.origin) ? r.origin : 'imported') as ModelOrigin,
    generationId: r.generation_id,
    dims,
    sizeBytes: r.size_bytes,
    glbUri: glb.uri,
    thumbUri: r.has_thumb && thumb.exists ? thumb.uri : null,
    sourceUri: r.has_source && src.exists ? src.uri : null,
    available: glb.exists,
  };
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export async function saveModel(input: {
  glbUri: string;
  name: string;
  origin: ModelOrigin;
  generationId?: string | null;
  sourceImageUri?: string | null;
  thumbBase64?: string | null;
  dims?: SavedModel['dims'];
}): Promise<SavedModel> {
  const d = await db();
  const id = newId();
  const dir = modelDir(id);
  try {
    const src = new File(input.glbUri);
    if (!src.exists) throw new LibraryError('The model file is no longer available to save.');
    const h = src.open();
    try {
      if (!isGlbHeader(await h.readBytes(4))) throw new LibraryError('This file is not a valid GLB model.');
    } finally {
      h.close();
    }
    if (Paths.availableDiskSpace > 0 && Paths.availableDiskSpace < (src.size ?? 0) * 2 + 5_000_000) {
      throw new LibraryError('Not enough free storage on this device to save the model.');
    }

    root().create({ intermediates: true, idempotent: true });
    dir.create({ intermediates: true, idempotent: true });
    await src.copy(glbFile(id));

    let hasThumb = 0;
    if (input.thumbBase64) {
      try {
        const t = thumbFile(id);
        t.create({ overwrite: true });
        await t.write(input.thumbBase64, { encoding: 'base64' });
        hasThumb = 1;
      } catch {} // thumbnail is optional
    }
    let hasSource = 0;
    if (input.sourceImageUri) {
      try {
        const s = new File(input.sourceImageUri);
        if (s.exists) {
          await s.copy(sourceFile(id));
          hasSource = 1;
        }
      } catch {} // source image is optional
    }

    const size = glbFile(id).size ?? 0;
    await d.runAsync(
      `INSERT INTO models (id, name, created_at, origin, generation_id, dims, size_bytes, has_thumb, has_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.name.trim() || 'Untitled model',
      Date.now(),
      input.origin,
      input.generationId ?? null,
      input.dims ? JSON.stringify(input.dims) : null,
      size,
      hasThumb,
      hasSource
    );
    const row = await d.getFirstAsync<Row>('SELECT * FROM models WHERE id = ?', id);
    if (!row) throw new LibraryError('Saved model could not be read back.');
    return toModel(row);
  } catch (e) {
    try {
      if (dir.exists) dir.delete();
    } catch {}
    if (e instanceof LibraryError) throw e;
    throw new LibraryError(`Couldn’t save the model: ${(e as Error).message}`);
  }
}

export async function listModels(): Promise<SavedModel[]> {
  const d = await db();
  const rows = await d.getAllAsync<Row>('SELECT * FROM models ORDER BY created_at DESC');
  return rows.map(toModel);
}

export async function getModel(id: string): Promise<SavedModel | null> {
  const d = await db();
  const row = await d.getFirstAsync<Row>('SELECT * FROM models WHERE id = ?', id);
  return row ? toModel(row) : null;
}

export async function renameModel(id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new LibraryError('Name can’t be empty.');
  const d = await db();
  await d.runAsync('UPDATE models SET name = ? WHERE id = ?', clean.slice(0, 80), id);
}

export async function deleteModel(id: string): Promise<void> {
  const d = await db();
  try {
    const dir = modelDir(id);
    if (dir.exists) dir.delete();
  } catch (e) {
    throw new LibraryError(`Couldn’t delete the model files: ${(e as Error).message}`);
  }
  await d.runAsync('DELETE FROM models WHERE id = ?', id);
}

/** Opens the iOS share sheet (AirDrop, Files, Mail…) with a copy named after the model. */
export async function shareModel(m: SavedModel): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new LibraryError('Sharing isn’t available on this device.');
  const src = glbFile(m.id);
  if (!src.exists) throw new LibraryError('The model file is missing from this device.');
  const dir = new Directory(Paths.cache, 'share');
  dir.create({ intermediates: true, idempotent: true });
  const safe = m.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'model';
  const out = new File(dir, `${safe}.glb`);
  if (out.exists) out.delete();
  await src.copy(out);
  await Sharing.shareAsync(out.uri, { dialogTitle: `Share ${m.name}` });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
