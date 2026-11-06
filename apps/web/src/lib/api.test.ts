import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, queryString, setAccessToken, setSessionExpiredHandler } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const fetchMock = vi.fn<typeof fetch>();
const calledPaths = () => fetchMock.mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setAccessToken('expired');
  setSessionExpiredHandler(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('sends the access token', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await api.get('/thing');
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.headers).toMatchObject({ Authorization: 'Bearer expired' });
  });

  it('refreshes once on a 401 and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }))
      .mockResolvedValueOnce(json(200, { accessToken: 'fresh', user: {} }))
      .mockResolvedValueOnce(json(200, { value: 1 }));

    await expect(api.get('/thing')).resolves.toEqual({ value: 1 });
    expect(calledPaths()).toEqual(['/api/v1/thing', '/api/v1/auth/refresh', '/api/v1/thing']);
    expect(fetchMock.mock.calls[2]![1]!.headers).toMatchObject({
      Authorization: 'Bearer fresh',
    });
  });

  it('shares one refresh between requests that fail together', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/auth/refresh')) return json(200, { accessToken: 'fresh', user: {} });
      const headers = init?.headers as Record<string, string>;
      return headers.Authorization === 'Bearer fresh'
        ? json(200, { path })
        : json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } });
    });

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(calledPaths().filter((p) => p.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('reports an expired session when the refresh fails', async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }))
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }));

    await expect(api.get('/thing')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledOnce();
  });

  it('does not refresh when told not to, so a wrong password stays a wrong password', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' } }),
    );
    await expect(api.post('/auth/login', {}, { skipRefresh: true })).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Incorrect email or password',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('copes with an error that is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }));
    await expect(api.get('/thing')).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' });
  });
});

describe('queryString', () => {
  it('leaves out empty values', () => {
    expect(queryString({ a: 1, b: '', c: undefined, d: 'x' })).toBe('?a=1&d=x');
    expect(queryString({ a: '' })).toBe('');
  });
});
