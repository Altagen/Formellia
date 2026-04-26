import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireAdminSession, validateAdminSession } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { logAdminEvent } from "@/lib/db/adminAudit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest) {
  const guard = await requireAdminSession(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  const rows = await db.select({ email: users.email }).from(users).where(eq(users.id, user.id)).limit(1);
  return NextResponse.json({ email: rows[0]?.email ?? null });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdminMutation(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  let body: { email?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = body.email === "" ? null : (body.email ?? null);

  if (email !== null && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Format d'email invalide" }, { status: 400 });
  }

  if (email !== null) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), ne(users.id, user.id)))
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: "email_duplicate" }, { status: 409 });
    }
  }

  await db.update(users).set({ email }).where(eq(users.id, user.id));

  logAdminEvent({ userId: user.id, userEmail: user.email, action: "account.email_change", resourceType: "user", resourceId: user.id, details: { newEmail: email } });

  return NextResponse.json({ success: true });
}
