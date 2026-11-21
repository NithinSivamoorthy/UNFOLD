import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, createGeneration, downloadGenerationModel, waitForGeneration } from '@/api/client';
import { prepareImageForUpload } from './prepareImage';

export type PickedImage = { uri: string; width: number; height: number; mimeType?: string | null; fileName?: string | null };

/** Every phase maps to a real server/device state — nothing here is simulated. */
export type GenPhase =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'queued'; id: string }
  | { kind: 'processing'; id: string; progress?: number }
  | { kind: 'downloading'; id: string; progress?: number }
  | { kind: 'succeeded'; id: string; modelUri: string }
  | { kind: 'failed'; message: string; id?: string; retryable: boolean };

export function useGeneration() {
  const [phase, setPhase] = useState<GenPhase>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const start = useCallback(async (image: PickedImage) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    let id: string | undefined;
    try {
      setPhase({ kind: 'uploading' });
      let upload = image;
      try {
        upload = await prepareImageForUpload(image);
      } catch {
        // Fall back to the original file if re-encoding fails; the server can still accept it.
      }
      if (ctrl.signal.aborted) return;
      const created = await createGeneration(upload, ctrl.signal);
      id = created.id;
      setPhase(created.status === 'processing' ? { kind: 'processing', id, progress: created.progress } : { kind: 'queued', id });

      const final =
        created.status === 'succeeded' || created.status === 'failed'
          ? created
          : await waitForGeneration(
              id,
              (r) => {
                if (ctrl.signal.aborted) return;
                if (r.status === 'queued') setPhase({ kind: 'queued', id: r.id });
                else if (r.status === 'processing') setPhase({ kind: 'processing', id: r.id, progress: r.progress });
              },
              ctrl.signal
            );

      if (final.status === 'failed') {
        setPhase({ kind: 'failed', id, message: final.error || 'The AI couldn’t build a model from this image.', retryable: true });
        return;
      }
      setPhase({ kind: 'downloading', id });
      const doneId = id;
      const modelUri = await downloadGenerationModel(
        doneId,
        (f) => {
          if (!ctrl.signal.aborted && f != null) setPhase({ kind: 'downloading', id: doneId, progress: f * 100 });
        },
        ctrl.signal
      );
      if (!ctrl.signal.aborted) setPhase({ kind: 'succeeded', id, modelUri });
    } catch (e) {
      const err = e as ApiError;
      if (err.kind === 'cancelled') {
        setPhase({ kind: 'idle' });
        return;
      }
      setPhase({ kind: 'failed', id, message: err.message || 'Something went wrong.', retryable: err.kind !== 'config' });
    }
  }, []);

  const cancel = useCallback(() => {
    abort.current?.abort();
    setPhase({ kind: 'idle' });
  }, []);

  const reset = useCallback(() => setPhase({ kind: 'idle' }), []);

  return { phase, start, cancel, reset };
}

export const isBusy = (p: GenPhase) =>
  p.kind === 'uploading' || p.kind === 'queued' || p.kind === 'processing' || p.kind === 'downloading';
