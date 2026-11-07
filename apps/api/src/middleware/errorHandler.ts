import { Prisma } from '@prisma/client';
import type { ApiErrorBody } from '@shikshya/shared';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ApiError } from '../lib/errors.js';
import { isConnectionError } from '../lib/prisma.js';

const inUse = () =>
  new ApiError(409, 'IN_USE', 'This record is linked to other records. Remove those first.');

/**
 * Postgres 18 reports a delete blocked by ON DELETE RESTRICT as 23001. Older versions said 23503,
 * which Prisma turns into P2003. Prisma 6 does not know the new code, so it arrives unrecognised.
 */
const isRestrictViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientUnknownRequestError && /\b23001\b/.test(error.message);

function fromPrismaError(error: Prisma.PrismaClientKnownRequestError): ApiError | null {
  if (isConnectionError(error)) {
    console.error(`Database connection problem: ${error.code}`);
    return new ApiError(
      503,
      'DATABASE_UNAVAILABLE',
      'The connection to the database dropped. Please try again.',
    );
  }
  switch (error.code) {
    case 'P2002': {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target.join(', ') : 'value';
      return new ApiError(409, 'CONFLICT', `A record with this ${fields} already exists`);
    }
    case 'P2003':
      return inUse();
    case 'P2025':
      return new ApiError(404, 'NOT_FOUND', 'Record not found');
    default:
      return null;
  }
}

export function notFoundHandler(req: Request, res: Response<ApiErrorBody>) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  });
}

// Express recognises error handlers by their four arguments, so `_next` has to stay.
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response<ApiErrorBody>,
  _next: NextFunction,
) {
  const known =
    error instanceof ApiError
      ? error
      : error instanceof Prisma.PrismaClientKnownRequestError
        ? fromPrismaError(error)
        : isRestrictViolation(error)
          ? inUse()
          : error instanceof multer.MulterError
          ? new ApiError(
              400,
              'UPLOAD_REJECTED',
              error.code === 'LIMIT_FILE_SIZE'
                ? 'Each file must be 10 MB or smaller'
                : error.message,
            )
          : null;

  if (known) {
    res.status(known.status).json({
      error: { code: known.code, message: known.message, details: known.details },
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  });
}
