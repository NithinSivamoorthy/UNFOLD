import { Router } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { createGeneration, getGeneration, updateGeneration } from '../services/generation-store';
import { createImageToModelTask, getTripoTask, uploadImage } from '../services/tripo-service';
import { storeModel } from '../services/model-storage';
import type { ApiError, CreateGenerationResponse, GenerationStatusResponse } from '../../../shared/contracts';

export const generationsRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  fileFilter: (_request, file, callback) => {
    const valid = ['image/jpeg', 'image/png'].includes(file.mimetype);
    if (!valid) {
      const error = new Error('Upload a JPEG or PNG image.');
      Object.assign(error, { status: 400 });
      callback(error);
      return;
    }
    callback(null, true);
  },
});

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Generation limit reached. Try again later.' } },
});

function sendError(response: import('express').Response, status: number, code: string, message: string): void {
  const body: ApiError = { error: { code, message } };
  response.status(status).json(body);
}

function hasValidImageSignature(file: Express.Multer.File): boolean {
  if (file.mimetype === 'image/jpeg') return file.buffer.length >= 3 && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
  return file.mimetype === 'image/png' && file.buffer.length >= 8 && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

generationsRouter.post('/', createLimiter, upload.single('image'), async (request, response, next) => {
  try {
    const image = request.file;
    if (!image) {
      sendError(response, 400, 'IMAGE_REQUIRED', 'Attach one JPEG or PNG file in the image form field.');
      return;
    }
    if (!hasValidImageSignature(image)) {
      sendError(response, 400, 'INVALID_IMAGE', 'The uploaded file contents do not match a JPEG or PNG image.');
      return;
    }

    const fileToken = await uploadImage(image);
    const tripoTaskId = await createImageToModelTask(fileToken);
    const generation = await createGeneration(tripoTaskId);
    const body: CreateGenerationResponse = {
      id: generation.id,
      status: generation.status,
      progress: generation.progress,
      createdAt: generation.createdAt,
    };
    response.status(202).json(body);
  } catch (error) {
    next(error);
  }
});

generationsRouter.get('/:id', async (request, response, next) => {
  try {
    const generation = await getGeneration(request.params.id);
    if (!generation) {
      sendError(response, 404, 'GENERATION_NOT_FOUND', 'Generation was not found or has expired.');
      return;
    }
    if (generation.status !== 'expired' && generation.status !== 'failed' && generation.status !== 'succeeded') {
      const task = await getTripoTask(generation.tripoTaskId);
      const status = mapStatus(task.status);
      await updateGeneration(generation.id, {
        status,
        progress: Math.max(0, Math.min(100, Math.floor(task.progress))),
        errorMessage: status === 'failed' || status === 'expired' ? task.error_message || `Tripo task ${task.status}.` : undefined,
        completedAt: status === 'succeeded' || status === 'failed' || status === 'expired' ? task.completed_at || new Date().toISOString() : undefined,
      });
    }

    const latest = (await getGeneration(generation.id))!;
    const body: GenerationStatusResponse = {
      id: latest.id,
      status: latest.status,
      progress: latest.progress,
      createdAt: latest.createdAt,
      ...(latest.completedAt ? { completedAt: latest.completedAt } : {}),
      ...(latest.errorMessage ? { errorMessage: latest.errorMessage } : {}),
      ...(latest.status === 'succeeded' ? { modelUrl: `/api/generations/${latest.id}/model` } : {}),
    };
    response.json(body);
  } catch (error) {
    next(error);
  }
});

generationsRouter.get('/:id/model', async (request, response, next) => {
  try {
    const generation = await getGeneration(request.params.id);
    if (!generation) {
      sendError(response, 404, 'GENERATION_NOT_FOUND', 'Generation was not found or has expired.');
      return;
    }

    if (generation.status === 'expired' || generation.status === 'failed') {
      sendError(response, 410, 'GENERATION_UNAVAILABLE', 'This generation has failed or expired.');
      return;
    }

    const task = await getTripoTask(generation.tripoTaskId);
    let status = mapStatus(task.status);
    await updateGeneration(generation.id, {
      status,
      progress: Math.max(0, Math.min(100, Math.floor(task.progress))),
      errorMessage: status === 'failed' || status === 'expired' ? task.error_message || `Tripo task ${task.status}.` : undefined,
      completedAt: status === 'succeeded' || status === 'failed' || status === 'expired' ? task.completed_at || new Date().toISOString() : undefined,
    });
    if (status !== 'succeeded') {
      sendError(response, status === 'failed' || status === 'expired' ? 410 : 409, status === 'failed' || status === 'expired' ? 'GENERATION_UNAVAILABLE' : 'GENERATION_NOT_READY', status === 'failed' || status === 'expired' ? 'This generation has failed or expired.' : 'The model is still being generated.');
      return;
    }

    const filePath = await storeModel(generation.id, task);
    await updateGeneration(generation.id, { modelPath: filePath });
    response.setHeader('Content-Type', 'model/gltf-binary');
    response.setHeader('Content-Disposition', `inline; filename="${generation.id}.glb"`);
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

function mapStatus(status: string): GenerationStatusResponse['status'] {
  if (status === 'queued' || status === 'running') return status;
  if (status === 'success') return 'succeeded';
  if (status === 'expired') return 'expired';
  if (status === 'failed' || status === 'cancelled' || status === 'banned') return 'failed';
  return 'running';
}
