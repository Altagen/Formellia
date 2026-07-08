/**
 * Resolution of "which email preset does this form use right now?" — the
 * post-UI-11 model.
 *
 * A form's `notifications.email` object now stores only the template
 * (enabled, subject, bodyText) plus a `providerId` pointing at a row in
 * `email_providers`. Credentials never live on the form; the resolver reads
 * them from the referenced preset — or from the default preset when
 * `providerId` is missing.
 *
 * The resolver has one job: produce a fully-populated `ResolvedEmailConfig`
 * ready for `sendEmailNotification` to consume, or a gap report so the
 * caller can render a clear "assign a provider" message instead of letting
 * the send blow up at the provider step.
 */
import type { EmailNotificationConfig } from "@/types/formInstance";
import { getDefaultEmailProvider, getEmailProviderInternal, type EmailProviderKind } from "./providers";

export interface ResolvedEmailConfig {
  enabled:          boolean;
  provider:         EmailProviderKind;
  fromAddress:      string;
  fromName?:        string;
  /** Encrypted blob — caller decrypts via `crypto.decryptApiKey`. */
  apiKeyEncrypted:  string;
  apiKeyExpiresAt?: string | null;
  subject:          string;
  bodyText:         string;
  /** Which side supplied the preset — audit surfaces this to explain "why did
   *  this form send from provider X?" when nothing has an explicit override. */
  apiKeySource:     "form" | "default";
  /** Preset row id — useful for audit + future "resend using same preset" flows. */
  providerId:       string;
}

export interface ResolutionGap {
  /** Why the send can't proceed. */
  reason:
    | "no_preset_referenced_and_no_default"
    | "referenced_preset_missing"
    | "template_disabled";
  /** Providers the caller can point the operator at (if the form is missing one). */
  suggestedProviderId?: string;
}

export type ResolveResult =
  | { ok: true;  config: ResolvedEmailConfig }
  | { ok: false; gap:    ResolutionGap };

export async function resolveFormEmailConfigFromDb(
  form: EmailNotificationConfig | undefined,
): Promise<ResolveResult> {
  if (!form || !form.enabled) {
    return { ok: false, gap: { reason: "template_disabled" } };
  }

  // 1. Form points at an explicit preset → look it up.
  if (form.providerId) {
    const preset = await getEmailProviderInternal(form.providerId);
    if (!preset) {
      // Preset was deleted after the form was configured — fall back to default
      // so a broken pointer doesn't silently drop notifications, but flag it
      // in the gap so the UI can nudge the operator to reassign.
      const fallback = await getDefaultEmailProvider();
      if (!fallback) {
        return { ok: false, gap: { reason: "referenced_preset_missing" } };
      }
      return {
        ok: true,
        config: buildResolved(form, fallback, "default"),
      };
    }
    return { ok: true, config: buildResolved(form, preset, "form") };
  }

  // 2. No explicit preset → default preset.
  const fallback = await getDefaultEmailProvider();
  if (!fallback) {
    return { ok: false, gap: { reason: "no_preset_referenced_and_no_default" } };
  }
  return { ok: true, config: buildResolved(form, fallback, "default") };
}

interface PresetInternal {
  id:               string;
  provider:         EmailProviderKind;
  fromAddress:      string;
  fromName:         string | null;
  apiKeyEncrypted:  string;
  apiKeyExpiresAt:  string | null;
}

function buildResolved(
  form:   EmailNotificationConfig,
  preset: PresetInternal,
  source: "form" | "default",
): ResolvedEmailConfig {
  return {
    enabled:         form.enabled,
    provider:        preset.provider,
    fromAddress:     preset.fromAddress,
    fromName:        preset.fromName ?? undefined,
    apiKeyEncrypted: preset.apiKeyEncrypted,
    apiKeyExpiresAt: preset.apiKeyExpiresAt,
    subject:         form.subject  ?? "",
    bodyText:        form.bodyText ?? "",
    apiKeySource:    source,
    providerId:      preset.id,
  };
}
