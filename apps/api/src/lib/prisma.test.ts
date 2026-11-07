import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { isConnectionError, retryOnConnectionError } from './prisma.js';

const dropped = () =>
  Object.assign(new Error('Server has closed the connection.'), { code: 'P1017' });

describe('retryOnConnectionError', () => {
  it('tries again after a dropped connection', async () => {
    const run = vi.fn().mockRejectedValueOnce(dropped()).mockResolvedValue('rows');
    await expect(retryOnConnectionError(run, 2, 1)).resolves.toBe('rows');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retries, with the original error', async () => {
    const run = vi.fn().mockRejectedValue(dropped());
    await expect(retryOnConnectionError(run, 2, 1)).rejects.toMatchObject({ code: 'P1017' });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('does not retry a problem with the query itself', async () => {
    const error = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    const run = vi.fn().mockRejectedValue(error);
    await expect(retryOnConnectionError(run, 2, 1)).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('isConnectionError', () => {
  it('recognises connection failures only', () => {
    expect(isConnectionError(dropped())).toBe(true);
    expect(isConnectionError({ code: 'P2024' })).toBe(true);
    expect(isConnectionError({ code: 'P2025' })).toBe(false);
    expect(isConnectionError(new ApiError(400, 'BAD_REQUEST', 'No'))).toBe(false);
    expect(isConnectionError(null)).toBe(false);
  });
});

describe('errorHandler', () => {
  it('turns a dropped connection into a clear message, not a raw 500', async () => {
    const { Prisma } = await import('@prisma/client');
    const error = new Prisma.PrismaClientKnownRequestError('Server has closed the connection.', {
      code: 'P1017',
      clientVersion: 'test',
    });
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    errorHandler(error, {} as never, { status } as never, (() => undefined) as never);
    expect(status).toHaveBeenCalledWith(503);
    expect(json.mock.calls[0]![0].error.code).toBe('DATABASE_UNAVAILABLE');
    expect(json.mock.calls[0]![0].error.message).toContain('try again');
  });
});
