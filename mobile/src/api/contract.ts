import type { GenerationStatus as BackendGenerationStatus } from '../../../shared/contracts';

export type {
  ApiError,
  CreateGenerationResponse,
  GenerationStatus,
  GenerationStatusResponse,
  HealthResponse,
  GenerationRecord as BackendGenerationRecord,
  TripoTaskResponse,
} from '../../../shared/contracts';

/** Status shape consumed by the mobile generation flow. */
export type MobileGenerationStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

/** Mobile adapter record; backend fields are normalized by parseGenerationRecord. */
export interface GenerationRecord {
  id: string;
  status: MobileGenerationStatus;
  /** 0..100 when the provider reports it. */
  progress?: number;
  error?: string;
  createdAt?: string;
}

const BACKEND_STATUSES: readonly BackendGenerationStatus[] = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'expired',
];

/** Convert the backend response into the smaller status shape used in the app. */
export function parseGenerationRecord(raw: unknown): GenerationRecord {
  const object = (raw ?? {}) as Record<string, unknown>;
  // Accept either a bare record or the legacy { generation: record } wrapper.
  const record = (object.generation && typeof object.generation === 'object'
    ? object.generation
    : object) as Record<string, unknown>;
  const id = record.id ?? record.generationId;
  const status = record.status;

  if (typeof id !== 'string' || !id) throw new Error('Server response is missing a generation id');
  if (typeof status !== 'string' || !BACKEND_STATUSES.includes(status as BackendGenerationStatus)) {
    throw new Error(`Server returned an unknown status: ${String(status)}`);
  }

  const backendStatus = status as BackendGenerationStatus;
  const mobileStatus: MobileGenerationStatus = backendStatus === 'running'
    ? 'processing'
    : backendStatus === 'expired'
      ? 'failed'
      : backendStatus;

  return {
    id,
    status: mobileStatus,
    progress: typeof record.progress === 'number' ? record.progress : undefined,
    error: typeof record.errorMessage === 'string'
      ? record.errorMessage
      : typeof record.error === 'string'
        ? record.error
        : typeof record.message === 'string'
          ? record.message
          : undefined,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : undefined,
  };
}
