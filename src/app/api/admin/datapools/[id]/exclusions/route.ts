import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { addSubmissionExclusion } from "@/lib/datapools/crud";
import { addSubmissionExclusionSchema } from "@/lib/datapools/validation";

type Props = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Props) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = addSubmissionExclusionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 422 });
  }

  const actor = await validateAdminSession(req);
  try {
    const row = await addSubmissionExclusion(id, parsed.data, actor?.id ?? null);
    logAdminEvent({
      userId:       actor?.id ?? null,
      userEmail:    actor?.email ?? null,
      action:       "datapool.exclusion.add",
      resourceType: "data_pool",
      resourceId:   id,
      details:      { submissionId: parsed.data.submissionId, reason: parsed.data.reason ?? null },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    // Likely a FK violation on a non-existent pool or submission — surface as 422
    // rather than 500 so the UI can show a friendlier message.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create exclusion" },
      { status: 422 },
    );
  }
}
