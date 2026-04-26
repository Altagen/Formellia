import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";

const patchSchema = z.object({
  // null = scoped-only access via user_form_grants
  role: z.enum(["admin", "editor", "agent", "viewer"]).nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const currentUser = await validateAdminSession(req);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Prevent admins from changing their own role (could lock themselves out)
  if (id === currentUser.id) {
    return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  if (existing.length === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await db.update(users).set({ role: parsed.data.role }).where(eq(users.id, id));
  logAdminEvent({ userId: currentUser.id, userEmail: currentUser.email, action: "user.role_change", resourceType: "user", resourceId: id, details: { newRole: parsed.data.role } });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const currentUser = await validateAdminSession(req);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Prevent self-deletion — would lock the admin out permanently
  if (id === currentUser.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  if (existing.length === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await db.delete(users).where(eq(users.id, id));
  logAdminEvent({ userId: currentUser.id, userEmail: currentUser.email, action: "user.delete", resourceType: "user", resourceId: id });
  return NextResponse.json({ success: true });
}
