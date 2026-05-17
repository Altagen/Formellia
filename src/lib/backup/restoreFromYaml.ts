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
import { mergeAdminViews, mergeTableColumns } from "@/lib/admin/mergeAdminConfig";
import { yamlDataPoolSchema } from "@/lib/datapools/validation";
import {
  getDataPoolBySlug,
  createDataPool,
  updateDataPool,
} from "@/lib/datapools/crud";
import { backfillAutoViews } from "@/lib/admin/autoFormPage";
import cron from "node-cron";
import type { FormInstanceConfig } from "@/types/formInstance";
import type { AdminView, TableColumnDef } from "@/types/config";

type RestoreSection = "forms" | "scheduledJobs" | "datasets" | "admin" | "app" | "dataPools";

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
  // In "append" mode, `admin.views` and `admin.tableColumns` are upserted by `id`
  // so a partial import only touches what it carries — re-importing one page no
  // longer wipes the rest. "replace" keeps the wholesale-replace semantics.
  // `branding`/`features` are singletons → replaced in both modes when present.
  if (shouldRestore("admin") && incoming.admin && isConfigEditable()) {
    try {
      const current = await getFormConfig();
      const inAdmin = incoming.admin as Record<string, unknown>;
      const updated = { ...current, admin: { ...current.admin } };
      // 0.3.0 fwd-compat: accept the legacy `admin.pages` key from older YAML
      // backups. `views` wins when both are present (canonical).
      const viewsPayload = inAdmin.views ?? inAdmin.pages;
      if (viewsPayload !== undefined) {
        if (!Array.isArray(viewsPayload)) throw new Error("admin.views must be an array");
        updated.admin.views = mergeAdminViews(current.admin.views ?? [], viewsPayload as AdminView[], mode);
      }
      if (inAdmin.tableColumns !== undefined) {
        if (!Array.isArray(inAdmin.tableColumns)) throw new Error("admin.tableColumns must be an array");
        updated.admin.tableColumns = mergeTableColumns(current.admin.tableColumns ?? [], inAdmin.tableColumns as TableColumnDef[], mode);
      }
      if (inAdmin.branding !== undefined) updated.admin.branding = inAdmin.branding as typeof updated.admin.branding;
      if (inAdmin.features !== undefined) updated.admin.features = inAdmin.features as typeof updated.admin.features;
      if (inAdmin.exclusionReasons !== undefined) {
        if (!Array.isArray(inAdmin.exclusionReasons)) {
          throw new Error("admin.exclusionReasons must be an array of strings");
        }
        // Wholesale replacement — these are deployment-level policy values,
        // they don't merge well across imports (the policy is the whole list).
        updated.admin.exclusionReasons = (inAdmin.exclusionReasons as unknown[])
          .map((r) => String(r).trim())
          .filter((r) => r.length > 0);
      }
      await saveFormConfig(updated);
      results.admin = { success: true, mode };

      // If the restore turned `autoCreateDashboardViewOnFormCreate` on, run a
      // backfill so the operator gets the missing pages immediately — no need
      // to re-trigger the button manually. The helper is idempotent and a
      // no-op when the toggle remained off.
      if (updated.admin.features?.autoCreateDashboardViewOnFormCreate) {
        try {
          const bf = await backfillAutoViews(actor);
          if (bf.created.length > 0) {
            results.adminAutoPagesBackfill = { created: bf.created, skipped: bf.skipped.length };
          }
        } catch (e: unknown) {
          // Don't fail the whole restore over a non-critical backfill.
          results.adminAutoPagesBackfill = { error: e instanceof Error ? e.message : "Erreur" };
        }
      }
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

  // ── dataPools ──────────────────────────────────────────
  // Pools are restored AFTER forms so the `formSlug → formInstanceId`
  // resolution can hit forms that were just imported in the same payload.
  // Mode semantics mirror the other sections:
  //   - append  → skip pools whose slug already exists (reported as an error)
  //   - replace → upsert by slug (sync sources to match exactly)
  // Exclusions are *not* carried in YAML — they reference submission UUIDs
  // which are not part of the config archive.
  if (shouldRestore("dataPools") && Array.isArray(incoming.dataPools)) {
    const pCreated: string[] = [];
    const pUpdated: string[] = [];
    const pErrors: Array<{ slug: string; message: string }> = [];

    // We re-list forms here rather than reuse the snapshot from the `forms`
    // section above — that list is stale if any forms were just created.
    const formsAfter = await listFormInstances();
    const formIdBySlug = new Map(formsAfter.map((f) => [f.slug, f.id]));

    for (const raw of incoming.dataPools as unknown[]) {
      const parsed = yamlDataPoolSchema.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        pErrors.push({
          slug: typeof (raw as { slug?: unknown })?.slug === "string" ? (raw as { slug: string }).slug : "?",
          message: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid pool entry",
        });
        continue;
      }
      const pool = parsed.data;

      // Resolve form slugs to ids. A missing slug is a hard error for the
      // pool — restoring with no sources would produce an empty pool.
      const resolvedSources: { formInstanceId: string }[] = [];
      const missingSlugs: string[] = [];
      for (const src of pool.sources) {
        const id = formIdBySlug.get(src.formSlug);
        if (!id) missingSlugs.push(src.formSlug);
        else resolvedSources.push({ formInstanceId: id });
      }
      if (missingSlugs.length > 0) {
        pErrors.push({ slug: pool.slug, message: `Unknown source form slug(s): ${missingSlugs.join(", ")}` });
        continue;
      }

      try {
        const existing = await getDataPoolBySlug(pool.slug);
        if (existing && mode === "append") {
          pErrors.push({ slug: pool.slug, message: `DataPool slug "${pool.slug}" already exists` });
          continue;
        }
        if (existing) {
          await updateDataPool(existing.id, {
            name: pool.name,
            description: pool.description ?? null,
            keyField: pool.keyField,
            additionalFields: pool.additionalFields,
            sources: resolvedSources,
          });
          pUpdated.push(pool.slug);
        } else {
          await createDataPool({
            slug: pool.slug,
            name: pool.name,
            description: pool.description ?? null,
            keyField: pool.keyField,
            additionalFields: pool.additionalFields,
            sources: resolvedSources,
          });
          pCreated.push(pool.slug);
        }
      } catch (e: unknown) {
        pErrors.push({ slug: pool.slug, message: e instanceof Error ? e.message : "Erreur" });
      }
    }
    results.dataPools = { created: pCreated, updated: pUpdated, errors: pErrors };
  }

  return { success: true, mode, results };
}
