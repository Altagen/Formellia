import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { removeSubmissionExclusion } from "@/lib/datapools/crud";

type Props = { params: Promise<{ id: string; submissionId: string }> };

export async function DELETE(req: NextRequest, { params }: Props) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;
  const { id, submissionId } = await params;

  const removed = await removeSubmissionExclusion(id, submissionId);
  if (!removed) return NextResponse.json({ error: "Exclusion not found" }, { status: 404 });

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "datapool.exclusion.remove",
    resourceType: "data_pool",
    resourceId:   id,
    details:      { submissionId },
  });

  return NextResponse.json({ success: true });
}
