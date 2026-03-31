import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminSession, requireAdminMutation, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { lucia } from "@/lib/auth/lucia";

export async function GET(req: NextRequest) {
  const guard = await requireAdminSession(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, user.id));

  const cookieStore = await cookies();
  const currentSessionId = cookieStore.get(lucia.sessionCookieName)?.value;

  return NextResponse.json(
    userSessions.map(s => ({
      id: s.id,
      expiresAt: s.expiresAt,
      isCurrent: s.id === currentSessionId,
    }))
  );
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdminMutation(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  const currentSessionId = cookieStore.get(lucia.sessionCookieName)?.value;

  if (!currentSessionId) {
    return NextResponse.json({ error: "Aucune session courante identifiable" }, { status: 400 });
  }

  // Delete all sessions except the current one
  const allSessions = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, user.id));
  const othersIds = allSessions.map(s => s.id).filter(id => id !== currentSessionId);

  for (const id of othersIds) {
    await db.delete(sessions).where(eq(sessions.id, id));
  }

  if (othersIds.length > 0) {
    logAdminEvent({
      userId: user.id,
      userEmail: user.email,
      action: "session.revoke_all",
      resourceType: "session",
      resourceId: user.id,
      details: { revokedCount: othersIds.length },
    });
  }

  return NextResponse.json({ revoked: othersIds.length });
}
