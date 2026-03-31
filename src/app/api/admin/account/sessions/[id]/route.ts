import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAdminMutation, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { lucia } from "@/lib/auth/lucia";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminMutation(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Cannot revoke the current session
  const cookieStore = await cookies();
  const currentSessionId = cookieStore.get(lucia.sessionCookieName)?.value;
  if (id === currentSessionId) {
    return NextResponse.json(
      { error: "Cannot revoke the current session" },
      { status: 400 }
    );
  }

  const result = await db.delete(sessions).where(
    and(eq(sessions.id, id), eq(sessions.userId, user.id))
  ).returning({ id: sessions.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
  }

  logAdminEvent({
    userId: user.id,
    userEmail: user.email,
    action: "session.revoke",
    resourceType: "session",
    resourceId: id,
    details: {},
  });

  return NextResponse.json({ success: true });
}
