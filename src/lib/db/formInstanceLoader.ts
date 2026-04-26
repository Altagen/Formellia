import type { FormInstance, FormInstanceConfig, FormFileConfig } from "@/types/formInstance";

// Read once at module load — intentional.
const CONFIG_SOURCE = process.env.CONFIG_SOURCE ?? "db";

// ─────────────────────────────────────────────────────────
// In-memory cache (DB mode only)
// ─────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000;
const _cache = new Map<string, { instance: FormInstance; at: number }>();

function getCached(slug: string): FormInstance | null {
  const entry = _cache.get(slug);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    _cache.delete(slug);
    return null;
  }
  return entry.instance;
}

function setCached(instance: FormInstance): void {
  _cache.set(instance.slug, { instance, at: Date.now() });
}

function invalidateCached(slug?: string): void {
  if (slug) _cache.delete(slug);
  else _cache.clear();
}

/** Exported for use by the startup bootstrap after YAML upserts. */
export function invalidateFormInstanceCache(slug?: string): void {
  invalidateCached(slug);
}

// ─────────────────────────────────────────────────────────
// FILE mode helpers
// ─────────────────────────────────────────────────────────

function getFileLegacyConfig(): FormFileConfig {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("../../../form.config");
  return (mod.default ?? mod) as FormFileConfig;
}

function buildFileInstance(): FormInstance {
  const file = getFileLegacyConfig();
  const instanceConfig: FormInstanceConfig = {
    meta: file.meta,
    page: file.page,
    form: file.form,
    security: file.security,
    features: { landingPage: true, form: true },
  };
  return {
    id: "file-root",
    slug: "/",
    name: file.meta.name,
    config: instanceConfig,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

// ─────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────

function rowToInstance(row: {
  id: string;
  slug: string;
  name: string;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
}): FormInstance {
  const cfg = row.config;
  if (!cfg || typeof cfg !== "object" || !("meta" in cfg) || !("features" in cfg) || !("form" in cfg)) {
    throw new Error(`[formInstanceLoader] Instance "${row.slug}" (${row.id}) has corrupted config in DB`);
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    config: cfg as FormInstanceConfig,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

/**
 * Returns a form instance by slug.
 * - FILE mode: only "/" is supported (returns the root instance from form.config.ts)
 * - DB mode: reads from DB with 60s cache
 */
export async function getFormInstance(slug: string): Promise<FormInstance | null> {
  if (CONFIG_SOURCE === "file") {
    return slug === "/" ? buildFileInstance() : null;
  }

  const cached = getCached(slug);
  if (cached) return cached;

  const { db } = await import("@/lib/db");
  const { formInstances } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = await db.select().from(formInstances).where(eq(formInstances.slug, slug)).limit(1);
  if (rows.length === 0) return null;

  try {
    const instance = rowToInstance(rows[0]);
    setCached(instance);
    return instance;
  } catch {
    // Corrupted config (e.g. legacy format before multi-form migration) — treat as missing
    return null;
  }
}

/**
 * Returns a form instance by ID — accepts either a UUID or a slug.
 * Slugs are useful in config-as-code (YAML), where UUIDs are generated at runtime
 * and not stable across environments. AdminPage.formInstanceId documents this contract.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getFormInstanceById(idOrSlug: string): Promise<FormInstance | null> {
  if (!UUID_RE.test(idOrSlug)) {
    return getFormInstance(idOrSlug);
  }

  if (CONFIG_SOURCE === "file") return null;

  const { db } = await import("@/lib/db");
  const { formInstances } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = await db.select().from(formInstances).where(eq(formInstances.id, idOrSlug)).limit(1);
  if (rows.length === 0) return null;

  return rowToInstance(rows[0]);
}

/**
 * Lists all form instances ordered by creation date.
 */
export async function listFormInstances(): Promise<FormInstance[]> {
  if (CONFIG_SOURCE === "file") return [buildFileInstance()];

  const { db } = await import("@/lib/db");
  const { formInstances } = await import("@/lib/db/schema");

  const rows = await db.select().from(formInstances).orderBy(formInstances.createdAt);
  return rows.map(rowToInstance);
}

/**
 * Persists updates to name, config, and/or slug for an existing instance.
 * Pass `slug` (current slug) to evict the correct cache entry atomically.
 * Pass `newSlug` to rename the slug in the DB; both old and new cache entries are evicted.
 * Optionally pass `savedByUserId` / `savedByEmail` to attribute the snapshot in version history.
 */
export async function saveFormInstance(
  id: string,
  patch: Partial<Pick<FormInstance, "name" | "config">>,
  slug?: string,
  savedByUserId?: string | null,
  savedByEmail?: string | null,
  newSlug?: string,
): Promise<void> {
  if (CONFIG_SOURCE === "file") return;

  const { db } = await import("@/lib/db");
  const { formInstances, formVersionHistory } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  // Snapshot the current config before overwriting (only when config is changing and versioning is enabled)
  if (patch.config !== undefined) {
    const currentRows = await db
      .select({ config: formInstances.config })
      .from(formInstances)
      .where(eq(formInstances.id, id))
      .limit(1);

    if (currentRows.length > 0) {
      const currentConfig = currentRows[0].config as FormInstanceConfig;
      const versioningEnabled = (currentConfig as FormInstanceConfig).features?.formVersioning !== false;
      if (versioningEnabled) {
        await db.insert(formVersionHistory).values({
          formInstanceId: id,
          config: currentConfig,
          savedByUserId: savedByUserId ?? null,
          savedByEmail: savedByEmail ?? null,
        }).catch(() => {
          // Non-fatal — snapshot failure must not block the save
        });

        // Keep only the 100 most recent versions per form instance
        const { sql } = await import("drizzle-orm");
        await db.execute(
          sql`DELETE FROM form_version_history WHERE form_instance_id = ${id} AND id NOT IN (SELECT id FROM form_version_history WHERE form_instance_id = ${id} ORDER BY created_at DESC LIMIT 100)`
        ).catch(() => {});
      }
    }
  }

  await db
    .update(formInstances)
    .set({
      ...(patch.name   !== undefined ? { name:   patch.name }   : {}),
      ...(patch.config !== undefined ? { config: patch.config } : {}),
      ...(newSlug      !== undefined ? { slug:   newSlug }      : {}),
      updatedAt: new Date(),
    })
    .where(eq(formInstances.id, id));

  // Evict old slug + new slug if renamed
  if (slug) invalidateCached(slug);
  if (newSlug) invalidateCached(newSlug);
  if (!slug && !newSlug) invalidateCached();
}

/**
 * Creates a new form instance.
 */
export async function createFormInstance(
  slug: string,
  name: string,
  config: FormInstanceConfig
): Promise<FormInstance> {
  const { db } = await import("@/lib/db");
  const { formInstances } = await import("@/lib/db/schema");

  const rows = await db.insert(formInstances).values({ slug, name, config }).returning();
  return rowToInstance(rows[0]);
}

/**
 * Deletes a form instance by ID.
 */
export async function deleteFormInstance(id: string): Promise<void> {
  const { db } = await import("@/lib/db");
  const { formInstances } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  await db.delete(formInstances).where(eq(formInstances.id, id));
  // Fully clear cache since we don't track id→slug
  invalidateCached();
}
