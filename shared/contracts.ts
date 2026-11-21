export type GenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'expired';

export interface ApiError {
  error: {
    code: string;
    message: string;
    upstream?: {
      operation: 'file_upload' | 'task_creation' | 'task_status';
      httpStatus?: number;
      code?: number | string;
      message?: string;
    };
  };
}

export interface HealthResponse {
  status: 'ok';
}

export interface CreateGenerationResponse {
  id: string;
  status: GenerationStatus;
  progress: number;
  createdAt: string;
}

export interface GenerationStatusResponse extends CreateGenerationResponse {
  completedAt?: string;
  errorMessage?: string;
  modelUrl?: string;
}

export interface GenerationRecord extends CreateGenerationResponse {
  tripoTaskId: string;
  expiresAt: string;
  completedAt?: string;
  errorMessage?: string;
  modelPath?: string;
}

/** Shape of the data object returned by Tripo v3 GET /tasks/{task_id}. */
export interface TripoTaskResponse {
  task_id: string;
  type: string;
  status: string;
  progress: number;
  error_code?: number;
  error_message?: string;
  output?: {
    model_url?: string;
    [key: string]: unknown;
  };
  created_at: string;
  completed_at?: string;
}
