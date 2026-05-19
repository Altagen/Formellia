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

  // Snapshot the prior status + lastError BEFORE the update so we can record
  // them in the audit log. updateBroadcastIfDraft transitions a `failed` row
  // back to `draft` and clears `lastError` / `failedCount`, and without this
  // snapshot the failure context would be lost forever — only the side
  // effect (an edit happened) would remain in the audit chain.
  const priorRow = await getBroadcast(id);

  const row = await updateBroadcastIfDraft(id, parsed.data);
  if (!row) {
    // Either the row doesn't exist, or its status is not editable (i.e. it's
    // `sending` or `sent`). 409 is the right code for "this state forbids
    // the operation".
    if (!priorRow) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(
      { error: `Cannot edit a broadcast in "${priorRow.status}" state` },
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
    details: {
      fieldsChanged: Object.keys(parsed.data),
      // Preserve the failure context that the update may have just wiped —
      // operators can replay the chain `failed → edit → draft → re-send`
      // from the audit log alone instead of having to trust the live row.
      ...(priorRow?.status === "failed"
        ? {
            priorStatus:      "failed",
            priorLastError:   priorRow.lastError,
            priorFailedCount: priorRow.failedCount,
          }
        : {}),
    },
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
