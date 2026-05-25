/**
 * In-memory TTL cache untuk hasil panggilan ke ditznesia.
 *
 * Tujuan: kurangin request ke ditznesia (rate limit cloudflare).
 * Multiple call ke `mars.getHistory()` atau `mars.listServices(N)` dalam
 * window TTL bakal pake cache, gak hit ditznesia.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  pending?: Promise<T>; // request in-flight, dedupe concurrent calls
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Get cached value atau panggil loader (yang akan di-cache).
 *
 * - Kalau ada entry fresh → return cached value
 * - Kalau ada in-flight request untuk key yang sama → tunggu hasilnya (dedupe)
 * - Kalau gak ada / expired → panggil loader, simpan hasil
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;

  // Fresh cache hit
  if (entry && entry.expiresAt > now) {
    return entry.value;
  }
  // In-flight request: dedupe
  if (entry?.pending) {
    return entry.pending;
  }

  // Fetch baru
  const promise = loader().then(
    (value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    },
    (err) => {
      // Hapus pending biar request berikutnya bisa retry
      const e = store.get(key) as CacheEntry<T> | undefined;
      if (e) e.pending = undefined;
      throw err;
    }
  );

  // Simpan in-flight
  store.set(key, {
    value: entry?.value as T,
    expiresAt: entry?.expiresAt ?? 0,
    pending: promise,
  });

  return promise;
}

export function invalidate(keyOrPrefix: string, isPrefix = false): void {
  if (!isPrefix) {
    store.delete(keyOrPrefix);
    return;
  }
  for (const k of store.keys()) {
    if (k.startsWith(keyOrPrefix)) store.delete(k);
  }
}

export function setCacheValue<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function getCachedValue<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.value;
}

// Cache keys
export const CACHE_KEYS = {
  HISTORY_PAGE_1: "ditz:history:p1",
  SERVICES: (countryId: number) => `ditz:services:${countryId}`,
} as const;
