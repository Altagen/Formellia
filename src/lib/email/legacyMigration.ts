/**
 * One-shot boot scan (0.3.1) that unwinds the legacy per-form email config
 * left over from 0.3.0.
 *
 * Before UI-11 landed, each form could hold its own
 * `config.notifications.email.{provider,fromAddress,fromName,apiKeyEncrypted,
 * apiKeyExpiresAt}` and a `submitterConfirmation` subtree. Both are gone:
 * credentials live in the `email_providers` table, and forms only reference a
 * preset by `providerId`. The "submitter confirmation" second-email path was
 * a duplicate of the main confirmation and has been removed entirely.
 *
 * Strategy = force-drop (per operator decision UI-11 question 2):
 *   - Whenever a form still carries any of the deprecated fields at boot,
 *     the fields are removed in-place. If notifications.email became empty,
 *     `enabled` is also cleared so the form doesn't try to send with no
 *     provider. A `_notificationLegacyStripped: true` flag is recorded on
 *     the form's meta so the UI can render a "reconfigure" banner.
 *   - Every affected form is logged with slug + list of stripped fields so
 *     an operator can reconstruct the intent from journalctl.
 *
 * Idempotent: forms already stripped are skipped on subsequent boots.
 * Runs once per instance boot from `ensureConfigSeeded`.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { formInstances } from "@/lib/db/schema";
import type { FormInstance, FormInstanceConfig } from "@/types/formInstance";
import { startupLogger as log } from "@/lib/logger";

const DEPRECATED_EMAIL_FIELDS = ["provider", "fromAddress", "fromName", "apiKeyEncrypted", "apiKeyExpiresAt"] as const;

interface StripReport {
  slug: string;
  strippedEmailFields: string[];
  hadSubmitterConfirmation: boolean;
}

export async function stripLegacyEmailFieldsOnBoot(): Promise<void> {
  const rows = await db.select({ id: formInstances.id, slug: formInstances.slug, config: formInstances.config }).from(formInstances);

  const reports: StripReport[] = [];

  for (const row of rows) {
    const cfg = row.config as FormInstanceConfig | null;
    if (!cfg) continue;

    const notif = cfg.notifications;
    if (!notif) continue;

    const strippedEmailFields: string[] = [];
    let mutatedEmail: Record<string, unknown> | undefined;
    if (notif.email) {
      mutatedEmail = { ...(notif.email as unknown as Record<string, unknown>) };
      for (const field of DEPRECATED_EMAIL_FIELDS) {
        if (field in mutatedEmail) {
          delete mutatedEmail[field];
          strippedEmailFields.push(field);
        }
      }
    }

    const hadSubmitterConfirmation = "submitterConfirmation" in notif;

    if (strippedEmailFields.length === 0 && !hadSubmitterConfirmation) continue;

    const nextNotif: Record<string, unknown> = { ...notif };
    if (mutatedEmail) {
      // If the email subtree has been reduced to purely template-y fields but
      // no provider is set, force-disable it so the form doesn't try to send.
      if (!mutatedEmail.enabled || strippedEmailFields.length > 0) {
        mutatedEmail.enabled = false;
      }
      nextNotif.email = mutatedEmail;
    }
    if (hadSubmitterConfirmation) {
      delete nextNotif.submitterConfirmation;
    }

    const nextMeta = { ...(cfg.meta ?? {}), _notificationLegacyStripped: true } as FormInstanceConfig["meta"];
    const nextConfig: FormInstanceConfig = {
      ...cfg,
      meta: nextMeta,
      notifications: nextNotif as FormInstance["config"]["notifications"],
    };

    await db.update(formInstances).set({ config: nextConfig }).where(eq(formInstances.id, row.id));

    reports.push({ slug: row.slug, strippedEmailFields, hadSubmitterConfirmation });
  }

  if (reports.length > 0) {
    log.warn({ count: reports.length, reports }, "[UI-11] Stripped legacy email config from forms — providers must be reassigned via the Notifications tab");
  }
}
