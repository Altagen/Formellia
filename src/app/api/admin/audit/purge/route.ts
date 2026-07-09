import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { auditPurge } from "@/lib/scheduler/jobs/auditPurge";
import { logAdminEvent } from "@/lib/db/adminAudit";

/**
 * POST /api/admin/audit/purge
 * Body: { olderThanDays: number }  // 1 <= days <= 3650
 *
 * Deletes audit events older than `olderThanDays`. Admin-only, CSRF-checked.
 * The purge itself gets logged so operators can prove when retention ran.
 */
const bodySchema = z.object({
  olderThanDays: z.number().int().min(1).max(3650),
});

export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const result = await auditPurge({ olderThanDays: parsed.data.olderThanDays });

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:    actor?.id    ?? null,
    userEmail: actor?.email ?? null,
    action:    "audit.purge",
    resourceType: "admin_events",
    details:   { olderThanDays: parsed.data.olderThanDays, deleted: result.deleted },
  });

  return NextResponse.json({ ok: true, deleted: result.deleted });
}
