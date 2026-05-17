import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import {
  getBroadcast,
  updateBroadcastIfDraft,
  deleteBroadcast,
} from "@/lib/email/broadcastCrud";
import { updateBroadcastSchema } from "@/lib/email/broadcastValidation";

type Props = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Props) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;
  const { id } = await params;
  const row = await getBroadcast(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: Props) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateBroadcastSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 422 });
  }

  const row = await updateBroadcastIfDraft(id, parsed.data);
  if (!row) {
    // Either the row doesn't exist, or its status is not "draft". 409 is the
    // right code for "this state forbids the operation".
    const existing = await getBroadcast(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(
      { error: `Cannot edit a broadcast in "${existing.status}" state` },
      { status: 409 },
    );
  }

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "email.broadcast.update",
    resourceType: "email_broadcast",
    resourceId:   id,
    details:      { fieldsChanged: Object.keys(parsed.data) },
  });

  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, { params }: Props) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  const { id } = await params;
  const ok = await deleteBroadcast(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "email.broadcast.delete",
    resourceType: "email_broadcast",
    resourceId:   id,
    details:      {},
  });

  return NextResponse.json({ success: true });
}
