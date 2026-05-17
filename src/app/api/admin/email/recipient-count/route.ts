import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole } from "@/lib/auth/validateSession";
import { getMergedDataPoolKeys } from "@/lib/datapools/compute";
import { z } from "zod";

const bodySchema = z.object({
  dataPoolIds: z.array(z.string().uuid()).default([]),
});

/**
 * POST /api/admin/email/recipient-count
 *
 * Stateless helper for the composer UI: given a candidate `dataPoolIds`
 * array, return the deduplicated recipient count. Used to refresh the
 * "X destinataires au total" badge on every toggle without saving the
 * broadcast or rendering its HTML body.
 *
 * Cheaper than `/broadcasts/:id/preview` because it skips DOMPurify + juice.
 */
export async function POST(req: NextRequest) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 422 });
  }

  if (parsed.data.dataPoolIds.length === 0) {
    return NextResponse.json({ recipientCount: 0, poolCount: 0 });
  }

  const recipients = await getMergedDataPoolKeys(parsed.data.dataPoolIds);
  return NextResponse.json({
    recipientCount: recipients.length,
    poolCount:      parsed.data.dataPoolIds.length,
  });
}
