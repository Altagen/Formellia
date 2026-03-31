import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { checkAdminRateLimit } from "@/lib/security/adminRateLimit";
import { listFormInstances, saveFormInstance, createFormInstance } from "@/lib/db/formInstanceLoader";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { parseBody } from "@/lib/serialization/parseBody";
import { yamlConfigSchema } from "@/lib/yaml/configSchema";
import { getUseCustomRoot } from "@/lib/security/rootPageConfig";
import { getProtectedSlugs } from "@/lib/security/protectedSlugs";
import type { FormInstanceConfig } from "@/types/formInstance";

export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  // Rate limit: 10 imports per user per 10 minutes (YAML parsing is non-trivial)
  const user = await validateAdminSession(req);
  const rl = checkAdminRateLimit(`config-import:${user?.id ?? "anon"}`, 10, 10 * 60 * 1000);
  if (rl.blocked) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }

  const modeParam = req.nextUrl.searchParams.get("mode") ?? "replace";
  if (modeParam !== "append" && modeParam !== "replace") {
    return NextResponse.json({ error: "mode invalide (append|replace)" }, { status: 400 });
  }
  const mode = modeParam as "append" | "replace";

  let rawParsed: unknown;
  try {
    rawParsed = await parseBody(req);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Parsing failed" }, { status: 422 });
  }

  const validation = yamlConfigSchema.safeParse(rawParsed);
  if (!validation.success) {
    const msg = validation.error.issues.map(i => i.message).join("; ");
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const parsedConfig = validation.data;
  const forms = parsedConfig.forms ?? [];

  if (forms.length === 0) {
    return NextResponse.json({ error: "No forms found (forms: key missing or empty)" }, { status: 422 });
  }

  const [existing, useCustomRoot, protectedSlugs] = await Promise.all([
    listFormInstances(),
    getUseCustomRoot(),
    getProtectedSlugs(),
  ]);
  const slugMap = new Map(existing.map(i => [i.slug, i]));
  const protectedSet = new Set(protectedSlugs);

  const created: string[] = [];
  const updated: string[] = [];
  const errors: Array<{ slug: string; message: string }> = [];

  const actor = await validateAdminSession(req);

  for (const yamlForm of forms) {
    if (yamlForm.slug === "/" && !useCustomRoot) {
      errors.push({ slug: "/", message: "Slug \"/\" is reserved for the default home page. Enable \"Custom home page\" in the admin settings." });
      continue;
    }

    const existingInstance = slugMap.get(yamlForm.slug);

    // Guard: cannot overwrite a protected form in replace mode
    if (existingInstance && mode === "replace" && protectedSet.has(yamlForm.slug)) {
      errors.push({ slug: yamlForm.slug, message: `Le slug "${yamlForm.slug}" is protected. Remove the protection in settings before overwriting it.` });
      continue;
    }

    if (existingInstance && mode === "append") {
      errors.push({ slug: yamlForm.slug, message: `Le slug "${yamlForm.slug}" already exists (append mode)` });
      continue;
    }

    const preservedApiKeyEncrypted = existingInstance?.config?.notifications?.email?.apiKeyEncrypted ?? "";
    const preservedApiKeyExpiresAt = existingInstance?.config?.notifications?.email?.apiKeyExpiresAt ?? null;

    const config: FormInstanceConfig = {
      meta: (yamlForm.meta ?? existingInstance?.config?.meta ?? {
        name:        yamlForm.name,
        title:       yamlForm.name,
        description: "",
        locale:      "fr",
      }) as FormInstanceConfig["meta"],
      page: (yamlForm.page ?? existingInstance?.config?.page ?? {
        branding: { defaultTheme: "light" },
        hero:     { title: yamlForm.name, ctaLabel: "Commencer" },
      }) as FormInstanceConfig["page"],
      form:     (yamlForm.form     ?? existingInstance?.config?.form     ?? { steps: [] }) as FormInstanceConfig["form"],
      security: (yamlForm.security ?? existingInstance?.config?.security ?? undefined) as FormInstanceConfig["security"],
      features: yamlForm.features ?? existingInstance?.config?.features ?? { landingPage: true, form: true },
      notifications: buildNotifications(yamlForm, existingInstance?.config, preservedApiKeyEncrypted, preservedApiKeyExpiresAt),
      _managedBy: "ui-import",
    };

    if (yamlForm.onSubmitActions)      config.onSubmitActions      = yamlForm.onSubmitActions as unknown as FormInstanceConfig["onSubmitActions"];
    if (yamlForm.customStatuses)       config.customStatuses        = yamlForm.customStatuses  as unknown as FormInstanceConfig["customStatuses"];
    if (yamlForm.successMessage        !== undefined) config.successMessage        = yamlForm.successMessage;
    if (yamlForm.successRedirectUrl    !== undefined) config.successRedirectUrl    = yamlForm.successRedirectUrl;
    if (yamlForm.successRedirectDelay  !== undefined) config.successRedirectDelay  = yamlForm.successRedirectDelay;
    if (yamlForm.priorityThresholds)   config.priorityThresholds    = yamlForm.priorityThresholds;

    try {
      if (existingInstance) {
        await saveFormInstance(existingInstance.id, { name: yamlForm.name, config }, yamlForm.slug, actor?.id ?? null, actor?.email ?? null);
        updated.push(yamlForm.slug);
        logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "form.import", resourceType: "form", resourceId: existingInstance.id, details: { slug: yamlForm.slug, mode: "replace" } });
      } else {
        await createFormInstance(yamlForm.slug, yamlForm.name, config);
        created.push(yamlForm.slug);
        logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "form.import", resourceType: "form", resourceId: yamlForm.slug, details: { slug: yamlForm.slug, mode: "append" } });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      errors.push({ slug: yamlForm.slug, message: msg });
    }
  }

  return NextResponse.json({ created, updated, errors });
}

// ── helpers ─────────────────────────────────────────────

type YamlFormEntry = (typeof yamlConfigSchema)["_output"]["forms"] extends Array<infer T> | undefined ? T : never;

function buildNotifications(
  yamlForm: YamlFormEntry,
  existingConfig: FormInstanceConfig | undefined,
  preservedApiKeyEncrypted: string,
  preservedApiKeyExpiresAt: string | null | undefined,
): FormInstanceConfig["notifications"] {
  const yamlNotif = yamlForm.notifications;
  if (!yamlNotif) return existingConfig?.notifications;

  const yamlEmail = yamlNotif.email;
  if (!yamlEmail) {
    return {
      webhookUrl: yamlNotif.webhookUrl,
      enabled:    yamlNotif.enabled,
      email:      existingConfig?.notifications?.email,
    };
  }

  return {
    webhookUrl: yamlNotif.webhookUrl,
    enabled:    yamlNotif.enabled,
    email: {
      enabled:         yamlEmail.enabled,
      provider:        yamlEmail.provider,
      fromAddress:     yamlEmail.fromAddress,
      fromName:        yamlEmail.fromName,
      subject:         yamlEmail.subject,
      bodyText:        yamlEmail.bodyText,
      apiKeyEncrypted: preservedApiKeyEncrypted,
      apiKeyExpiresAt: yamlEmail.apiKeyExpiresAt ?? preservedApiKeyExpiresAt,
    },
  };
}
