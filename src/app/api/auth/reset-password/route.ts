import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, passwordResetTokens, sessions } from "@/lib/db/schema";
import { validatePassword } from "@/lib/security/passwordPolicy";
import { getClientIp } from "@/lib/security/getClientIp";
import { checkResetPasswordVerification } from "@/lib/security/resetRateLimit";

const schema = z.object({
  // Plain UUID token sent by the client — server will SHA-256 it before DB lookup
  token: z.string().uuid("Invalid token"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().formErrors[0] ?? "Invalid data" }, { status: 400 });
  }

  const { token, newPassword } = parsed.data;

  // Rate limit by IP — max 10 attempts per 15 min
  const ip = getClientIp(req);
  const rl = await checkResetPasswordVerification(ip);
  if (rl.blocked) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  // Validate new password policy
  const policyCheck = await validatePassword(newPassword);
  if (!policyCheck.valid) {
    return NextResponse.json({ error: policyCheck.errors[0] }, { status: 400 });
  }

  // Hash the incoming plain token — we only store hashes
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  // Find valid (unused, non-expired) token by its hash
  const now = new Date();
  const [tokenRow] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, hashedToken),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now)
      )
    )
    .limit(1);

  if (!tokenRow) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
  }

  // Update password, invalidate all user sessions, and mark token used — atomically
  const newHash = await bcrypt.hash(newPassword, 13);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ hashedPassword: newHash })
      .where(eq(users.id, tokenRow.userId));
    // Invalidate all existing sessions so stolen sessions can't persist after reset
    await tx.delete(sessions).where(eq(sessions.userId, tokenRow.userId));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.token, hashedToken));
  });

  return NextResponse.json({ success: true });
}
