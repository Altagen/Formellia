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
 *
 * ## Why no cache?
 *
 * Earlier revisions cached the value at module level. That worked in a single
 * process but broke in two real scenarios:
 *   - Next.js Turbopack dev mode occasionally hot-reloads the module that
 *     reads the value but not the one that resets it, leaving a stale `true`
 *     after the admin toggled the feature off.
 *   - Production deployments running >1 worker (cluster) only reset the
 *     cache in the worker that handled the PATCH; other workers kept serving
 *     the old value until restart.
 *
 * The fix is to skip the cache entirely. The DB read is a single row by PK
 * from a one-row table (`app_config WHERE id = 1`) — sub-millisecond on
 * Postgres and dwarfed by the React render that follows. The on-disk row is
 * the source of truth, period.
 *
 * `_resetUseCustomRootCache` is kept as an exported no-op so the existing
 * call sites compile without a sweep; remove it if those call sites are
 * cleaned up.
 */

export async function getUseCustomRoot(): Promise<boolean> {
  try {
    const { db } = await import("@/lib/db");
    const { appConfig } = await import("@/lib/db/schema");
    const rows = await db
      .select({ useCustomRoot: appConfig.useCustomRoot })
      .from(appConfig)
      .limit(1);
    return rows[0]?.useCustomRoot ?? false;
  } catch (err) {
    void import("@/lib/logger").then(({ configLogger }) => configLogger.error({ err }, "Failed to read useCustomRoot from DB"));
    return false;
  }
}

/** @deprecated No-op since the cache was removed. Kept for call-site compat. */
export function _resetUseCustomRootCache(): void {
  /* intentional no-op */
}
