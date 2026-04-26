import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { lucia } from "@/lib/auth/lucia";
import { requireAdminMutation, validateAdminSession } from "@/lib/auth/validateSession";
import { validatePassword } from "@/lib/security/passwordPolicy";
import { logAdminEvent } from "@/lib/db/adminAudit";

const schema = z.object({
  currentPassword: z.string().min(1, "Current password required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function PATCH(req: NextRequest) {
  const guard = await requireAdminMutation(req);
  if (guard) return guard;

  const user = await validateAdminSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().formErrors[0] ?? "Invalid data" }, { status: 400 });
  }

  const { currentPassword, newPassword } = parsed.data;

  // Validate new password against policy before touching the DB
  const policyCheck = await validatePassword(newPassword);
  if (!policyCheck.valid) {
    return NextResponse.json({ error: policyCheck.errors[0] }, { status: 400 });
  }

  // Fetch current hashed password
  const rows = await db.select({ hashedPassword: users.hashedPassword }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { hashedPassword } = rows[0];

  // Verify current password — supports bcrypt (new) and SHA-256 (legacy)
  const isBcrypt = hashedPassword.startsWith("$2");
  let valid: boolean;
  if (isBcrypt) {
    valid = await bcrypt.compare(currentPassword, hashedPassword);
  } else {
    const sha = createHash("sha256").update(currentPassword).digest("hex");
    valid = sha === hashedPassword;
  }

  if (!valid) {
    return NextResponse.json({ error: "Incorrect current password" }, { status: 400 });
  }

  const newHash = await bcrypt.hash(newPassword, 13);
  await db.update(users).set({ hashedPassword: newHash, mustChangePassword: false }).where(eq(users.id, user.id));

  // Invalidate ALL existing sessions — any stolen session token is now worthless
  await lucia.invalidateUserSessions(user.id);

  // Create a fresh session so the current user stays logged in
  const newSession = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(newSession.id);

  logAdminEvent({ userId: user.id, userEmail: user.email, action: "user.password_change", resourceType: "user", resourceId: user.id });

  const response = NextResponse.json({ success: true });
  response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
  return response;
}
