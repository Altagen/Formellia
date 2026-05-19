import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole } from "@/lib/auth/validateSession";
import { getBroadcast } from "@/lib/email/broadcastCrud";
import { buildBroadcastPreview } from "@/lib/email/broadcastService";

type Props = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/email/broadcasts/:id/preview
 *
 * Resolves the recipient set from the broadcast's DataPools and returns the
 * final HTML (sanitized + CSS-inlined), the plain-text alternative, and the
 * resolved recipient list. Uses POST (not GET) because the operation may be
 * expensive on large pools.
 *
 * The returned recipient list is intentionally complete — the UI shows a
 * truncated/redacted version (e.g. "alice@e…  bob@e…  …243 more"). Full
 * disclosure is fine here: the operator running the preview already has
 * admin access, and the addresses are deduplicated copies of their own
 * DataPools.
 */
export async function POST(req: NextRequest, { params }: Props) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  const { id } = await params;
  const row = await getBroadcast(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const preview = await buildBroadcastPreview(row);
  return NextResponse.json(preview);
}
