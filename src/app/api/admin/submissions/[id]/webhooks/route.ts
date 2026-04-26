import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/validateSession";
import { requireFormAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { webhookDeliveries, submissions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

/** GET /api/admin/submissions/:id/webhooks — list webhook deliveries for a submission */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminSession(req);
  if (guard) return guard;

  const { id } = await params;

  // Fetch submission to resolve formInstanceId for access check
  const sub = await db.select({ formInstanceId: submissions.formInstanceId })
    .from(submissions)
    .where(eq(submissions.id, id))
    .limit(1);
  if (!sub[0]) return NextResponse.json({ error: "Soumission introuvable" }, { status: 404 });
  if (sub[0].formInstanceId) {
    const accessGuard = await requireFormAccess(req, sub[0].formInstanceId, "viewer");
    if (accessGuard) return accessGuard;
  }

  const rows = await db
    .select({
      id:          webhookDeliveries.id,
      webhookUrl:  webhookDeliveries.webhookUrl,
      status:      webhookDeliveries.status,
      attempts:    webhookDeliveries.attempts,
      maxAttempts: webhookDeliveries.maxAttempts,
      nextRetryAt: webhookDeliveries.nextRetryAt,
      lastError:   webhookDeliveries.lastError,
      createdAt:   webhookDeliveries.createdAt,
      updatedAt:   webhookDeliveries.updatedAt,
    })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.submissionId, id))
    .orderBy(desc(webhookDeliveries.createdAt));

  return NextResponse.json(rows);
}
