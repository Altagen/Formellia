import type { FormConfig } from "@/types/config";

// Read once at module load — intentional. Changing mode requires container restart.
const CONFIG_SOURCE = process.env.CONFIG_SOURCE ?? "db";

// ─────────────────────────────────────────────────────────
// Module-level cache (DB mode only)
// ─────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60_000; // 60 seconds

let cache: FormConfig | null = null;
let cacheAt = 0;

function getCache(): FormConfig | null {
  if (!cache) return null;
  if (Date.now() - cacheAt > CACHE_TTL_MS) {
    cache = null;
    return null;
  }
  return cache;
}

function setCache(config: FormConfig): void {
  cache = config;
  cacheAt = Date.now();
}

function invalidateCache(): void {
  cache = null;
  cacheAt = 0;
}

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
// DB config (editable, cached)
// ─────────────────────────────────────────────────────────

async function readFromDb(): Promise<FormConfig | null> {
  const { db } = await import("@/lib/db");
  const { formConfig } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = await db.select().from(formConfig).where(eq(formConfig.id, 1)).limit(1);
  if (rows.length === 0) return null;
  return rows[0].config as FormConfig;
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
 * - DB mode: reads from DB with a 60s cache, seeds from file on first boot.
 */
export async function getFormConfig(): Promise<FormConfig> {
  if (CONFIG_SOURCE === "file") {
    return getFileConfig();
  }

  const cached = getCache();
  if (cached) return cached;

  let config = await readFromDb();
  if (!config) {
    config = getFileConfig();
    await writeToDb(config);
  } else if (!config.admin.pages) {
    // Migrate old format (admin.widgets) → new format (admin.pages)
    const fresh = getFileConfig();
    config = { ...config, admin: fresh.admin };
    await writeToDb(config);
  }

  setCache(config);
  return config;
}

/**
 * Persists a new config to DB and invalidates the cache.
 * No-op in FILE mode (caller should check isConfigEditable first).
 */
export async function saveFormConfig(config: FormConfig): Promise<void> {
  if (CONFIG_SOURCE === "file") return;
  await writeToDb(config);
  invalidateCache();
}

/**
 * Overwrites the DB config with the file-based default ("Reset to defaults").
 * No-op in FILE mode.
 */
export async function resetFormConfig(): Promise<void> {
  if (CONFIG_SOURCE === "file") return;
  await writeToDb(getFileConfig());
  invalidateCache();
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
