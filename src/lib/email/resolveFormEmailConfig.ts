/**
 * Resolution of "what email config does this form actually use right now?"
 *
 * The per-form `notifications.email` object (stored in `form_instances.config`)
 * supplies the **template** (enabled toggle, subject, bodyText, submitter
 * confirmation copy) and may optionally override any of the provider-level
 * fields (provider, fromAddress, fromName, apiKey).
 *
 * Fields fall back **per field** to the global `app_config.email_*` row, so a
 * form can say "use the global provider but a different fromAddress" without
 * re-typing the API key.
 *
 * Why a dedicated helper: `sendEmailNotification` used to receive an
 * `EmailNotificationConfig` that already had a fully-populated provider/from/
 * apiKey, because the per-form UI required them. With the override model the
 * caller has to merge first, and centralising the merge means there is one
 * place to audit when an operator says "I changed the global key but my form
 * still sends from the old one".
 */
import type { EmailNotificationConfig } from "@/types/formInstance";
import type { GlobalEmailConfigInternal, EmailProvider } from "./globalEmailConfig";
import { getGlobalEmailConfig } from "./globalEmailConfig";

/** Same shape as EmailNotificationConfig but with all provider fields proven non-empty. */
export interface ResolvedEmailConfig {
  enabled:          boolean;
  provider:         EmailProvider;
  fromAddress:      string;
  fromName?:        string;
  /** Encrypted blob — caller decrypts via `crypto.decryptApiKey`. */
  apiKeyEncrypted:  string;
  apiKeyExpiresAt?: string | null;
  subject:          string;
  bodyText:         string;
  /** Surfaces which source supplied the API key so an audit log can report it. */
  apiKeySource:     "form" | "global";
}

export interface ResolutionGap {
  /** Field names that neither the form nor the global config could fill. */
  missing: Array<"provider" | "fromAddress" | "apiKey">;
}

export type ResolveResult =
  | { ok: true;  config: ResolvedEmailConfig }
  | { ok: false; gap:    ResolutionGap };

/**
 * Merge a form's email config with the global config. Either side may be
 * partial; the per-form value wins on each field; the result is fully-populated
 * or returns a gap report so the caller can render a clear "configure here"
 * message instead of letting the send blow up at the provider step.
 */
export function resolveFormEmailConfig(
  form:   EmailNotificationConfig | undefined,
  global: GlobalEmailConfigInternal,
): ResolveResult {
  // Coerce the per-form provider-section fields, treating empty string as "not
  // set" — the UI previously required them, so legacy rows may have `""` where
  // the operator never touched the field.
  const formProvider     = trimToNull(form?.provider);
  const formFrom         = trimToNull(form?.fromAddress);
  const formFromName     = trimToNull(form?.fromName);
  const formApiKeyEnc    = trimToNull(form?.apiKeyEncrypted);
  const formApiKeyExpiry = trimToNull(form?.apiKeyExpiresAt);

  const provider    = formProvider ?? global.provider;
  const fromAddress = formFrom     ?? global.fromAddress;
  const fromName    = formFromName ?? global.fromName ?? undefined;
  const apiKeyEnc   = formApiKeyEnc ?? global.apiKeyEncrypted;
  // Expiry follows the key that's actually being used — if we picked up the
  // per-form key we must also pick up its expiry (or null).
  const apiKeyExpiresAt = formApiKeyEnc ? formApiKeyExpiry : global.apiKeyExpiresAt;
  const apiKeySource    = formApiKeyEnc ? "form" : "global";

  const missing: ResolutionGap["missing"] = [];
  if (!provider)    missing.push("provider");
  if (!fromAddress) missing.push("fromAddress");
  if (!apiKeyEnc)   missing.push("apiKey");

  if (missing.length > 0) {
    return { ok: false, gap: { missing } };
  }

  return {
    ok: true,
    config: {
      enabled:         form?.enabled ?? false,
      provider:        provider as EmailProvider,
      fromAddress:     fromAddress as string,
      fromName,
      apiKeyEncrypted: apiKeyEnc as string,
      apiKeyExpiresAt: apiKeyExpiresAt ?? null,
      subject:         form?.subject  ?? "",
      bodyText:        form?.bodyText ?? "",
      apiKeySource,
    },
  };
}

/** Async sugar: load the global config and resolve in one call. */
export async function resolveFormEmailConfigFromDb(
  form: EmailNotificationConfig | undefined,
): Promise<ResolveResult> {
  const global = await getGlobalEmailConfig();
  return resolveFormEmailConfig(form, global);
}

function trimToNull(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t === "" ? null : t;
}
