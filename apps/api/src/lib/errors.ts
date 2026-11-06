/** An error with a known HTTP status. The error handler turns it into `{ error: { ... } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Please log in') =>
  new ApiError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have access to this') =>
  new ApiError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Record') => new ApiError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, 'CONFLICT', message, details);
