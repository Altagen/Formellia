import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, validateAdminSession } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logAdminEvent } from "@/lib/db/adminAudit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminMutation(req);
  if (guard) return guard;

  const actor = await validateAdminSession(req);
  if (!actor) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await params;

  const rows = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
  if (!rows[0]) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const key = rows[0];

  // Editors and above can only revoke their own keys; admins can revoke any key
  const ROLE_LEVELS = { viewer: 0, editor: 1, admin: 2 } as const;
  const actorLevel = ROLE_LEVELS[actor.role as keyof typeof ROLE_LEVELS] ?? 0;
  const isOwn = key.createdByUserId === actor.id;
  if (!isOwn && actorLevel < ROLE_LEVELS.admin) {
    return NextResponse.json({ error: "Only an admin can revoke another user's key" }, { status: 403 });
  }

  await db.delete(apiKeys).where(eq(apiKeys.id, id));

  logAdminEvent({
    userId:       actor.id,
    userEmail:    actor.email,
    action:       "apikey.revoke",
    resourceType: "api_key",
    resourceId:   id,
    details:      { name: key.name, role: key.role },
  });

  return NextResponse.json({ success: true });
}
