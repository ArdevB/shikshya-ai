import { env } from '../config/env.js';
import { ApiError, badRequest } from './errors.js';

const notRunning = () =>
  new ApiError(
    503,
    'AI_SERVICE_UNAVAILABLE',
    'The AI service is not running. Start it, then try again.',
  );

/** Longest a call may take. The timetable solver's own limit is 30 seconds. */
const TIMEOUT_MS = 90_000;

async function send(path: string, init: RequestInit): Promise<Response> {
  if (!env.INTERNAL_KEY) throw notRunning();
  let response: Response;
  try {
    response = await fetch(`${env.AI_SERVICE_URL}${path}`, {
      ...init,
      headers: { ...init.headers, 'X-Internal-Key': env.INTERNAL_KEY },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw notRunning();
  }
  if (response.ok) return response;

  const detail = await response
    .json()
    .then((body: { detail?: unknown }) => (typeof body.detail === 'string' ? body.detail : ''))
    .catch(() => '');

  if (response.status === 422) {
    throw badRequest(detail || 'The AI service could not use that input.');
  }
  if (detail === 'AI_NOT_CONFIGURED') {
    throw new ApiError(
      503,
      'AI_NOT_CONFIGURED',
      'Gemini is not set up yet. Add GEMINI_API_KEY to apps/api/.env and restart.',
    );
  }
  if (detail === 'AI_INVALID_OUTPUT') {
    throw new ApiError(
      502,
      'AI_INVALID_OUTPUT',
      'Gemini did not produce usable questions this time. Please try again.',
    );
  }
  if (detail === 'AI_UNAVAILABLE') {
    throw new ApiError(502, 'AI_UNAVAILABLE', 'Gemini could not be reached. Please try again.');
  }
  throw notRunning();
}

/** Calls the Python AI service. Only this API holds the shared secret. */
export async function callAiService<T>(path: string, body: unknown): Promise<T> {
  const response = await send(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

/** Gets the text out of an uploaded PDF, Word or text file. */
export async function extractDocumentText(file: Buffer, fileName: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(file)]), fileName);
  const response = await send('/documents/extract', { method: 'POST', body: form });
  return ((await response.json()) as { text: string }).text;
}
