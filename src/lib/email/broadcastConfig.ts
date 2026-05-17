/**
 * Read / write the global broadcast email provider config.
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

export type BroadcastProvider = "resend" | "sendgrid" | "mailgun";

export interface BroadcastEmailConfig {
  provider:        BroadcastProvider | null;
  fromAddress:     string | null;
  fromName:        string | null;
  apiKeyConfigured: boolean;     // true if encrypted key present — NEVER returns the plaintext
  apiKeyExpiresAt: string | null;
}

/**
 * Internal-facing — exposes the encrypted blob for the send engine to decrypt
 * on the fly. Never expose this via an API endpoint.
 */
export interface BroadcastEmailConfigInternal extends BroadcastEmailConfig {
  apiKeyEncrypted: string | null;
}

export async function getBroadcastEmailConfig(): Promise<BroadcastEmailConfigInternal> {
  const [row] = await db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1);
  return {
    provider:        (row?.broadcastEmailProvider as BroadcastProvider | null) ?? null,
    fromAddress:     row?.broadcastEmailFromAddress ?? null,
    fromName:        row?.broadcastEmailFromName    ?? null,
    apiKeyConfigured: !!row?.broadcastEmailApiKeyEncrypted?.trim(),
    apiKeyExpiresAt: row?.broadcastEmailApiKeyExpiresAt ?? null,
    apiKeyEncrypted: row?.broadcastEmailApiKeyEncrypted ?? null,
  };
}

/**
 * Public-facing variant — strips the encrypted blob so it never leaks through
 * a GET response.
 */
export async function getBroadcastEmailConfigSafe(): Promise<BroadcastEmailConfig> {
  const internal = await getBroadcastEmailConfig();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { apiKeyEncrypted: _enc, ...safe } = internal;
  return safe;
}

export interface UpdateBroadcastEmailConfigInput {
  provider?:        BroadcastProvider | null;
  fromAddress?:     string | null;
  fromName?:        string | null;
  /** Plain text key — encrypted before write. Pass `""` to clear, `undefined` to leave unchanged. */
  apiKey?:          string | null;
  apiKeyExpiresAt?: string | null;
}

export async function saveBroadcastEmailConfig(patch: UpdateBroadcastEmailConfigInput): Promise<void> {
  const updates: Partial<typeof appConfig.$inferInsert> = { updatedAt: new Date() };

  if (patch.provider     !== undefined) updates.broadcastEmailProvider    = patch.provider;
  if (patch.fromAddress  !== undefined) updates.broadcastEmailFromAddress = patch.fromAddress;
  if (patch.fromName     !== undefined) updates.broadcastEmailFromName    = patch.fromName;

  // apiKey: "" → null (clear); non-empty → encrypt + store; undefined → leave alone.
  if (patch.apiKey === "" || patch.apiKey === null) {
    updates.broadcastEmailApiKeyEncrypted = null;
    updates.broadcastEmailApiKeyExpiresAt = null;
  } else if (typeof patch.apiKey === "string" && patch.apiKey.trim() !== "") {
    updates.broadcastEmailApiKeyEncrypted = encryptApiKey(patch.apiKey.trim());
  }
  if (patch.apiKeyExpiresAt !== undefined) {
    updates.broadcastEmailApiKeyExpiresAt = patch.apiKeyExpiresAt;
  }

  // app_config is a single-row table; upsert so the first save populates the row.
  await db
    .insert(appConfig)
    .values({ id: 1, ...updates })
    .onConflictDoUpdate({ target: appConfig.id, set: updates });
}
