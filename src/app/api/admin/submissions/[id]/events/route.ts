import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { submissionEvents, submissions } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/auth/validateSession";
import { requireFormAccess } from "@/lib/auth/permissions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminSession(req);
  if (guard) return guard;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  }

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

  const events = await db
    .select()
    .from(submissionEvents)
    .where(eq(submissionEvents.submissionId, id))
    .orderBy(desc(submissionEvents.createdAt));

  return NextResponse.json(events);
}
