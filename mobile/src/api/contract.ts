/**
 * Mobile-side view of the generation API.
 *
 * SOURCE OF TRUTH: shared/contracts.ts (owned by the backend teammate). That file did not exist
 * yet when this was written, so these types mirror the agreed endpoints. When shared/contracts.ts
 * lands, re-export its types from here and delete the local definitions — screens only import
 * from this module, so nothing else changes.
 *
 *   POST /api/generations             multipart/form-data, field "image"  -> GenerationRecord
 *   GET  /api/generations/:id                                             -> GenerationRecord
 *   GET  /api/generations/:id/model                                       -> model/gltf-binary (GLB)
 */
/** Multipart field name for the uploaded image. Confirm against shared/contracts.ts. */
export const IMAGE_FIELD = 'image';

export type GenerationStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface GenerationRecord {
  id: string;
  status: GenerationStatus;
  /** 0..100 when the provider reports it */
  progress?: number;
  error?: string;
  createdAt?: string;
}

const STATUSES: GenerationStatus[] = ['queued', 'processing', 'succeeded', 'failed'];

/** Defensive parse: never trust the network shape blindly. */
export function parseGenerationRecord(raw: unknown): GenerationRecord {
  const o = (raw ?? {}) as Record<string, unknown>;
  // Accept either a bare record or { generation: record }.
  const r = (o.generation && typeof o.generation === 'object' ? o.generation : o) as Record<string, unknown>;
  const id = r.id ?? r.generationId;
  const status = r.status;
  if (typeof id !== 'string' || !id) throw new Error('Server response is missing a generation id');
  if (typeof status !== 'string' || !STATUSES.includes(status as GenerationStatus)) {
    throw new Error(`Server returned an unknown status: ${String(status)}`);
  }
  return {
    id,
    status: status as GenerationStatus,
    progress: typeof r.progress === 'number' ? r.progress : undefined,
    error: typeof r.error === 'string' ? r.error : typeof r.message === 'string' ? (r.message as string) : undefined,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : undefined,
  };
}
