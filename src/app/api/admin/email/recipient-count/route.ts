import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole } from "@/lib/auth/validateSession";
import { getMergedDataPoolKeys } from "@/lib/datapools/compute";
import { dedupKeysAcrossLists } from "@/lib/datapools/dedup";
import { ADDITIONAL_RECIPIENTS_MAX, normalizeAdditionalRecipients } from "@/lib/email/additionalRecipients";
import { z } from "zod";

const bodySchema = z.object({
  dataPoolIds:          z.array(z.string().uuid()).default([]),
  additionalRecipients: z.array(z.string().min(1).max(320)).max(ADDITIONAL_RECIPIENTS_MAX).default([]),
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

  const extras = normalizeAdditionalRecipients(parsed.data.additionalRecipients);

  // Skip the DB round-trip when there's nothing to look up. The extras path
  // is purely in-memory so it's free to evaluate even with no pools selected.
  const poolKeys =
    parsed.data.dataPoolIds.length === 0
      ? []
      : await getMergedDataPoolKeys(parsed.data.dataPoolIds);

  const recipients = dedupKeysAcrossLists([poolKeys, extras]);
  return NextResponse.json({
    recipientCount:           recipients.length,
    poolCount:                parsed.data.dataPoolIds.length,
    additionalRecipientCount: extras.length,
  });
}
