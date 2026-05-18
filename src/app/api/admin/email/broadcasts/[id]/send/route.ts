import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { checkAdminRateLimit } from "@/lib/security/adminRateLimit";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { getBroadcast, claimForSend } from "@/lib/email/broadcastCrud";
import { executeBroadcast } from "@/lib/email/broadcastService";

type Props = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/email/broadcasts/:id/send
 *
 * Fires the broadcast. Flow:
 *   1. Verify the row is in `draft` state (reject 409 otherwise).
 *   2. Atomically transition to `sending` so a concurrent click can't
 *      double-send.
 *   3. Execute — the service layer fans out to the provider, then writes
 *      back counts / status.
 *   4. Audit log.
 *
 * The endpoint blocks until the send completes. For most operator-driven
 * audiences (< 1k recipients) this is acceptable — typical provider
 * round-trip is a couple of seconds. A queue/job pattern is left for the
 * future newsletter feature where audiences are larger.
 */
export async function POST(req: NextRequest, { params }: Props) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  // Per-user rate limit — sending a broadcast triggers an outbound provider
  // call that costs money and floods recipient mailboxes. Cap at 10 sends per
  // minute per admin to prevent both accidental retry loops and abuse via
  // stolen credentials.
  const actor = await validateAdminSession(req);
  const rlKey = `broadcast-send:${actor?.id ?? "anon"}`;
  const rl = checkAdminRateLimit(rlKey, 10, 60_000);
  if (rl.blocked) {
    return NextResponse.json(
      { error: "Too many broadcast send attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const { id } = await params;
  const existing = await getBroadcast(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.status !== "draft") {
    return NextResponse.json(
      { error: `Cannot send a broadcast in "${existing.status}" state` },
      { status: 409 },
    );
  }

  // Block sending a draft that has nothing to send to — surface as 422 with
  // a clear message rather than wasting a `claimForSend` + provider round-trip
  // just to write back "no recipients" to the row.
  if (!existing.dataPoolIds || existing.dataPoolIds.length === 0) {
    return NextResponse.json(
      { error: "Cannot send: no DataPool selected. Pick at least one." },
      { status: 422 },
    );
  }

  const claimed = await claimForSend(id);
  if (!claimed) {
    return NextResponse.json({ error: "Could not claim broadcast" }, { status: 409 });
  }

  try {
    const result = await executeBroadcast(claimed);
    logAdminEvent({
      userId:       actor?.id ?? null,
      userEmail:    actor?.email ?? null,
      action:       "email.broadcast.send",
      resourceType: "email_broadcast",
      resourceId:   id,
      details:      {
        recipientCount: result.recipientCount,
        sent:           result.sent,
        failed:         result.failed,
        ...(result.error ? { error: result.error } : {}),
      },
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    logAdminEvent({
      userId:       actor?.id ?? null,
      userEmail:    actor?.email ?? null,
      action:       "email.broadcast.send.failed",
      resourceType: "email_broadcast",
      resourceId:   id,
      details:      { error: e instanceof Error ? e.message : String(e) },
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Send failed" },
      { status: 500 },
    );
  }
}
