/**
 * Simple in-memory rate limiter for admin API endpoints.
 *
 * Keyed by an arbitrary string (userId, ipHash, etc.).
 * No DB required — acceptable for low-volume admin operations.
 * Windows reset on server restart (also acceptable).
 */

interface Window {
  count: number;
  resetAt: number;
}

const _windows = new Map<string, Window>();

/**
 * Returns { blocked: true } when the key has exceeded maxRequests within windowMs.
 * Automatically creates / refreshes the window on each call.
 */
export function checkAdminRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { blocked: boolean; retryAfterMs: number } {
  const now = Date.now();
  const win = _windows.get(key);

  if (!win || now > win.resetAt) {
    _windows.set(key, { count: 1, resetAt: now + windowMs });
    return { blocked: false, retryAfterMs: 0 };
  }

  win.count++;
  if (win.count > maxRequests) {
    return { blocked: true, retryAfterMs: win.resetAt - now };
  }
  return { blocked: false, retryAfterMs: 0 };
}
