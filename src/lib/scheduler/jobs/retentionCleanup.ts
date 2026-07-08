import { db } from "@/lib/db";
import { submissions, formInstances } from "@/lib/db/schema";
import { and, lt, eq } from "drizzle-orm";
import type { JobConfig, JobResult } from "../runner";

export async function retentionCleanup(config: JobConfig): Promise<JobResult> {
  // Floor at 1 day so that misconfigured jobs (0, negatives, NaN) never wipe live data.
  const raw = typeof config.olderThanDays === "number" ? config.olderThanDays : 365;
  const days = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 365;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  let condition = lt(submissions.submittedAt, cutoff);

  if (config.formSlug) {
    const [instance] = await db
      .select({ id: formInstances.id })
      .from(formInstances)
      .where(eq(formInstances.slug, config.formSlug))
      .limit(1);
    if (!instance) return { skipped: `Form slug '${config.formSlug}' not found` };
    condition = and(condition, eq(submissions.formInstanceId, instance.id))!;
  }

  const deleted = await db.delete(submissions).where(condition);
  // Drizzle returns rowCount on delete
  const count = Array.isArray(deleted) ? deleted.length : ((deleted as unknown as { rowCount?: number }).rowCount ?? 0);
  return { deleted: count };
}
