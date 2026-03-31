import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { submissions, submissionEvents } from "@/lib/db/schema";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { SUBMISSION_FIELD_LABELS } from "@/lib/config/submissionFieldLabels";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const schema = z.object({
  ids: z.array(z.string()).min(1).max(100).refine(ids => ids.every(id => UUID_RE.test(id)), { message: "IDs invalides" }),
  action: z.enum(["update", "delete"]).optional().default("update"),
  updates: z.object({
    status:   z.string().max(50).optional(),
    priority: z.enum(["none", "yellow", "orange", "red", "green"]).optional(),
  }).optional().default({}),
});

// SUBMISSION_FIELD_LABELS imported from shared module

export async function PATCH(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("editor", req);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const { ids, action, updates } = parsed.data;
  const user = await validateAdminSession(req);

  // ── Delete action ────────────────────────────────────────
  if (action === "delete") {
    // submissionEvents cascade-deleted via FK onDelete: cascade
    await db.transaction(async (tx) => {
      await tx.delete(submissions).where(inArray(submissions.id, ids));
    });
    return NextResponse.json({ deleted: ids.length });
  }

  // ── Update action ────────────────────────────────────────
  const updatePayload: Record<string, unknown> = {};
  if (updates?.status)   updatePayload.status   = updates.status;
  if (updates?.priority) updatePayload.priority = updates.priority;

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: "At least one field to update" }, { status: 400 });
  }

  // Fetch current values for diff
  const existing = await db
    .select({ id: submissions.id, status: submissions.status, priority: submissions.priority })
    .from(submissions)
    .where(inArray(submissions.id, ids));

  // All requested IDs must exist — reject partial matches to prevent silent data drift
  if (existing.length !== ids.length) {
    const foundIds = new Set(existing.map(r => r.id));
    const missing = ids.filter(id => !foundIds.has(id));
    return NextResponse.json(
      { error: "Soumissions introuvables", missing },
      { status: 404 }
    );
  }

  const existingMap = new Map(existing.map(r => [r.id, r]));

  // Transaction: update all + log one audit event per submission
  await db.transaction(async (tx) => {
    await tx.update(submissions).set(updatePayload).where(inArray(submissions.id, ids));

    const events = ids.flatMap(id => {
      const before = existingMap.get(id);
      if (!before) return [];
      const changedFields = Object.keys(updatePayload).map(field => ({
        field,
        label: SUBMISSION_FIELD_LABELS[field] ?? field,
        from: before[field as keyof typeof before] ?? null,
        to: updatePayload[field] ?? null,
      })).filter(c => String(c.from) !== String(c.to));

      if (changedFields.length === 0) return [];
      return [{
        submissionId: id,
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
        action: "bulk_update",
        changes: changedFields,
      }];
    });

    if (events.length > 0) {
      await tx.insert(submissionEvents).values(events);
    }
  });

  return NextResponse.json({ updated: ids.length });
}
