import { db } from "@/lib/db";
import { adminEvents } from "@/lib/db/schema";
import { lt } from "drizzle-orm";
import type { JobConfig, JobResult } from "../runner";

/**
 * Deletes admin audit events older than `olderThanDays`. Fires from either the
 * scheduled runner (job.action = "audit_purge") or the manual endpoint at
 * /api/admin/audit/purge. `olderThanDays` defaults to 365 when the caller does
 * not pin a value — that matches the "1 year" retention floor most compliance
 * checklists demand.
 */
export async function auditPurge(config: JobConfig): Promise<JobResult> {
  const days = Math.max(1, config.olderThanDays ?? 365);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const deleted = await db.delete(adminEvents).where(lt(adminEvents.createdAt, cutoff));
  const count = Array.isArray(deleted) ? deleted.length : ((deleted as unknown as { rowCount?: number }).rowCount ?? 0);
  return { deleted: count };
}
