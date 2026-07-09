/**
 * Storage layer for email_broadcasts. Engine-agnostic — does NOT touch the
 * provider HTTP layer. The send endpoint orchestrates compute-recipients +
 * sanitize + send + writeback.
 */
import { db } from "@/lib/db";
import { emailBroadcasts } from "@/lib/db/schema";
import { eq, and, desc, lt, sql } from "drizzle-orm";
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
 * Partial update — allowed on `draft` AND `failed` broadcasts. A failed row
 * had zero successful deliveries (the engine only writes `failed` when
 * sent_count is 0), so semantically it's the same as a draft that hasn't
 * been touched yet. Editing it transitions the row back to `draft` and
 * clears `last_error` so the next send starts from a clean slate.
 *
 * Trying to mutate a `sending` or `sent` row returns null so the API can
 * reply 409 — those rows are permanent records of what was (or is being)
 * delivered.
 */
export async function updateBroadcastIfDraft(
  id: string,
  patch: UpdateBroadcastInput,
): Promise<EmailBroadcast | null> {
  const existing = await getBroadcast(id);
  if (!existing) return null;
  if (existing.status !== "draft" && existing.status !== "failed") return null;

  const fields: Partial<typeof emailBroadcasts.$inferInsert> = { updatedAt: new Date() };
  if (patch.name        !== undefined) fields.name        = patch.name;
  if (patch.subject     !== undefined) fields.subject     = patch.subject;
  if (patch.bodyHtml    !== undefined) fields.bodyHtml    = patch.bodyHtml;
  if (patch.bodyText    !== undefined) fields.bodyText    = patch.bodyText;
  if (patch.dataPoolIds !== undefined) fields.dataPoolIds = patch.dataPoolIds;
  if (patch.additionalRecipients !== undefined)
    fields.additionalRecipients = normalizeAdditionalRecipients(patch.additionalRecipients);
  if (patch.providerId          !== undefined) fields.providerId  = patch.providerId;

  // Reset the row to draft on edit from a failed state — keeps the lifecycle
  // model linear (draft → sending → sent | failed → [edit] → draft).
  if (existing.status === "failed") {
    fields.status      = "draft";
    fields.lastError   = null;
    fields.failedCount = 0;
  }

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
 * Atomically claim a draft (or previously-failed row) for sending. The
 * WHERE clause uses Postgres `IN ('draft', 'failed')` so a single
 * statement covers both starting paths. `failed` rows are re-sendable
 * because nothing reached an inbox; the lastError is cleared on claim so
 * the row reflects the new attempt cleanly.
 *
 * The status guard is part of the UPDATE itself (atomic), closing a
 * TOCTOU window: previously two simultaneous clicks could both pass a
 * separate `getBroadcast` pre-check and proceed in parallel.
 */
export async function claimForSend(id: string): Promise<EmailBroadcast | null> {
  const [row] = await db
    .update(emailBroadcasts)
    .set({ status: "sending", lastError: null, updatedAt: new Date() })
    .where(and(
      eq(emailBroadcasts.id, id),
      // Cast to satisfy Drizzle's narrow status overload — both literals are
      // covered by the CHECK constraint on the column.
      sql`${emailBroadcasts.status} IN ('draft', 'failed')`,
    ))
    .returning();
  return row ?? null;
}

/**
 * Reaps rows stuck in `sending` beyond `stuckAfterMs`. Called by the scheduler
 * every ~5 minutes to close the "OOM-killed mid-send" hole where a broadcast
 * never reaches `markBroadcastSent`/`markBroadcastFailed`, leaving the row
 * permanently locked (composer refuses edits, DELETE only, no retry path).
 *
 * The reaper flips the row back to `failed` with a synthetic error string so
 * the admin sees why and can decide to re-send.
 */
export async function reapStuckBroadcasts(stuckAfterMs = 10 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - stuckAfterMs);
  const rows = await db
    .update(emailBroadcasts)
    .set({
      status:    "failed",
      lastError: "Send interrupted before completion (process likely restarted). Re-send when ready.",
      updatedAt: new Date(),
    })
    .where(and(
      sql`${emailBroadcasts.status} = 'sending'`,
      lt(emailBroadcasts.updatedAt, cutoff),
    ))
    .returning({ id: emailBroadcasts.id });
  return rows.length;
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
