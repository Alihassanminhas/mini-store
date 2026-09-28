import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error('Request failed', error);

  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    response.status(409).json({ error: { code: 'CONFLICT', message: 'A record with those details already exists.' } });
    return;
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
    response.status(409).json({ error: { code: 'RELATED_RECORD_NOT_FOUND', message: 'A referenced record does not exist.' } });
    return;
  }
  if (typeof error === 'object' && error !== null && 'code' in error && (error.code === '23514' || error.code === '23502')) {
    response.status(400).json({ error: { code: 'INVALID_DATA', message: 'The submitted data does not satisfy the database rules.' } });
    return;
  }

  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'LIMIT_FILE_SIZE') {
    response.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'Images must be 5 MB or smaller.' } });
    return;
  }

  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error &&
    typeof error.statusCode === 'number'
      ? error.statusCode
      : 500;

  response.status(statusCode).json({
    error: {
      code: statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
      message: statusCode >= 500 ? 'An unexpected error occurred.' : String(error.message ?? 'Request failed.'),
    },
  });
};
