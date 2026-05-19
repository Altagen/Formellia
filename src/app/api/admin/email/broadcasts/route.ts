import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { listBroadcasts, createBroadcast } from "@/lib/email/broadcastCrud";
import { createBroadcastSchema } from "@/lib/email/broadcastValidation";

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;
  const rows = await listBroadcasts();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  const parsed = createBroadcastSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 422 });
  }

  const actor = await validateAdminSession(req);
  const row = await createBroadcast(parsed.data, actor?.id ?? null);

  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "email.broadcast.draft",
    resourceType: "email_broadcast",
    resourceId:   row.id,
    details:      { name: row.name, dataPoolCount: row.dataPoolIds.length },
  });

  return NextResponse.json(row, { status: 201 });
}
