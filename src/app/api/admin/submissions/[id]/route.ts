import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { submissions, submissionEvents } from "@/lib/db/schema";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { requireFormAccess } from "@/lib/auth/permissions";
import { SUBMISSION_FIELD_LABELS } from "@/lib/config/submissionFieldLabels";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  status: z.string().max(20).optional(),
  priority: z.enum(["none", "yellow", "orange", "red", "green"]).optional(),
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  assignedToId:    z.string().max(21).nullable().optional(),
  assignedToEmail: z.string().max(255).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const mutGuard = await requireAdminMutation(req);
  if (mutGuard) return mutGuard;

  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  }

  // Fetch submission to know which form it belongs to (needed for requireFormAccess)
  const existing = await db
    .select({ id: submissions.id, status: submissions.status, priority: submissions.priority, dueDate: submissions.dueDate, notes: submissions.notes, formInstanceId: submissions.formInstanceId })
    .from(submissions).where(eq(submissions.id, id)).limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ error: "Soumission introuvable" }, { status: 404 });
  }

  // Agent+ access required — scoped users must have a grant on this form.
  // Orphaned submissions (formInstanceId = null) require at least a global agent role.
  const formId = existing[0].formInstanceId;
  if (formId) {
    const accessGuard = await requireFormAccess(req, formId, "agent");
    if (accessGuard) return accessGuard;
  } else {
    // No form context — fall back to global role check (agent+)
    const roleGuard = await requireRole("agent", req);
    if (roleGuard) return roleGuard;
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.dueDate !== undefined) updates.dueDate = parsed.data.dueDate;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
  if (parsed.data.assignedToId !== undefined) updates.assignedToId = parsed.data.assignedToId;
  if (parsed.data.assignedToEmail !== undefined) updates.assignedToEmail = parsed.data.assignedToEmail;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const [updated] = await db.update(submissions).set(updates).where(eq(submissions.id, id)).returning();

  // Log audit event
  const user = await validateAdminSession(req);
  const before = existing[0];
  const changedFields = Object.keys(updates).map((field) => ({
    field,
    label: SUBMISSION_FIELD_LABELS[field] ?? field,
    from: before[field as keyof typeof before] ?? null,
    to: updates[field] ?? null,
  })).filter((c) => String(c.from) !== String(c.to));

  if (changedFields.length > 0) {
    await db.insert(submissionEvents).values({
      submissionId: id,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      action: "update",
      changes: changedFields,
    });
  }

  return NextResponse.json(updated);
}
