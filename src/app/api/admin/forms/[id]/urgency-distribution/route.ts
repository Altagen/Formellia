import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/validateSession";
import { requireFormAccess } from "@/lib/auth/permissions";
import { getFormInstanceById } from "@/lib/db/formInstanceLoader";
import { db } from "@/lib/db";
import { submissions, appSettings } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminSession(req);
  if (guard) return guard;

  const { id } = await params;
  const accessGuard = await requireFormAccess(req, id, "viewer");
  if (accessGuard) return accessGuard;
  const instance = await getFormInstanceById(id);
  if (!instance) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  // Load thresholds: per-instance > app_settings > defaults
  const perInstance = instance.config.priorityThresholds;
  let red = perInstance?.redMaxDays ?? 7;
  let orange = perInstance?.orangeMaxDays ?? 14;
  let yellow = perInstance?.yellowMaxDays ?? 30;

  if (!perInstance) {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
    if (row) {
      red    = row.redMaxDays;
      orange = row.orangeMaxDays;
      yellow = row.yellowMaxDays;
    }
  }

  // SQL CASE WHEN for bucket classification
  const rows = await db
    .select({
      bucket: sql<string>`
        CASE
          WHEN ${submissions.dueDate} IS NULL THEN 'no_deadline'
          WHEN (${submissions.dueDate}::date - CURRENT_DATE) < 0 THEN 'overdue'
          WHEN (${submissions.dueDate}::date - CURRENT_DATE) <= ${red} THEN 'red'
          WHEN (${submissions.dueDate}::date - CURRENT_DATE) <= ${orange} THEN 'orange'
          WHEN (${submissions.dueDate}::date - CURRENT_DATE) <= ${yellow} THEN 'yellow'
          ELSE 'green'
        END
      `.as("bucket"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(submissions)
    .where(eq(submissions.formInstanceId, id))
    .groupBy(sql`bucket`);

  const buckets: Record<string, number> = {
    overdue: 0, red: 0, orange: 0, yellow: 0, green: 0,
  };
  let total = 0;
  let withoutDeadline = 0;

  for (const row of rows) {
    const n = Number(row.count);
    total += n;
    if (row.bucket === "no_deadline") {
      withoutDeadline = n;
    } else {
      buckets[row.bucket] = n;
    }
  }

  const withDeadline = total - withoutDeadline;

  return NextResponse.json({ total, withDeadline, withoutDeadline, buckets });
}
