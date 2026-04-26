/**
 * User creation rate limit configuration.
 *
 * Priority:
 *   1. USER_CREATION_RATE_LIMIT env var — overrides everything
 *   2. app_config DB row (userCreationRateLimit column)
 *   3. Default: 5 accounts per hour
 *
 * Min: 0 (disabled — blocks all creation), Max: 128.
 */

const DEFAULT_LIMIT = 5;
const MIN_LIMIT = 0;
const MAX_LIMIT = 128;

let _cached: number | null = null;

export async function getUserCreationRateLimit(): Promise<number> {
  if (process.env.USER_CREATION_RATE_LIMIT !== undefined) {
    const n = parseInt(process.env.USER_CREATION_RATE_LIMIT, 10);
    if (!isNaN(n)) return clamp(n);
  }

  if (_cached !== null) return _cached;

  try {
    const { db } = await import("@/lib/db");
    const { appConfig } = await import("@/lib/db/schema");
    const rows = await db
      .select({ userCreationRateLimit: appConfig.userCreationRateLimit })
      .from(appConfig)
      .limit(1);
    _cached = clamp(rows[0]?.userCreationRateLimit ?? DEFAULT_LIMIT);
  } catch {
    _cached = DEFAULT_LIMIT;
  }

  return _cached;
}

export function _resetUserCreationRateLimitCache(): void {
  _cached = null;
}

function clamp(n: number): number {
  return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.round(n)));
}
