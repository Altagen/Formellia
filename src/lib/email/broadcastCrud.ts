/**
 * Storage layer for email_broadcasts. Engine-agnostic — does NOT touch the
 * provider HTTP layer. The send endpoint orchestrates compute-recipients +
 * sanitize + send + writeback.
 */
import { db } from "@/lib/db";
import { emailBroadcasts } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import type { EmailBroadcast } from "@/lib/db/schema";
import type { CreateBroadcastInput, UpdateBroadcastInput } from "./broadcastValidation";
import { normalizeAdditionalRecipients } from "./additionalRecipients";

export async function listBroadcasts(): Promise<EmailBroadcast[]> {
  return db.select().from(emailBroadcasts).orderBy(desc(emailBroadcasts.createdAt));
}

export async function getBroadcast(id: string): Promise<EmailBroadcast | null> {
  const [row] = await db.select().from(emailBroadcasts).where(eq(emailBroadcasts.id, id)).limit(1);
  return row ?? null;
}

export async function createBroadcast(
  input: CreateBroadcastInput,
  createdByUserId: string | null,
): Promise<EmailBroadcast> {
  const [row] = await db.insert(emailBroadcasts).values({
    name:                 input.name,
    subject:              input.subject,
    bodyHtml:             input.bodyHtml,
    bodyText:             input.bodyText,
    dataPoolIds:          input.dataPoolIds,
    additionalRecipients: normalizeAdditionalRecipients(input.additionalRecipients),
    createdByUserId,
  }).returning();
  return row;
}

/**
 * Partial update — only allowed on `draft` broadcasts. Trying to mutate a
 * `sending`/`sent`/`failed` row returns null so the API can reply 409.
 */
export async function updateBroadcastIfDraft(
  id: string,
  patch: UpdateBroadcastInput,
): Promise<EmailBroadcast | null> {
  const existing = await getBroadcast(id);
  if (!existing || existing.status !== "draft") return null;

  const fields: Partial<typeof emailBroadcasts.$inferInsert> = { updatedAt: new Date() };
  if (patch.name        !== undefined) fields.name        = patch.name;
  if (patch.subject     !== undefined) fields.subject     = patch.subject;
  if (patch.bodyHtml    !== undefined) fields.bodyHtml    = patch.bodyHtml;
  if (patch.bodyText    !== undefined) fields.bodyText    = patch.bodyText;
  if (patch.dataPoolIds !== undefined) fields.dataPoolIds = patch.dataPoolIds;
  if (patch.additionalRecipients !== undefined)
    fields.additionalRecipients = normalizeAdditionalRecipients(patch.additionalRecipients);

  const [row] = await db
    .update(emailBroadcasts)
    .set(fields)
    .where(eq(emailBroadcasts.id, id))
    .returning();
  return row ?? null;
}

export async function deleteBroadcast(id: string): Promise<boolean> {
  const result = await db.delete(emailBroadcasts).where(eq(emailBroadcasts.id, id)).returning({ id: emailBroadcasts.id });
  return result.length > 0;
}

/**
 * Atomically claim a draft for sending. Postgres `UPDATE ... WHERE id=? AND
 * status='draft' RETURNING *` is a single statement and runs in its own
 * implicit transaction, so a row can only be claimed once even under
 * concurrent /send calls. If the row is missing or no longer a draft, the
 * UPDATE matches zero rows and we return null — the caller turns that into
 * a 409 response.
 *
 * Closes a TOCTOU between the API's `getBroadcast()` status check and the
 * actual claim: previously the WHERE clause filtered only by id, so two
 * simultaneous clicks could both pass the pre-check and both proceed to
 * send. The status guard is now part of the UPDATE itself.
 */
export async function claimForSend(id: string): Promise<EmailBroadcast | null> {
  const [row] = await db
    .update(emailBroadcasts)
    .set({ status: "sending", updatedAt: new Date() })
    .where(and(eq(emailBroadcasts.id, id), eq(emailBroadcasts.status, "draft")))
    .returning();
  return row ?? null;
}

export async function markBroadcastSent(id: string, recipientCount: number, sent: number, failed: number, error: string | null): Promise<void> {
  await db.update(emailBroadcasts).set({
    status:         failed === 0 ? "sent" : (sent === 0 ? "failed" : "sent"),
    recipientCount,
    sentCount:      sent,
    failedCount:    failed,
    lastError:      error ?? null,
    sentAt:         new Date(),
    updatedAt:      new Date(),
  }).where(eq(emailBroadcasts.id, id));
}

export async function markBroadcastFailed(id: string, error: string): Promise<void> {
  await db.update(emailBroadcasts).set({
    status:    "failed",
    lastError: error,
    updatedAt: new Date(),
  }).where(eq(emailBroadcasts.id, id));
}
