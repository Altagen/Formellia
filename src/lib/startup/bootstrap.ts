import { loadYamlConfig } from "@/lib/yaml/configLoader";
import { bootstrapAdminUser } from "./adminBootstrap";
import { upsertFormInstanceFromYaml } from "./upsertFormInstance";
import { applyCustomCaCerts } from "@/lib/security/customCa";
import { startupLogger as log } from "@/lib/logger";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";

/**
 * Main startup bootstrap — runs once per process via src/instrumentation.ts.
 *
 * Applies config.yaml to the database:
 *   1. Priority thresholds → app_settings
 *   2. Password policy     → app_config
 *   3. Form instances      → form_instances (upsert by slug)
 *   4. Admin user          → users (create or conditionally update)
 *
 * If config.yaml is absent, exits immediately (UI-only mode, no changes).
 * If config.yaml exists but is invalid, throws — this crashes the process loudly
 * so operators know immediately rather than running with a broken config.
 *
 * DB errors per-step are caught and logged, not thrown — a partially failing
 * bootstrap is better than a refused startup for non-critical steps.
 */
export async function runStartupBootstrap(): Promise<void> {
  log.info("Starting...");

  // ── -1. Validate required env vars ─────────────────────
  // Fail fast before doing anything else — misconfigured instances should crash loudly.
  const encKey = process.env.ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(encKey)) {
    log.fatal("ENCRYPTION_KEY missing or invalid (64 hex chars required). Aborting.");
    process.exit(1);
  }

  // ── 0. Auto-migrate DB ─────────────────────────────────
  // Idempotent: no-op when already up to date (~2-5 ms).
  // Throws on failure → process crashes → Docker restarts → visible in logs.
  // Advisory lock prevents concurrent migrations if two instances start simultaneously.
  {
    const { db } = await import("@/lib/db");
    const { schemaMeta } = await import("@/lib/db/schema");
    const { sql } = await import("drizzle-orm");
    const MIGRATION_LOCK = 8_675_309; // arbitrary stable key, unique to this app
    await db.execute(sql`SELECT pg_advisory_lock(${MIGRATION_LOCK})`);
    const migrateStart = Date.now();
    try {
      await migrate(db as Parameters<typeof migrate>[0], {
        migrationsFolder: resolve(process.cwd(), "migrations"),
      });
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK})`).catch(() => {});
    }
    const migrateMs = Date.now() - migrateStart;
    log.info({ migrateMs }, "[bootstrap] DB migrations applied");
    // Record boot time in schema_meta (best-effort — ignore if table missing on very first run)
    await db.insert(schemaMeta)
      .values({ key: "last_boot_ms", value: String(migrateMs) })
      .onConflictDoUpdate({ target: schemaMeta.key, set: { value: String(migrateMs) } })
      .catch(() => {});
  }

  // Load and validate — throws on invalid schema
  let yaml;
  try {
    yaml = loadYamlConfig();
  } catch (err) {
    log.fatal({ err }, "FATAL ERROR — invalid config.yaml. Fix the file and restart.");
    throw err;
  }

  if (!yaml) {
    log.info("No config.yaml found — UI-only mode.");
    return;
  }

  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");

  // ── 1. Priority thresholds ──────────────────────────────
  if (yaml.priorityThresholds) {
    try {
      await db.execute(sql`
        INSERT INTO app_settings (id, red_max_days, orange_max_days, yellow_max_days)
        VALUES (1,
          ${yaml.priorityThresholds.redMaxDays},
          ${yaml.priorityThresholds.orangeMaxDays},
          ${yaml.priorityThresholds.yellowMaxDays}
        )
        ON CONFLICT (id) DO UPDATE SET
          red_max_days    = EXCLUDED.red_max_days,
          orange_max_days = EXCLUDED.orange_max_days,
          yellow_max_days = EXCLUDED.yellow_max_days
      `);
      log.info("Priority thresholds applied.");
    } catch (err) {
      log.error({ err }, "Priority thresholds error");
    }
  }

  // ── 2. Password policy ─────────────────────────────────
  if (yaml.app?.enforcePasswordPolicy !== undefined) {
    try {
      await db.execute(sql`
        INSERT INTO app_config (id, enforce_password_policy)
        VALUES (1, ${yaml.app.enforcePasswordPolicy})
        ON CONFLICT (id) DO UPDATE SET
          enforce_password_policy = EXCLUDED.enforce_password_policy,
          updated_at = now()
      `);
      log.info({ enforced: yaml.app.enforcePasswordPolicy }, "Password policy updated.");
    } catch (err) {
      log.error({ err }, "Password policy error");
    }
  }

  // ── 3. Form instances ──────────────────────────────────
  for (const form of yaml.forms ?? []) {
    try {
      await upsertFormInstanceFromYaml(form);
    } catch (err) {
      log.error({ err, slug: form.slug }, "Form error");
    }
  }

  // ── 4. Admin user ──────────────────────────────────────
  try {
    await bootstrapAdminUser(yaml.admin?.email);
  } catch (err) {
    log.error({ err }, "Admin create/update error");
  }

  // ── 5. Custom CA certs ─────────────────────────────────
  try {
    await applyCustomCaCerts();
  } catch (err) {
    log.error({ err }, "Custom CA certificates error");
  }

  log.info("Done.");
}
