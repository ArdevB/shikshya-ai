/**
 * A small in-memory cache for dashboard cards, which are read often and may be a minute old.
 * One API process is enough for a single college. Several processes would each keep their
 * own copy, which at worst means slightly different numbers for up to a minute.
 */
const DEFAULT_TTL_MS = 60_000;

const entries = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

export function cached<T>(key: string, load: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expiresAt > now) return hit.value as Promise<T>;

  // The promise is stored, so requests arriving during a slow load share it.
  const value = load().catch((error: unknown) => {
    entries.delete(key);
    throw error;
  });
  entries.set(key, { expiresAt: now + ttlMs, value });
  return value;
}

export function clearCache() {
  entries.clear();
}
