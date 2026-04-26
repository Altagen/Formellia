import AdmZip from "adm-zip";
import { db } from "@/lib/db";
import { submissions, externalRecords, externalDatasets, users, scheduledJobs, appSettings, appConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { listFormInstances, getFormInstanceById } from "@/lib/db/formInstanceLoader";
import { getFormConfig } from "@/lib/config";
import { serializeConfigToString } from "@/lib/serialization/serializeConfig";
import type { BackupManifest } from "./types";

export interface ComposeOptions {
  /** Form slugs whose submissions to include. Pass empty array to skip all, omit for all forms. */
  formSlugs?: string[];
  /** Dataset names to include records for. Pass empty array to skip all, omit for all. */
  datasetNames?: string[];
}

/**
 * Assembles a standards-compliant backup ZIP containing:
 *   manifest.json    — metadata
 *   config.yaml      — platform config (forms, jobs, datasets, settings)
 *   users.jsonl      — admin users (no password hashes)
 *   submissions/{slug}.jsonl  — per-form submissions (optional)
 *   dataset-records/{name}.jsonl — per-dataset records (optional)
 */
export async function composeBackup(options: ComposeOptions = {}): Promise<Buffer> {
  const zip = new AdmZip();
  const exportedAt = new Date().toISOString();

  // ── 1. Config YAML (existing export format) ─────────────────────────────
  const [adminConfig, forms, jobs, datasets, settings, appCfg] = await Promise.all([
    getFormConfig(),
    listFormInstances(),
    db.select({
      name: scheduledJobs.name, action: scheduledJobs.action,
      config: scheduledJobs.config, schedule: scheduledJobs.schedule, enabled: scheduledJobs.enabled,
    }).from(scheduledJobs),
    db.select({
      name: externalDatasets.name, description: externalDatasets.description,
      sourceType: externalDatasets.sourceType, apiUrl: externalDatasets.apiUrl,
      pollIntervalMinutes: externalDatasets.pollIntervalMinutes,
      importMode: externalDatasets.importMode, dedupKey: externalDatasets.dedupKey,
      fieldMap: externalDatasets.fieldMap, columnDefs: externalDatasets.columnDefs,
    }).from(externalDatasets),
    db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1),
    db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1),
  ]);

  const formsExport = forms.map(f => {
    const cfg = f.config;
    const notifications = cfg.notifications
      ? {
          ...(cfg.notifications.webhookUrl !== undefined ? { webhookUrl: cfg.notifications.webhookUrl } : {}),
          ...(cfg.notifications.enabled    !== undefined ? { enabled:    cfg.notifications.enabled }    : {}),
          ...(cfg.notifications.email
            ? {
                email: {
                  enabled:     cfg.notifications.email.enabled,
                  provider:    cfg.notifications.email.provider,
                  fromAddress: cfg.notifications.email.fromAddress,
                  ...(cfg.notifications.email.fromName     ? { fromName:     cfg.notifications.email.fromName }     : {}),
                  ...(cfg.notifications.email.subject      ? { subject:      cfg.notifications.email.subject }      : {}),
                  ...(cfg.notifications.email.bodyText     ? { bodyText:     cfg.notifications.email.bodyText }     : {}),
                  ...(cfg.notifications.email.apiKeyExpiresAt !== undefined ? { apiKeyExpiresAt: cfg.notifications.email.apiKeyExpiresAt } : {}),
                },
              }
            : {}),
        }
      : undefined;

    return {
      slug: f.slug,
      name: f.name,
      ...(cfg.features      ? { features:      cfg.features }      : {}),
      ...(notifications     ? { notifications }                     : {}),
      ...(cfg.meta          ? { meta:           cfg.meta }          : {}),
      ...(cfg.page          ? { page:           cfg.page }          : {}),
      ...(cfg.form          ? { form:           cfg.form }          : {}),
      ...(cfg.security      ? { security:       cfg.security }      : {}),
      ...(cfg.onSubmitActions      ? { onSubmitActions:      cfg.onSubmitActions }      : {}),
      ...(cfg.customStatuses       ? { customStatuses:       cfg.customStatuses }       : {}),
      ...(cfg.successMessage       !== undefined ? { successMessage:       cfg.successMessage }       : {}),
      ...(cfg.successRedirectUrl   !== undefined ? { successRedirectUrl:   cfg.successRedirectUrl }   : {}),
      ...(cfg.successRedirectDelay !== undefined ? { successRedirectDelay: cfg.successRedirectDelay } : {}),
      ...(cfg.priorityThresholds   ? { priorityThresholds:   cfg.priorityThresholds }   : {}),
    };
  });

  const configPayload = {
    version: 2,
    exportedAt,
    app: {
      enforcePasswordPolicy: appCfg[0]?.enforcePasswordPolicy ?? false,
      locale: (adminConfig as unknown as Record<string, unknown>).locale,
    },
    admin:              adminConfig.admin,
    priorityThresholds: settings[0]
      ? { redMaxDays: settings[0].redMaxDays, orangeMaxDays: settings[0].orangeMaxDays, yellowMaxDays: settings[0].yellowMaxDays }
      : undefined,
    forms:         formsExport,
    scheduledJobs: jobs,
    datasets,
  };

  const yamlStr = serializeConfigToString(configPayload);
  zip.addFile("config.yaml", Buffer.from(yamlStr, "utf8"));

  // ── 2. Users JSONL (no password hashes) ─────────────────────────────────
  const allUsers = await db.select({
    id: users.id, username: users.username, email: users.email,
    role: users.role, locale: users.locale, themeMode: users.themeMode,
    colorPreset: users.colorPreset, mustChangePassword: users.mustChangePassword,
  }).from(users);

  const usersJsonl = allUsers.map(u => JSON.stringify(u)).join("\n");
  zip.addFile("users.jsonl", Buffer.from(usersJsonl, "utf8"));

  // ── 3. Submissions per form ──────────────────────────────────────────────
  const sections: string[] = ["config", "users"];
  const formsMeta: BackupManifest["forms"] = [];
  const targetSlugs = options.formSlugs ?? forms.map(f => f.slug);

  for (const form of forms) {
    if (!targetSlugs.includes(form.slug)) continue;

    const rows = await db.select().from(submissions).where(eq(submissions.formInstanceId, form.id));
    const jsonl = rows.map(r => JSON.stringify(r)).join("\n");
    // Sanitize slug for use as a file name (replace "/" with "_root_")
    const safeSlug = form.slug === "/" ? "_root_" : form.slug.replace(/\//g, "_").replace(/^_/, "");
    zip.addFile(`submissions/${safeSlug}.jsonl`, Buffer.from(jsonl, "utf8"));
    formsMeta.push({ slug: form.slug, submissionCount: rows.length });
  }
  if (targetSlugs.length > 0) sections.push("submissions");

  // ── 4. Dataset records ───────────────────────────────────────────────────
  const allDatasets = await db.select({ id: externalDatasets.id, name: externalDatasets.name }).from(externalDatasets);
  const targetDatasets = options.datasetNames ?? allDatasets.map(d => d.name);
  const datasetsMeta: BackupManifest["datasets"] = [];

  for (const ds of allDatasets) {
    if (!targetDatasets.includes(ds.name)) continue;

    const rows = await db.select().from(externalRecords).where(eq(externalRecords.datasetId, ds.id));
    const jsonl = rows.map(r => JSON.stringify(r)).join("\n");
    const safeName = ds.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    zip.addFile(`dataset-records/${safeName}.jsonl`, Buffer.from(jsonl, "utf8"));
    datasetsMeta.push({ name: ds.name, recordCount: rows.length });
  }
  if (targetDatasets.length > 0) sections.push("dataset-records");

  // ── 5. Manifest ──────────────────────────────────────────────────────────
  const manifest: BackupManifest = {
    version:    1,
    format:     "zip+jsonl",
    exportedAt,
    sections,
    forms:    formsMeta,
    datasets: datasetsMeta,
  };
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));

  return zip.toBuffer();
}

/**
 * Generates a timestamped backup filename.
 * Format: backup-YYYY-MM-DDTHH-MM-SS.zip
 */
export function makeBackupFilename(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
  return `backup-${ts}.zip`;
}
