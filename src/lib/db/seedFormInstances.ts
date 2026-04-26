import type { FormInstanceConfig, FormFileConfig } from "@/types/formInstance";
import type { FormConfig } from "@/types/config";

/**
 * Seeds the form_instances table on first boot.
 * - If the table is already populated, this is a no-op.
 * - Otherwise it reads the legacy FormConfig (DB row or form.config.ts fallback)
 *   and creates the root instance (slug="/").
 * - Also rewrites form_config id=1 to the reduced shape { version, admin, priorityThresholds }.
 */
export async function ensureFormInstancesSeeded(): Promise<void> {
  const CONFIG_SOURCE = process.env.CONFIG_SOURCE ?? "db";
  if (CONFIG_SOURCE === "file") return;

  const { db } = await import("@/lib/db");
  const { formInstances, formConfig } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  // Already seeded?
  const existing = await db.select({ id: formInstances.id }).from(formInstances).limit(1);
  if (existing.length > 0) return;

  // Read legacy config from DB first (preserves admin edits), fall back to file.
  let legacyConfig: FormFileConfig | null = null;

  const configRows = await db
    .select()
    .from(formConfig)
    .where(eq(formConfig.id, 1))
    .limit(1);

  if (configRows.length > 0) {
    // The stored JSON may still have the full legacy shape with meta/page/form/security
    legacyConfig = configRows[0].config as FormFileConfig;
  }

  if (!legacyConfig?.meta) {
    // Fall back to the file config
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../../../form.config");
    legacyConfig = (mod.default ?? mod) as FormFileConfig;
  }

  // Build the root form instance config
  const instanceConfig: FormInstanceConfig = {
    meta: legacyConfig.meta,
    page: legacyConfig.page,
    form: legacyConfig.form,
    security: legacyConfig.security,
    features: { landingPage: true, form: true },
  };

  // onConflictDoNothing: if two requests race at first boot, the second insert
  // silently fails on the unique slug constraint instead of throwing.
  await db.insert(formInstances).values({
    slug: "/",
    name: legacyConfig.meta?.name ?? "Main form",
    config: instanceConfig,
  }).onConflictDoNothing();

  // Rewrite form_config to the reduced shape (keep admin / priorityThresholds)
  const reducedConfig: FormConfig = {
    version: legacyConfig.version ?? 1,
    admin: legacyConfig.admin,
    priorityThresholds: legacyConfig.priorityThresholds,
  };

  await db
    .insert(formConfig)
    .values({ id: 1, config: reducedConfig })
    .onConflictDoUpdate({ target: formConfig.id, set: { config: reducedConfig, updatedAt: new Date() } });
}
