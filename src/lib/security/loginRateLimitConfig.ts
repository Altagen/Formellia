/**
 * Login rate limit configuration — reads from app_config, cached in memory.
 *
 * Defaults: 10 attempts per 15-minute window.
 * Can be overridden via env vars LOGIN_RATE_LIMIT_MAX_ATTEMPTS and LOGIN_RATE_LIMIT_WINDOW_MINUTES.
 */

interface LoginRateLimitConfig {
  maxAttempts: number;
  windowMinutes: number;
}

const DEFAULTS: LoginRateLimitConfig = { maxAttempts: 10, windowMinutes: 15 };

let _cached: LoginRateLimitConfig | null = null;

export async function getLoginRateLimitConfig(): Promise<LoginRateLimitConfig> {
  const envMax  = process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
  const envWin  = process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES;
  if (envMax !== undefined || envWin !== undefined) {
    const maxAttempts    = envMax  ? Math.max(1, Math.min(200, parseInt(envMax,  10) || DEFAULTS.maxAttempts))    : DEFAULTS.maxAttempts;
    const windowMinutes  = envWin  ? Math.max(1, Math.min(1440, parseInt(envWin, 10) || DEFAULTS.windowMinutes)) : DEFAULTS.windowMinutes;
    return { maxAttempts, windowMinutes };
  }

  if (_cached !== null) return _cached;

  try {
    const { db }       = await import("@/lib/db");
    const { appConfig } = await import("@/lib/db/schema");
    const rows = await db
      .select({ loginRateLimitMaxAttempts: appConfig.loginRateLimitMaxAttempts, loginRateLimitWindowMinutes: appConfig.loginRateLimitWindowMinutes })
      .from(appConfig)
      .limit(1);
    const row = rows[0];
    _cached = {
      maxAttempts:   row?.loginRateLimitMaxAttempts   ?? DEFAULTS.maxAttempts,
      windowMinutes: row?.loginRateLimitWindowMinutes ?? DEFAULTS.windowMinutes,
    };
  } catch {
    _cached = { ...DEFAULTS };
  }

  return _cached;
}

export function _resetLoginRateLimitConfigCache(): void {
  _cached = null;
}
