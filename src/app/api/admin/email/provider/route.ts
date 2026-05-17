import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { getBroadcastEmailConfigSafe, saveBroadcastEmailConfig } from "@/lib/email/broadcastConfig";
import { updateBroadcastConfigSchema } from "@/lib/email/broadcastValidation";

/**
 * GET  /api/admin/email/provider — current global broadcast config, NEVER
 *                                  including the plaintext API key.
 * PUT  /api/admin/email/provider — partial update. `apiKey: ""` clears the
 *                                  stored key; `apiKey: undefined` leaves it
 *                                  alone (useful when editing fromAddress
 *                                  without re-entering the secret).
 */
export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;
  const cfg = await getBroadcastEmailConfigSafe();
  return NextResponse.json(cfg);
}

export async function PUT(req: NextRequest) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  const parsed = updateBroadcastConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 422 });
  }

  await saveBroadcastEmailConfig(parsed.data);

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "email.provider.update",
    resourceType: "app_config",
    resourceId:   "broadcast_email",
    // Echo only the fields that changed — never the key itself.
    details:      {
      fieldsChanged: Object.keys(parsed.data).filter(k => k !== "apiKey"),
      apiKeyChanged: parsed.data.apiKey !== undefined,
    },
  });

  return NextResponse.json(await getBroadcastEmailConfigSafe());
}
