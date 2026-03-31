/**
 * Session duration configuration.
 *
 * Priority:
 *   1. SESSION_DURATION_DAYS env var — overrides everything
 *   2. app_config DB row (sessionDurationDays column)
 *   3. Default: 30 days
 *
 * Min: 1 day, Max: 365 days.
 */

const DEFAULT_DURATION = 30;
const MIN_DURATION = 1;
const MAX_DURATION = 365;

let _cached: number | null = null;

export async function getSessionDurationDays(): Promise<number> {
  if (process.env.SESSION_DURATION_DAYS !== undefined) {
    const n = parseInt(process.env.SESSION_DURATION_DAYS, 10);
    if (!isNaN(n)) return clamp(n);
  }

  if (_cached !== null) return _cached;

  try {
    const { db } = await import("@/lib/db");
    const { appConfig } = await import("@/lib/db/schema");
    const rows = await db
      .select({ sessionDurationDays: appConfig.sessionDurationDays })
      .from(appConfig)
      .limit(1);
    _cached = clamp(rows[0]?.sessionDurationDays ?? DEFAULT_DURATION);
  } catch {
    _cached = DEFAULT_DURATION;
  }

  return _cached;
}

export function _resetSessionDurationCache(): void {
  _cached = null;
}

function clamp(n: number): number {
  return Math.max(MIN_DURATION, Math.min(MAX_DURATION, Math.round(n)));
}
