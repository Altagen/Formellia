import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/validateSession";
import { requireFormAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { formAnalytics, formInstances } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminSession(req);
  if (guard) return guard;

  const { id } = await params;
  const accessGuard = await requireFormAccess(req, id, "viewer");
  if (accessGuard) return accessGuard;
  const [instance] = await db
    .select({ slug: formInstances.slug })
    .from(formInstances)
    .where(eq(formInstances.id, id))
    .limit(1);
  if (!instance) return NextResponse.json({ error: "Formulaire introuvable" }, { status: 404 });

  // Fetch view and complete events for this form
  const viewRows = await db
    .select()
    .from(formAnalytics)
    .where(and(eq(formAnalytics.formSlug, instance.slug), eq(formAnalytics.action, "view")));

  const completeRows = await db
    .select()
    .from(formAnalytics)
    .where(and(eq(formAnalytics.formSlug, instance.slug), eq(formAnalytics.action, "complete")));

  // Group unique sessions by step
  const viewsByStep: Record<number, Set<string>> = {};
  for (const row of viewRows) {
    if (!viewsByStep[row.step]) viewsByStep[row.step] = new Set();
    viewsByStep[row.step].add(row.sessionId);
  }
  const completeCount = new Set(completeRows.map(r => r.sessionId)).size;

  const steps = Object.entries(viewsByStep)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([step, sessions]) => ({ step: Number(step), sessions: sessions.size }));

  return NextResponse.json({ steps, completeCount });
}
