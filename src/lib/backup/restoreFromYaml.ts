/**
 * Core restore logic shared between:
 *   - POST /api/admin/config/backup (direct YAML paste)
 *   - POST /api/admin/backup/restore  (provider ZIP)
 *
 * Accepts a pre-parsed object and applies the requested sections to the database.
 * Callers are responsible for parsing YAML/JSON before calling restoreFromObject.
 */
import { db } from "@/lib/db";
import { scheduledJobs, externalDatasets, appConfig, appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getFormConfig, saveFormConfig, isConfigEditable } from "@/lib/config";
import { listFormInstances, saveFormInstance, createFormInstance } from "@/lib/db/formInstanceLoader";
import { yamlConfigSchema } from "@/lib/yaml/configSchema";
import { getUseCustomRoot } from "@/lib/security/rootPageConfig";
import { getProtectedSlugs } from "@/lib/security/protectedSlugs";
import cron from "node-cron";
import type { FormInstanceConfig } from "@/types/formInstance";

type RestoreSection = "forms" | "scheduledJobs" | "datasets" | "admin" | "app";

export interface RestoreOptions {
  mode:     "append" | "replace";
  sections?: RestoreSection[];
}

export interface RestoreActor {
  id:    string | null;
  email: string | null;
}

export interface RestoreResult {
  success:  boolean;
  mode:     "append" | "replace";
  results:  Record<string, unknown>;
}

export async function restoreFromObject(
  incoming: Record<string, unknown>,
  options: RestoreOptions,
  actor: RestoreActor | null,
): Promise<RestoreResult> {
  const { mode, sections } = options;
  const shouldRestore = (s: string) => !sections || sections.includes(s as RestoreSection);

  const results: Record<string, unknown> = {};

  // ── forms ──────────────────────────────────────────────
  if (shouldRestore("forms") && Array.isArray(incoming.forms)) {
    const formsValidation = yamlConfigSchema.safeParse({ version: 1, forms: incoming.forms });
    if (!formsValidation.success) {
      results.forms = { error: formsValidation.error.issues[0]?.message };
    } else {
      const [existingForms, useCustomRoot, protectedSlugs] = await Promise.all([
        listFormInstances(),
        getUseCustomRoot(),
        getProtectedSlugs(),
      ]);
      const slugMap = new Map(existingForms.map(f => [f.slug, f]));
      const protectedSet = new Set(protectedSlugs);
      const fCreated: string[] = [];
      const fUpdated: string[] = [];
      const fErrors: Array<{ slug: string; message: string }> = [];

      for (const yamlForm of formsValidation.data.forms ?? []) {
        if (yamlForm.slug === "/" && !useCustomRoot) {
          fErrors.push({ slug: "/", message: "Slug \"/\" is reserved. Enable \"Custom home page\" in the settings." });
          continue;
        }
        const existing = slugMap.get(yamlForm.slug);
        if (existing && mode === "append") {
          fErrors.push({ slug: yamlForm.slug, message: `Slug "${yamlForm.slug}" already exists` });
          continue;
        }
        if (existing && mode === "replace" && protectedSet.has(yamlForm.slug)) {
          fErrors.push({ slug: yamlForm.slug, message: `Le slug "${yamlForm.slug}" is protected.` });
          continue;
        }
        try {
          const config: FormInstanceConfig = {
            meta:     (yamlForm.meta     ?? existing?.config?.meta     ?? { name: yamlForm.name, title: yamlForm.name, description: "", locale: "fr" }) as FormInstanceConfig["meta"],
            page:     (yamlForm.page     ?? existing?.config?.page     ?? { branding: { defaultTheme: "light" }, hero: { title: yamlForm.name, ctaLabel: "Commencer" } }) as FormInstanceConfig["page"],
            form:     (yamlForm.form     ?? existing?.config?.form     ?? { steps: [] }) as FormInstanceConfig["form"],
            security: (yamlForm.security ?? existing?.config?.security) as FormInstanceConfig["security"],
            features: yamlForm.features  ?? existing?.config?.features ?? { landingPage: true, form: true },
            notifications: existing?.config?.notifications,
            _managedBy: "ui-import",
          };
          if (yamlForm.onSubmitActions)                        config.onSubmitActions     = yamlForm.onSubmitActions     as unknown as FormInstanceConfig["onSubmitActions"];
          if (yamlForm.customStatuses)                         config.customStatuses      = yamlForm.customStatuses      as unknown as FormInstanceConfig["customStatuses"];
          if (yamlForm.successMessage       !== undefined)     config.successMessage       = yamlForm.successMessage;
          if (yamlForm.successRedirectUrl   !== undefined)     config.successRedirectUrl   = yamlForm.successRedirectUrl;
          if (yamlForm.successRedirectDelay !== undefined)     config.successRedirectDelay = yamlForm.successRedirectDelay;
          if (yamlForm.priorityThresholds)                     config.priorityThresholds   = yamlForm.priorityThresholds;

          if (existing) {
            await saveFormInstance(existing.id, { name: yamlForm.name, config }, yamlForm.slug, actor?.id ?? null, actor?.email ?? null);
            fUpdated.push(yamlForm.slug);
          } else {
            await createFormInstance(yamlForm.slug, yamlForm.name, config);
            fCreated.push(yamlForm.slug);
          }
        } catch (e: unknown) {
          fErrors.push({ slug: yamlForm.slug, message: e instanceof Error ? e.message : "Erreur" });
        }
      }
      results.forms = { created: fCreated, updated: fUpdated, errors: fErrors };
    }
  }

  // ── admin config ───────────────────────────────────────
  if (shouldRestore("admin") && incoming.admin && isConfigEditable()) {
    try {
      const current = await getFormConfig();
      const inAdmin = incoming.admin as Record<string, unknown>;
      const updated = { ...current, admin: { ...current.admin } };
      if (inAdmin.pages        !== undefined) updated.admin.pages        = inAdmin.pages        as typeof updated.admin.pages;
      if (inAdmin.tableColumns !== undefined) updated.admin.tableColumns = inAdmin.tableColumns as typeof updated.admin.tableColumns;
      if (inAdmin.branding     !== undefined) updated.admin.branding     = inAdmin.branding     as typeof updated.admin.branding;
      if (inAdmin.features     !== undefined) updated.admin.features     = inAdmin.features     as typeof updated.admin.features;
      await saveFormConfig(updated);
      results.admin = { success: true };
    } catch (e: unknown) {
      results.admin = { error: e instanceof Error ? e.message : "Erreur" };
    }
  }

  // ── app settings (priorityThresholds) ─────────────────
  if (shouldRestore("app") && typeof incoming.priorityThresholds === "object" && incoming.priorityThresholds !== null) {
    try {
      const pt = incoming.priorityThresholds as Record<string, unknown>;
      const redMaxDays    = Number(pt.redMaxDays);
      const orangeMaxDays = Number(pt.orangeMaxDays);
      const yellowMaxDays = Number(pt.yellowMaxDays);
      if (isNaN(redMaxDays) || isNaN(orangeMaxDays) || isNaN(yellowMaxDays)) {
        results.app = { error: "Valeurs priorityThresholds invalides — des nombres entiers sont attendus" };
      } else {
        await db.insert(appSettings)
          .values({ id: 1, redMaxDays, orangeMaxDays, yellowMaxDays })
          .onConflictDoUpdate({ target: appSettings.id, set: { redMaxDays, orangeMaxDays, yellowMaxDays } });
        results.app = { success: true };
      }
    } catch (e: unknown) {
      results.app = { error: e instanceof Error ? e.message : "Erreur" };
    }
  }

  if (shouldRestore("app") && incoming.app && typeof incoming.app === "object") {
    const inApp = incoming.app as Record<string, unknown>;
    if (typeof inApp.enforcePasswordPolicy === "boolean") {
      await db.insert(appConfig)
        .values({ id: 1, enforcePasswordPolicy: inApp.enforcePasswordPolicy })
        .onConflictDoUpdate({ target: appConfig.id, set: { enforcePasswordPolicy: inApp.enforcePasswordPolicy, updatedAt: new Date() } });
    }
  }

  // ── scheduled jobs ─────────────────────────────────────
  if (shouldRestore("scheduledJobs") && Array.isArray(incoming.scheduledJobs)) {
    const jCreated: string[] = [];
    const jUpdated: string[] = [];
    const jErrors: Array<{ name: string; message: string }> = [];
    const existingJobs = await db.select({ id: scheduledJobs.id, name: scheduledJobs.name }).from(scheduledJobs);
    const jobMap = new Map(existingJobs.map(j => [j.name, j.id]));

    for (const job of incoming.scheduledJobs as Array<Record<string, unknown>>) {
      if (!job.name || !job.action || !job.schedule) continue;
      if (!cron.validate(String(job.schedule))) {
        jErrors.push({ name: String(job.name), message: "Expression cron invalide" });
        continue;
      }
      const VALID_JOB_ACTIONS = ["retention_cleanup", "export_json", "export_csv", "export_backup"];
      if (!VALID_JOB_ACTIONS.includes(String(job.action))) {
        jErrors.push({ name: String(job.name), message: `Action inconnue : ${job.action}` });
        continue;
      }
      const existingId = jobMap.get(String(job.name));
      try {
        const values = {
          name:    String(job.name),
          action:  String(job.action) as "retention_cleanup" | "export_json" | "export_csv" | "export_backup",
          config:  (job.config as Record<string, unknown>) ?? {},
          schedule: String(job.schedule),
          enabled: Boolean(job.enabled ?? false),
        };
        if (existingId && mode === "append") { jErrors.push({ name: values.name, message: "Already exists" }); continue; }
        if (existingId) { await db.update(scheduledJobs).set(values).where(eq(scheduledJobs.id, existingId)); jUpdated.push(values.name); }
        else            { await db.insert(scheduledJobs).values(values); jCreated.push(values.name); }
      } catch (e: unknown) {
        jErrors.push({ name: String(job.name), message: e instanceof Error ? e.message : "Erreur" });
      }
    }
    results.scheduledJobs = { created: jCreated, updated: jUpdated, errors: jErrors };
    if (jCreated.length > 0 || jUpdated.length > 0) {
      import("@/lib/scheduler/scheduler").then(({ reloadJobs }) => reloadJobs()).catch(() => {});
    }
  }

  // ── datasets ───────────────────────────────────────────
  if (shouldRestore("datasets") && Array.isArray(incoming.datasets)) {
    const dCreated: string[] = [];
    const dUpdated: string[] = [];
    const dErrors: Array<{ name: string; message: string }> = [];
    const existingDs = await db.select({ id: externalDatasets.id, name: externalDatasets.name }).from(externalDatasets);
    const dsMap = new Map(existingDs.map(d => [d.name, d.id]));

    for (const ds of incoming.datasets as Array<Record<string, unknown>>) {
      if (!ds.name) continue;
      const VALID_SOURCE_TYPES = ["file", "api"];
      const VALID_IMPORT_MODES = ["append", "replace", "dedup"];
      if (!VALID_SOURCE_TYPES.includes(String(ds.sourceType))) {
        dErrors.push({ name: String(ds.name), message: `Type de source invalide : ${ds.sourceType}` });
        continue;
      }
      if (!VALID_IMPORT_MODES.includes(String(ds.importMode ?? "append"))) {
        dErrors.push({ name: String(ds.name), message: `Mode d'import invalide : ${ds.importMode}` });
        continue;
      }
      const existingId = dsMap.get(String(ds.name));
      try {
        const values = {
          name:                String(ds.name),
          description:         (ds.description as string)  ?? null,
          sourceType:          String(ds.sourceType)        as "file" | "api",
          apiUrl:              (ds.apiUrl as string)        ?? null,
          apiHeaders:          null,
          pollIntervalMinutes: ds.pollIntervalMinutes ? Number(ds.pollIntervalMinutes) : null,
          importMode:          String(ds.importMode ?? "append") as "append" | "replace" | "dedup",
          dedupKey:            (ds.dedupKey as string)      ?? null,
          fieldMap:            (ds.fieldMap as Record<string, string>) ?? null,
          columnDefs:          (ds.columnDefs as unknown[]) ?? null,
        };
        if (existingId && mode === "append") { dErrors.push({ name: values.name, message: "Already exists" }); continue; }
        if (existingId) {
          const { name: _n, ...upd } = values; void _n;
          await db.update(externalDatasets).set(upd).where(eq(externalDatasets.id, existingId));
          dUpdated.push(values.name);
        } else {
          await db.insert(externalDatasets).values(values);
          dCreated.push(values.name);
        }
      } catch (e: unknown) {
        dErrors.push({ name: String(ds.name), message: e instanceof Error ? e.message : "Erreur" });
      }
    }
    results.datasets = { created: dCreated, updated: dUpdated, errors: dErrors };
  }

  return { success: true, mode, results };
}
