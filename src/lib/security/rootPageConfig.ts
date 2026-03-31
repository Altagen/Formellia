/**
 * Root page configuration.
 *
 * When useCustomRoot is false (default), the public "/" route renders the
 * built-in welcome page. No form can claim the slug "/".
 *
 * When useCustomRoot is true, a form instance with slug "/" is served instead.
 *
 * Priority:
 *   1. app_config DB row (useCustomRoot column)
 *   2. Default: false
 */

let _cached: boolean | null = null;

export async function getUseCustomRoot(): Promise<boolean> {
  if (_cached !== null) return _cached;

  try {
    const { db } = await import("@/lib/db");
    const { appConfig } = await import("@/lib/db/schema");
    const rows = await db
      .select({ useCustomRoot: appConfig.useCustomRoot })
      .from(appConfig)
      .limit(1);
    _cached = rows[0]?.useCustomRoot ?? false;
  } catch (err) {
    void import("@/lib/logger").then(({ configLogger }) => configLogger.error({ err }, "Failed to read useCustomRoot from DB"));
    _cached = false;
  }

  return _cached;
}

export function _resetUseCustomRootCache(): void {
  _cached = null;
}
