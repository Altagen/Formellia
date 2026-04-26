/**
 * Protected slugs configuration.
 *
 * Forms whose slug appears in this list cannot be deleted or renamed.
 * Protection only applies to *existing* forms: if a protected slug no longer
 * has a corresponding form, the entry is silently ignored (filtered out at
 * read time in the app-config route).
 *
 * Cache is reset whenever an admin patches the list via /api/admin/app-config.
 */

let _cached: string[] | null = null;

export async function getProtectedSlugs(): Promise<string[]> {
  if (_cached !== null) return _cached;

  try {
    const { db } = await import("@/lib/db");
    const { appConfig } = await import("@/lib/db/schema");
    const rows = await db
      .select({ protectedSlugs: appConfig.protectedSlugs })
      .from(appConfig)
      .limit(1);
    _cached = rows[0]?.protectedSlugs ?? [];
  } catch (err) {
    // Dynamic import to avoid circular deps — logger may not be ready
    void import("@/lib/logger").then(({ configLogger }) => configLogger.error({ err }, "Failed to read protectedSlugs from DB"));
    _cached = [];
  }

  return _cached;
}

export function _resetProtectedSlugsCache(): void {
  _cached = null;
}
