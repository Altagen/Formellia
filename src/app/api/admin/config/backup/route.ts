import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { checkAdminRateLimit } from "@/lib/security/adminRateLimit";
import { getFormConfig } from "@/lib/config";
import { listFormInstances } from "@/lib/db/formInstanceLoader";
import { db } from "@/lib/db";
import { scheduledJobs, externalDatasets, appConfig, appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { serializeConfig } from "@/lib/serialization/serializeConfig";
import { parseBody } from "@/lib/serialization/parseBody";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { restoreFromObject } from "@/lib/backup/restoreFromYaml";
import { z } from "zod";

// ─────────────────────────────────────────────────────────
// GET — Full backup export
// ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  // Rate limit: 5 full-config exports per user per minute
  const sessionUser = await validateAdminSession(req);
  const rl = checkAdminRateLimit(`config-backup-get:${sessionUser?.id ?? "anon"}`, 5, 60 * 1000);
  if (rl.blocked) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }

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
      // apiHeaders excluded intentionally — contains secrets
      pollIntervalMinutes: externalDatasets.pollIntervalMinutes,
      importMode: externalDatasets.importMode, dedupKey: externalDatasets.dedupKey,
      fieldMap: externalDatasets.fieldMap, columnDefs: externalDatasets.columnDefs,
    }).from(externalDatasets),
    db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1),
    db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1),
  ]);

  // Serialize forms — strip email API keys + _managedBy
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
                  ...(cfg.notifications.email.fromName ? { fromName: cfg.notifications.email.fromName } : {}),
                  ...(cfg.notifications.email.subject  ? { subject:  cfg.notifications.email.subject  } : {}),
                  ...(cfg.notifications.email.bodyText ? { bodyText: cfg.notifications.email.bodyText } : {}),
                  ...(cfg.notifications.email.apiKeyExpiresAt !== undefined ? { apiKeyExpiresAt: cfg.notifications.email.apiKeyExpiresAt } : {}),
                  // encryptedApiKey intentionally omitted
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

  const backup = {
    version: 2,
    exportedAt: new Date().toISOString(),
    app: {
      enforcePasswordPolicy: appCfg[0]?.enforcePasswordPolicy ?? false,
      locale: (adminConfig as unknown as Record<string, unknown>).locale,
    },
    admin: adminConfig.admin,
    priorityThresholds: settings[0]
      ? { redMaxDays: settings[0].redMaxDays, orangeMaxDays: settings[0].orangeMaxDays, yellowMaxDays: settings[0].yellowMaxDays }
      : undefined,
    forms: formsExport,
    scheduledJobs: jobs,
    datasets,
  };

  return serializeConfig(backup, req, "backup.yaml");
}

// ─────────────────────────────────────────────────────────
// POST — Full restore (direct YAML/JSON paste)
// ─────────────────────────────────────────────────────────

const restoreBodySchema = z.object({
  mode:     z.enum(["append", "replace"]).default("replace"),
  sections: z.array(z.enum(["forms", "scheduledJobs", "datasets", "admin", "app"])).optional(),
});

export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  let rawParsed: unknown;
  try {
    rawParsed = await parseBody(req);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Parsing failed" }, { status: 422 });
  }

  if (typeof rawParsed !== "object" || rawParsed === null) {
    return NextResponse.json({ error: "Body must be an object" }, { status: 422 });
  }

  const incoming = rawParsed as Record<string, unknown>;

  const modeParam     = (req.nextUrl.searchParams.get("mode") ?? incoming.mode ?? "replace") as string;
  const sectionsParam = req.nextUrl.searchParams.get("sections");

  const controlParsed = restoreBodySchema.safeParse({
    mode:     modeParam,
    sections: sectionsParam ? sectionsParam.split(",") : incoming.sections,
  });
  if (!controlParsed.success) {
    return NextResponse.json({ error: controlParsed.error.issues[0]?.message }, { status: 400 });
  }

  const { mode, sections } = controlParsed.data;
  const actor = await validateAdminSession(req);

  let result;
  try {
    result = await restoreFromObject(incoming, { mode, sections }, actor);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 422 });
  }

  logAdminEvent({
    userId: actor?.id ?? null, userEmail: actor?.email ?? null,
    action: "config.restore", resourceType: "backup", resourceId: "full",
    details: { mode, sections: sections ?? "all", results: result.results },
  });

  return NextResponse.json(result);
}
