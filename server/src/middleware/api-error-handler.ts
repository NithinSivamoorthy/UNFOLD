import { ErrorRequestHandler } from 'express';
import multer from 'multer';
import type { ApiError } from '../../../shared/contracts';
import { TripoApiError } from '../services/tripo-service';

export const apiErrorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected server error occurred.';
  let upstream: ApiError['error']['upstream'];

  if (error instanceof TripoApiError) {
    status = error.responseStatus;
    code = error.insufficientCredits
      ? 'TRIPO_INSUFFICIENT_CREDITS'
      : `TRIPO_${error.operation.toUpperCase()}_FAILED`;
    message = error.message;
    upstream = {
      operation: error.operation,
      ...(error.upstreamStatus !== undefined ? { httpStatus: error.upstreamStatus } : {}),
      ...(error.upstreamCode !== undefined ? { code: error.upstreamCode } : {}),
      ...(error.upstreamMessage ? { message: error.upstreamMessage } : {}),
    };
  } else if (error instanceof multer.MulterError) {
    status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD';
    message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Image must be 20 MB or smaller.'
      : 'Upload exactly one image using the image form field.';
  } else if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
    status = error.status;
    code = status === 503 ? 'SERVICE_UNAVAILABLE' : status === 502 ? 'UPSTREAM_ERROR' : 'BAD_REQUEST';
    message = error.message;
  } else if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    status = 504;
    code = 'UPSTREAM_TIMEOUT';
    message = 'An upstream request timed out. Please retry later.';
  }

  const body: ApiError = { error: { code, message, ...(upstream ? { upstream } : {}) } };
  response.status(status).json(body);
};
