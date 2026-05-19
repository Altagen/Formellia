/**
 * Read / write the global email provider config.
 *
 * Single source of truth for the whole instance — both the broadcast composer
 * AND the per-form transactional notifications fall back to these values when
 * a form doesn't override them. A form may override any subset of fields via
 * `form_instances.config.notifications.email`; resolution is per-field.
 *
 * Lives in `app_config` (single-row table) so it's serialised through the
 * existing backup/restore endpoint and survives YAML round-trips.
 *
 * The encrypted API key uses the same AES-256-GCM helper as per-form
 * notification keys — operators can rotate `ENCRYPTION_KEY` with the existing
 * `/api/admin/system/reencrypt` job to migrate this column alongside the rest.
 */
import { db } from "@/lib/db";
import { appConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encryptApiKey } from "./crypto";

export type EmailProvider = "resend" | "sendgrid" | "mailgun";

export interface GlobalEmailConfig {
  provider:         EmailProvider | null;
  fromAddress:      string | null;
  fromName:         string | null;
  apiKeyConfigured: boolean;     // true if encrypted key present — NEVER returns the plaintext
  apiKeyExpiresAt:  string | null;
}

/**
 * Internal-facing — exposes the encrypted blob for the send engine to decrypt
 * on the fly. Never expose this via an API endpoint.
 */
export interface GlobalEmailConfigInternal extends GlobalEmailConfig {
  apiKeyEncrypted: string | null;
}

export async function getGlobalEmailConfig(): Promise<GlobalEmailConfigInternal> {
  const [row] = await db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1);
  return {
    provider:         (row?.emailProvider as EmailProvider | null) ?? null,
    fromAddress:      row?.emailFromAddress ?? null,
    fromName:         row?.emailFromName    ?? null,
    apiKeyConfigured: !!row?.emailApiKeyEncrypted?.trim(),
    apiKeyExpiresAt:  row?.emailApiKeyExpiresAt ?? null,
    apiKeyEncrypted:  row?.emailApiKeyEncrypted ?? null,
  };
}

/**
 * Public-facing variant — strips the encrypted blob so it never leaks through
 * a GET response.
 */
export async function getGlobalEmailConfigSafe(): Promise<GlobalEmailConfig> {
  const internal = await getGlobalEmailConfig();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { apiKeyEncrypted: _enc, ...safe } = internal;
  return safe;
}

export interface UpdateGlobalEmailConfigInput {
  provider?:        EmailProvider | null;
  fromAddress?:     string | null;
  fromName?:        string | null;
  /** Plain text key — encrypted before write. Pass `""` to clear, `undefined` to leave unchanged. */
  apiKey?:          string | null;
  apiKeyExpiresAt?: string | null;
}

export async function saveGlobalEmailConfig(patch: UpdateGlobalEmailConfigInput): Promise<void> {
  const updates: Partial<typeof appConfig.$inferInsert> = { updatedAt: new Date() };

  if (patch.provider     !== undefined) updates.emailProvider    = patch.provider;
  if (patch.fromAddress  !== undefined) updates.emailFromAddress = patch.fromAddress;
  if (patch.fromName     !== undefined) updates.emailFromName    = patch.fromName;

  // apiKey: "" → null (clear); non-empty → encrypt + store; undefined → leave alone.
  if (patch.apiKey === "" || patch.apiKey === null) {
    updates.emailApiKeyEncrypted = null;
    updates.emailApiKeyExpiresAt = null;
  } else if (typeof patch.apiKey === "string" && patch.apiKey.trim() !== "") {
    updates.emailApiKeyEncrypted = encryptApiKey(patch.apiKey.trim());
  }
  if (patch.apiKeyExpiresAt !== undefined) {
    updates.emailApiKeyExpiresAt = patch.apiKeyExpiresAt;
  }

  // app_config is a single-row table; upsert so the first save populates the row.
  await db
    .insert(appConfig)
    .values({ id: 1, ...updates })
    .onConflictDoUpdate({ target: appConfig.id, set: updates });
}

