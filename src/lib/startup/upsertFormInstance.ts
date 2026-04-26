import type { YamlFormConfig } from "@/lib/yaml/configSchema";
import type { FormInstanceConfig } from "@/types/formInstance";
import { startupLogger as log } from "@/lib/logger";

/**
 * Upserts a form instance from a YAML config entry into the DB.
 *
 * - Creates if slug doesn't exist
 * - Updates if slug exists (config fields overwritten from YAML)
 * - Preserves apiKeyEncrypted from the existing DB row (YAML never contains secrets)
 * - Sets config._managedBy = "yaml" so the UI can show read-only badges
 */
export async function upsertFormInstanceFromYaml(yamlForm: YamlFormConfig): Promise<void> {
  const { db }            = await import("@/lib/db");
  const { formInstances } = await import("@/lib/db/schema");
  const { eq }            = await import("drizzle-orm");
  const { invalidateFormInstanceCache } = await import("@/lib/db/formInstanceLoader");

  // Read existing to preserve the encrypted API key (never in YAML)
  const existing = await db
    .select({ id: formInstances.id, config: formInstances.config })
    .from(formInstances)
    .where(eq(formInstances.slug, yamlForm.slug))
    .limit(1);

  const existingConfig = existing[0]?.config as FormInstanceConfig | undefined;
  const preservedApiKeyEncrypted = existingConfig?.notifications?.email?.apiKeyEncrypted ?? "";
  const preservedApiKeyExpiresAt = existingConfig?.notifications?.email?.apiKeyExpiresAt ?? null;

  // Build merged config — YAML fields take priority, secrets are preserved from DB
  const config: Record<string, unknown> = {
    meta: yamlForm.meta ?? existingConfig?.meta ?? {
      name:        yamlForm.name,
      title:       yamlForm.name,
      description: "",
      locale:      "fr",
    },
    page: yamlForm.page ?? existingConfig?.page ?? {
      branding: { defaultTheme: "light" },
      hero:     { title: yamlForm.name, ctaLabel: "Commencer" },
    },
    form:     yamlForm.form     ?? existingConfig?.form     ?? { steps: [] },
    security: yamlForm.security ?? existingConfig?.security ?? undefined,
    features: yamlForm.features ?? existingConfig?.features ?? { landingPage: true, form: true },

    notifications: buildNotifications(yamlForm, existingConfig, preservedApiKeyEncrypted, preservedApiKeyExpiresAt),

    // Optional new fields — YAML takes priority, fall back to existing DB value
    ...(yamlForm.onSubmitActions      !== undefined ? { onSubmitActions:      yamlForm.onSubmitActions }      : existingConfig?.onSubmitActions      !== undefined ? { onSubmitActions:      existingConfig.onSubmitActions }      : {}),
    ...(yamlForm.customStatuses       !== undefined ? { customStatuses:       yamlForm.customStatuses }       : existingConfig?.customStatuses       !== undefined ? { customStatuses:       existingConfig.customStatuses }       : {}),
    ...(yamlForm.successMessage       !== undefined ? { successMessage:       yamlForm.successMessage }       : existingConfig?.successMessage       !== undefined ? { successMessage:       existingConfig.successMessage }       : {}),
    ...(yamlForm.successRedirectUrl   !== undefined ? { successRedirectUrl:   yamlForm.successRedirectUrl }   : existingConfig?.successRedirectUrl   !== undefined ? { successRedirectUrl:   existingConfig.successRedirectUrl }   : {}),
    ...(yamlForm.successRedirectDelay !== undefined ? { successRedirectDelay: yamlForm.successRedirectDelay } : existingConfig?.successRedirectDelay !== undefined ? { successRedirectDelay: existingConfig.successRedirectDelay } : {}),
    ...(yamlForm.priorityThresholds   !== undefined ? { priorityThresholds:   yamlForm.priorityThresholds }   : existingConfig?.priorityThresholds   !== undefined ? { priorityThresholds:   existingConfig.priorityThresholds }   : {}),

    // Metadata marker — read by the UI to show "Managed by configuration" badges
    _managedBy: "yaml",
  };

  if (existing.length === 0) {
    await db.insert(formInstances).values({ slug: yamlForm.slug, name: yamlForm.name, config });
    log.info({ slug: yamlForm.slug }, "Form created");
  } else {
    await db
      .update(formInstances)
      .set({ name: yamlForm.name, config, updatedAt: new Date() })
      .where(eq(formInstances.slug, yamlForm.slug));
    log.info({ slug: yamlForm.slug }, "Form updated");
  }

  invalidateFormInstanceCache(yamlForm.slug);
}

function buildNotifications(
  yamlForm: YamlFormConfig,
  existingConfig: FormInstanceConfig | undefined,
  preservedApiKeyEncrypted: string,
  preservedApiKeyExpiresAt: string | null | undefined,
): Record<string, unknown> | undefined {
  const yamlNotif = yamlForm.notifications;
  if (!yamlNotif) return existingConfig?.notifications as Record<string, unknown> | undefined;

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
      // Secrets preserved from DB — never in YAML
      apiKeyEncrypted: preservedApiKeyEncrypted,
      apiKeyExpiresAt: yamlEmail.apiKeyExpiresAt ?? preservedApiKeyExpiresAt,
    },
  };
}
