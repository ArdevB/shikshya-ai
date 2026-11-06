import type { Request } from 'express';
import type { z, ZodTypeAny } from 'zod';
import { ApiError } from '../lib/errors.js';

function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Please check the highlighted fields',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data as z.output<S>;
}

export const parseBody = <S extends ZodTypeAny>(req: Request, schema: S) => parse(schema, req.body);
export const parseQuery = <S extends ZodTypeAny>(req: Request, schema: S) =>
  parse(schema, req.query);

/** A required route parameter such as `:id`. Express always provides these as strings here. */
export const param = (req: Request, name: string) => String(req.params[name]);
