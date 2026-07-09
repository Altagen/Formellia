import type { FormConfig } from "@/types/config";

// Read once at module load — intentional. Changing mode requires container restart.
const CONFIG_SOURCE = process.env.CONFIG_SOURCE ?? "db";

// ─────────────────────────────────────────────────────────
// No cache (same reasoning as src/lib/security/rootPageConfig.ts).
// ─────────────────────────────────────────────────────────
//
// Earlier revisions kept a 60s in-memory cache here. Two real-world scenarios
// surfaced stale-read bugs that pinned the operator to old config until the
// TTL expired:
//
//   - Next.js Turbopack splits server components and route handlers across
//     separate module bundles. The PUT route handler invalidated *its* cache,
//     while the layout's getFormConfig kept serving its own up-to-60s-old copy.
//     The operator deleted a view, the DB was correct, but the admin sidebar
//     and the views list both kept rendering the deleted view until the layout
//     bundle's cache expired.
//   - Production deployments running >1 worker only invalidate the cache in
//     the worker that handled the PUT; other workers serve stale until TTL.
//
// The on-disk row is the source of truth. The DB read is a single row by PK
// from a one-row table (`form_config WHERE id = 1`) — sub-millisecond on
// Postgres and dwarfed by the React render that follows.

// ─────────────────────────────────────────────────────────
// File config (compiled into bundle — zero DB read)
// ─────────────────────────────────────────────────────────

// Dynamic import so Next.js compiles form.config.ts into the bundle.
// Using require() to avoid top-level await in non-async context.
function getFileConfig(): FormConfig {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("../../../form.config");
  return (mod.default ?? mod) as FormConfig;
}

// ─────────────────────────────────────────────────────────
// DB config (editable, uncached)
// ─────────────────────────────────────────────────────────

async function readFromDb(): Promise<FormConfig | null> {
  const { db } = await import("@/lib/db");
  const { formConfig } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = await db.select().from(formConfig).where(eq(formConfig.id, 1)).limit(1);
  if (rows.length === 0) return null;
  return normalizeAdminPagesKey(rows[0].config as FormConfig);
}

/**
 * Backward-compat with 0.3.0 storage: the 0.3.0 release renamed `admin.pages`
 * → `admin.views` (and `admin.defaultPage` → `admin.defaultView`) in the DB
 * shape. This branch reverted the rename, so DB rows written by 0.3.0 carry
 * the newer keys; this helper remaps them back to the canonical `pages` /
 * `defaultPage` shape our TS types expect. The next save persists the
 * canonical shape.
 */
function normalizeAdminPagesKey(config: FormConfig): FormConfig {
  const admin = config.admin as FormConfig["admin"] & { views?: unknown; defaultView?: unknown };
  let mutated = false;
  const next = { ...admin };
  if (!Array.isArray(admin.pages) && Array.isArray(admin.views)) {
    next.pages = admin.views as FormConfig["admin"]["pages"];
    delete (next as { views?: unknown }).views;
    mutated = true;
  }
  if (!admin.defaultPage && typeof admin.defaultView === "string") {
    next.defaultPage = admin.defaultView;
    delete (next as { defaultView?: unknown }).defaultView;
    mutated = true;
  }
  return mutated ? { ...config, admin: next } : config;
}

async function writeToDb(config: FormConfig): Promise<void> {
  const { db } = await import("@/lib/db");
  const { formConfig } = await import("@/lib/db/schema");

  await db
    .insert(formConfig)
    .values({ id: 1, config })
    .onConflictDoUpdate({ target: formConfig.id, set: { config, updatedAt: new Date() } });
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

/**
 * Returns the active FormConfig.
 * - FILE mode: returns the statically imported form.config.ts — no DB read.
 * - DB mode: reads from DB on every call (no cache, see top-of-file note),
 *   seeds from file on first boot.
 */
export async function getFormConfig(): Promise<FormConfig> {
  if (CONFIG_SOURCE === "file") {
    return getFileConfig();
  }

  let config = await readFromDb();
  if (!config) {
    config = getFileConfig();
    await writeToDb(config);
  } else if (!config.admin.pages) {
    // Legacy row missing the `pages` key entirely — seed admin section
    // from the file config so the loader never returns a half-built shape.
    const fresh = getFileConfig();
    config = { ...config, admin: fresh.admin };
    await writeToDb(config);
  }

  return config;
}

/**
 * Persists a new config to DB. No-op in FILE mode (caller should check
 * isConfigEditable first).
 */
export async function saveFormConfig(config: FormConfig): Promise<void> {
  if (CONFIG_SOURCE === "file") return;
  await writeToDb(config);
}

/**
 * Overwrites the DB config with the file-based default ("Reset to defaults").
 * No-op in FILE mode.
 */
export async function resetFormConfig(): Promise<void> {
  if (CONFIG_SOURCE === "file") return;
  await writeToDb(getFileConfig());
}

/**
 * Seeds the DB with the file config if no row exists yet.
 * Also seeds form_instances on first boot.
 * Called from the root layout in DB mode to guarantee a config on first boot.
 */
export async function ensureConfigSeeded(): Promise<void> {
  if (CONFIG_SOURCE === "file") return;

  // Ensure the global form_config row exists
  const existing = await readFromDb();
  if (!existing) {
    // Write the full file config; seedFormInstances will reduce it afterwards
    const fileConfig = getFileConfig();
    await writeToDb(fileConfig);
  }

  // Seed form_instances (no-op if already populated)
  const { ensureFormInstancesSeeded } = await import("@/lib/db/seedFormInstances");
  await ensureFormInstancesSeeded();

  // Bootstrap admin user from env vars (no-op if user already exists or vars absent)
  const { ensureAdminUserSeeded } = await import("@/lib/db/seedAdminUser");
  await ensureAdminUserSeeded();
}

/**
 * Returns true when the config can be edited via the admin UI.
 * Used to conditionally show/hide edit controls in ConfigEditor vs ConfigViewer.
 */
export function isConfigEditable(): boolean {
  return CONFIG_SOURCE === "db";
}
