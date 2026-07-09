import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { setDefaultEmailProvider } from "@/lib/email/providers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  const { id } = await params;
  const updated = await setDefaultEmailProvider(id);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "email.provider.set_default",
    resourceType: "email_provider",
    resourceId:   id,
    details:      { name: updated.name },
  });

  return NextResponse.json(updated);
}
