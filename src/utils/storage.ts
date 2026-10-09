/**
 * Tiny localStorage-backed store for the offline-first patient history.
 *
 * Every call is synchronous and failure-tolerant: private-mode browsers and
 * quota errors must never break the app, so a failed write is swallowed and the
 * in-memory React state stays authoritative.
 */
const PREFIX = 'diagnosix.v1.';

export function loadJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled — keep running from memory.
  }
}

export function removeJson(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Ignore.
  }
}
