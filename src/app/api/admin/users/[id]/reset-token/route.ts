import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, passwordResetTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminMutation, requireRole } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { validateAdminSession } from "@/lib/auth/validateSession";
import { checkResetTokenGeneration } from "@/lib/security/resetRateLimit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfGuard = await requireAdminMutation(req);
  if (csrfGuard) return csrfGuard;
  const roleGuard = await requireRole("admin", req);
  if (roleGuard) return roleGuard;

  const { id } = await params;

  // Rate limit: max 3 token generations per hour per target user
  const rl = await checkResetTokenGeneration(id);
  if (rl.blocked) {
    return NextResponse.json(
      { error: "Too many links generated for this user. Try again in 1 hour." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  // Verify target user exists
  const [targetUser] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!targetUser) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  // Invalidate any previous tokens for this user
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));

  // Generate a plain UUID token, store only its SHA-256 hash
  const plainToken = crypto.randomUUID();
  const hashedToken = crypto.createHash("sha256").update(plainToken).digest("hex");

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await db.insert(passwordResetTokens).values({
    token: hashedToken,
    userId: id,
    expiresAt,
  });

  const currentUser = await validateAdminSession(req);
  logAdminEvent({
    userId: currentUser?.id ?? null,
    userEmail: currentUser?.email ?? null,
    action: "user.reset_token_generated",
    resourceType: "user",
    resourceId: id,
    details: { targetEmail: targetUser.email },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  // Use URL fragment so the plain token never appears in server logs or Referer headers
  const resetUrl = `${baseUrl}/admin/reset-password#token=${plainToken}`;

  return NextResponse.json({ resetUrl, expiresAt });
}
