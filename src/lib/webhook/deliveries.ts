/**
 * Webhook delivery queue with exponential backoff retry.
 *
 * Deliveries are queued on form submission and processed by a background cron job.
 * Backoff schedule (attempt N → wait before next retry):
 *   1 → 1 min, 2 → 2 min, 3 → 4 min, 4 → 8 min, 5 → 16 min → failed
 */
import { db } from "@/lib/db";
import { webhookDeliveries } from "@/lib/db/schema";
import { eq, and, lte, inArray } from "drizzle-orm";
import { formLogger as log } from "@/lib/logger";
import { isSsrfUrl } from "@/lib/security/ssrfCheck";

const TIMEOUT_MS = 10_000;

// Overlap guard: prevents concurrent execution when cron fires faster than processing
let _processing = false;

/** Exponential backoff delay in milliseconds for attempt N (1-indexed). */
function backoffMs(attempt: number): number {
  return Math.pow(2, attempt - 1) * 60_000; // 1min, 2min, 4min, 8min, 16min
}

/** Queue a webhook delivery for processing by the background job. */
export async function queueWebhookDelivery(params: {
  submissionId:   string | null;
  formInstanceId: string | null;
  webhookUrl:     string;
  payload:        Record<string, unknown>;
  maxAttempts?:   number;
}): Promise<void> {
  await db.insert(webhookDeliveries).values({
    submissionId:   params.submissionId,
    formInstanceId: params.formInstanceId,
    webhookUrl:     params.webhookUrl,
    payload:        params.payload,
    maxAttempts:    params.maxAttempts ?? 5,
    status:         "pending",
    attempts:       0,
    nextRetryAt:    new Date(), // process immediately on first attempt
  });
}

/** Process all due pending webhook deliveries. Called every minute by the scheduler. */
export async function processWebhookQueue(): Promise<{ succeeded: number; failed: number; exhausted: number }> {
  if (_processing) return { succeeded: 0, failed: 0, exhausted: 0 };
  _processing = true;
  try {
    return await _processWebhookQueueInner();
  } finally {
    _processing = false;
  }
}

async function _processWebhookQueueInner(): Promise<{ succeeded: number; failed: number; exhausted: number }> {
  const now = new Date();
  const due = await db
    .select()
    .from(webhookDeliveries)
    .where(and(
      eq(webhookDeliveries.status, "pending"),
      lte(webhookDeliveries.nextRetryAt, now),
    ))
    .limit(50); // process at most 50 per tick to avoid flooding

  let succeeded = 0, failed = 0, exhausted = 0;

  for (const delivery of due) {
    const attempt = delivery.attempts + 1;
    let ok = false;
    let lastError: string | null = null;

    try {
      // Block SSRF: skip deliveries pointing to private/internal addresses
      if (isSsrfUrl(delivery.webhookUrl)) {
        lastError = "Blocked URL: internal/private target not allowed";
        log.warn({ webhookUrl: delivery.webhookUrl, deliveryId: delivery.id }, "Webhook SSRF blocked");
      } else {
        const res = await fetch(delivery.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(delivery.payload),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        ok = res.ok;
        if (!ok) lastError = `HTTP ${res.status}`;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (ok) {
      await db.update(webhookDeliveries)
        .set({ status: "success", attempts: attempt, lastError: null, updatedAt: new Date() })
        .where(eq(webhookDeliveries.id, delivery.id));
      succeeded++;
      log.info({ webhookUrl: delivery.webhookUrl, attempt }, "Webhook delivered");
    } else if (attempt >= delivery.maxAttempts) {
      await db.update(webhookDeliveries)
        .set({ status: "failed", attempts: attempt, lastError, updatedAt: new Date() })
        .where(eq(webhookDeliveries.id, delivery.id));
      exhausted++;
      log.warn({ webhookUrl: delivery.webhookUrl, attempt, lastError }, "Webhook exhausted max attempts");
    } else {
      const nextRetryAt = new Date(Date.now() + backoffMs(attempt));
      await db.update(webhookDeliveries)
        .set({ attempts: attempt, lastError, nextRetryAt, updatedAt: new Date() })
        .where(eq(webhookDeliveries.id, delivery.id));
      failed++;
      log.warn({ webhookUrl: delivery.webhookUrl, attempt, lastError, nextRetryAt }, "Webhook failed, will retry");
    }
  }

  return { succeeded, failed, exhausted };
}

/**
 * Purges completed webhook delivery records older than the given retention period.
 * Called daily by the scheduler. Returns the number of rows deleted.
 */
export async function purgeOldDeliveries(retentionDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await db.delete(webhookDeliveries).where(
    and(
      inArray(webhookDeliveries.status, ["success", "failed"]),
      lte(webhookDeliveries.updatedAt, cutoff),
    )
  );
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}
