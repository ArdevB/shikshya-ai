import type { ApiErrorBody, LoginResponse } from '@shikshya/shared';

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';

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

/** The access token is only kept in memory. The refresh cookie restores it after a reload. */
let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

let onSessionExpired: () => void = () => undefined;
export const setSessionExpiredHandler = (handler: () => void) => {
  onSessionExpired = handler;
};

async function toApiError(response: Response) {
  let body: Partial<ApiErrorBody> = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // The server sent no JSON, for example a proxy error. The fallback below covers it.
  }
  return new ApiError(
    response.status,
    body.error?.code ?? 'UNKNOWN',
    body.error?.message ?? 'Something went wrong. Please try again.',
    body.error?.details,
  );
}

let refreshing: Promise<LoginResponse> | null = null;

/**
 * Gets a new access token using the refresh cookie. Several requests can fail at once
 * when a token expires, so they share one refresh rather than each trying their own.
 */
export function refreshSession(): Promise<LoginResponse> {
  refreshing ??= fetch(`${BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (response) => {
      if (!response.ok) throw await toApiError(response);
      const session = (await response.json()) as LoginResponse;
      accessToken = session.accessToken;
      return session;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Set for login, where a 401 means "wrong password", not "session expired". */
  skipRefresh?: boolean;
}

async function send(path: string, { method = 'GET', body }: RequestOptions) {
  const isForm = body instanceof FormData;
  return fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options);

  if (response.status === 401 && !options.skipRefresh) {
    try {
      await refreshSession();
    } catch {
      accessToken = null;
      onSessionExpired();
      throw await toApiError(response);
    }
    response = await send(path, options);
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, options?: Pick<RequestOptions, 'skipRefresh'>) =>
    request<T>(path, { method: 'POST', body, ...options }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
};

/** Fetches a protected file with the user's token, then hands it to the browser as a download. */
export async function downloadFile(path: string, filename: string) {
  let response = await send(path, {});
  if (response.status === 401) {
    await refreshSession();
    response = await send(path, {});
  }
  if (!response.ok) throw await toApiError(response);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Builds "?a=1&b=2", leaving out empty values. */
export function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
