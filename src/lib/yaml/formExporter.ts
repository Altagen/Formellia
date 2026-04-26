import yaml from "js-yaml";
import type { FormInstance } from "@/types/formInstance";

/**
 * Builds the export data object for a FormInstance.
 * Strips secrets (apiKeyEncrypted) and internal markers (_managedBy).
 * Safe to pass to serializeConfig() for JSON or YAML output.
 */
export function buildFormExportData(form: FormInstance): Record<string, unknown> {
  const cfg = form.config;

  const notifications = cfg.notifications
    ? {
        ...(cfg.notifications.webhookUrl !== undefined ? { webhookUrl: cfg.notifications.webhookUrl } : {}),
        ...(cfg.notifications.enabled    !== undefined ? { enabled:    cfg.notifications.enabled }    : {}),
        ...(cfg.notifications.email
          ? {
              email: {
                enabled:         cfg.notifications.email.enabled,
                provider:        cfg.notifications.email.provider,
                fromAddress:     cfg.notifications.email.fromAddress,
                ...(cfg.notifications.email.fromName        ? { fromName:        cfg.notifications.email.fromName }        : {}),
                ...(cfg.notifications.email.subject         ? { subject:         cfg.notifications.email.subject }         : {}),
                ...(cfg.notifications.email.bodyText        ? { bodyText:        cfg.notifications.email.bodyText }        : {}),
                ...(cfg.notifications.email.apiKeyExpiresAt !== undefined
                  ? { apiKeyExpiresAt: cfg.notifications.email.apiKeyExpiresAt }
                  : {}),
                // apiKeyEncrypted intentionally omitted
              },
            }
          : {}),
      }
    : undefined;

  return {
    slug: form.slug,
    name: form.name,
    ...(cfg.features      !== undefined ? { features:             cfg.features }             : {}),
    ...(notifications     !== undefined ? { notifications }                                  : {}),
    ...(cfg.meta          !== undefined ? { meta:                 cfg.meta }                 : {}),
    ...(cfg.page          !== undefined ? { page:                 cfg.page }                 : {}),
    ...(cfg.form          !== undefined ? { form:                 cfg.form }                 : {}),
    ...(cfg.security      !== undefined ? { security:             cfg.security }             : {}),
    ...(cfg.onSubmitActions      !== undefined ? { onSubmitActions:      cfg.onSubmitActions }      : {}),
    ...(cfg.customStatuses       !== undefined ? { customStatuses:       cfg.customStatuses }       : {}),
    ...(cfg.successMessage       !== undefined ? { successMessage:       cfg.successMessage }       : {}),
    ...(cfg.successRedirectUrl   !== undefined ? { successRedirectUrl:   cfg.successRedirectUrl }   : {}),
    ...(cfg.successRedirectDelay !== undefined ? { successRedirectDelay: cfg.successRedirectDelay } : {}),
    ...(cfg.priorityThresholds   !== undefined ? { priorityThresholds:   cfg.priorityThresholds }   : {}),
    // _managedBy intentionally omitted
  };
}

/** Serialises a FormInstance to a YAML string (forms[] entry in config.yaml). */
export function serializeFormInstanceToYaml(form: FormInstance): string {
  return yaml.dump(buildFormExportData(form), { lineWidth: 120, noRefs: true, indent: 2 });
}
