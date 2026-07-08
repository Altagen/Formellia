/**
 * CRUD for the `email_providers` table.
 *
 * Each row is one {name, provider, apiKey, fromAddress, fromName} identity.
 * Forms + broadcasts hold only a `providerId` reference plus their own
 * subject/bodyText, so credentials never live outside this table.
 *
 * `isDefault` — at most one row per instance may carry `true`, enforced by a
 * partial unique index at the DB level. Callers picking a fallback provider
 * (broadcast composer with no explicit selection, form notification with a
 * detached preset) should read the default. Marking a new preset as default
 * clears the flag on the previous one in the same transaction so the caller
 * never has to reconcile two rows.
 */
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailProviders } from "@/lib/db/schema";
import type { EmailProviderRow } from "@/lib/db/schema";
import { encryptApiKey } from "./crypto";

export type EmailProviderKind = "resend" | "sendgrid" | "mailgun";

/** Safe representation — no encrypted blob leaks through. */
export interface EmailProviderSafe {
  id:               string;
  name:             string;
  provider:         EmailProviderKind;
  fromAddress:      string;
  fromName:         string | null;
  apiKeyConfigured: boolean;
  apiKeyExpiresAt:  string | null;
  isDefault:        boolean;
  createdAt:        string;
  updatedAt:        string;
}

function toSafe(row: EmailProviderRow): EmailProviderSafe {
  return {
    id:               row.id,
    name:             row.name,
    provider:         row.provider as EmailProviderKind,
    fromAddress:      row.fromAddress,
    fromName:         row.fromName,
    apiKeyConfigured: !!row.apiKeyEncrypted?.trim(),
    apiKeyExpiresAt:  row.apiKeyExpiresAt,
    isDefault:        row.isDefault,
    createdAt:        row.createdAt.toISOString(),
    updatedAt:        row.updatedAt.toISOString(),
  };
}

export async function listEmailProviders(): Promise<EmailProviderSafe[]> {
  const rows = await db.select().from(emailProviders).orderBy(asc(emailProviders.name));
  return rows.map(toSafe);
}

export async function getEmailProvider(id: string): Promise<EmailProviderSafe | null> {
  const [row] = await db.select().from(emailProviders).where(eq(emailProviders.id, id)).limit(1);
  return row ? toSafe(row) : null;
}

/**
 * Internal — returns the encrypted API key blob for the send engine. Never
 * expose via an API endpoint.
 */
export async function getEmailProviderInternal(id: string): Promise<(EmailProviderSafe & { apiKeyEncrypted: string }) | null> {
  const [row] = await db.select().from(emailProviders).where(eq(emailProviders.id, id)).limit(1);
  if (!row) return null;
  return { ...toSafe(row), apiKeyEncrypted: row.apiKeyEncrypted };
}

export async function getDefaultEmailProvider(): Promise<(EmailProviderSafe & { apiKeyEncrypted: string }) | null> {
  const [row] = await db.select().from(emailProviders).where(eq(emailProviders.isDefault, true)).limit(1);
  if (!row) return null;
  return { ...toSafe(row), apiKeyEncrypted: row.apiKeyEncrypted };
}

export interface CreateProviderInput {
  name:            string;
  provider:        EmailProviderKind;
  fromAddress:     string;
  fromName?:       string | null;
  /** Plain-text — encrypted before insert. */
  apiKey:          string;
  apiKeyExpiresAt?: string | null;
  isDefault?:      boolean;
}

export async function createEmailProvider(input: CreateProviderInput): Promise<EmailProviderSafe> {
  const apiKeyEncrypted = encryptApiKey(input.apiKey);
  return db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx.update(emailProviders).set({ isDefault: false }).where(eq(emailProviders.isDefault, true));
    }
    const [row] = await tx.insert(emailProviders).values({
      name:            input.name.trim(),
      provider:        input.provider,
      fromAddress:     input.fromAddress.trim(),
      fromName:        input.fromName?.trim() || null,
      apiKeyEncrypted,
      apiKeyExpiresAt: input.apiKeyExpiresAt || null,
      isDefault:       !!input.isDefault,
    }).returning();
    return toSafe(row);
  });
}

export interface UpdateProviderInput {
  name?:            string;
  provider?:        EmailProviderKind;
  fromAddress?:     string;
  fromName?:        string | null;
  /** Undefined → don't rotate. Empty string → clear. Non-empty → re-encrypt. */
  apiKey?:          string;
  apiKeyExpiresAt?: string | null;
  isDefault?:       boolean;
}

export async function updateEmailProvider(id: string, input: UpdateProviderInput): Promise<EmailProviderSafe | null> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(emailProviders).where(eq(emailProviders.id, id)).limit(1);
    if (!existing) return null;

    const updates: Partial<typeof emailProviders.$inferInsert> = { updatedAt: new Date() };
    if (input.name        !== undefined) updates.name        = input.name.trim();
    if (input.provider    !== undefined) updates.provider    = input.provider;
    if (input.fromAddress !== undefined) updates.fromAddress = input.fromAddress.trim();
    if (input.fromName    !== undefined) updates.fromName    = input.fromName?.trim() || null;
    if (input.apiKey      !== undefined) updates.apiKeyEncrypted = input.apiKey.trim() ? encryptApiKey(input.apiKey) : "";
    if (input.apiKeyExpiresAt !== undefined) updates.apiKeyExpiresAt = input.apiKeyExpiresAt || null;

    if (input.isDefault === true && !existing.isDefault) {
      await tx.update(emailProviders).set({ isDefault: false }).where(and(eq(emailProviders.isDefault, true), ne(emailProviders.id, id)));
      updates.isDefault = true;
    } else if (input.isDefault === false && existing.isDefault) {
      updates.isDefault = false;
    }

    const [row] = await tx.update(emailProviders).set(updates).where(eq(emailProviders.id, id)).returning();
    return toSafe(row);
  });
}

export async function deleteEmailProvider(id: string): Promise<boolean> {
  const res = await db.delete(emailProviders).where(eq(emailProviders.id, id)).returning({ id: emailProviders.id });
  return res.length > 0;
}

/**
 * Promote a preset to default in one call, clearing the previous default.
 * Returns the updated row or null when the id doesn't exist.
 */
export async function setDefaultEmailProvider(id: string): Promise<EmailProviderSafe | null> {
  return updateEmailProvider(id, { isDefault: true });
}
