import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";

/**
 * Uniform sample of an index in [0, n) from a stream of crypto-secure bytes.
 * Rejection-samples to skip the top `256 % n` bytes so every index has the
 * same probability — no modulo bias.
 */
function uniformIndex(n: number): number {
  const cutoff = Math.floor(256 / n) * n;
  let b: number;
  do {
    b = randomBytes(1)[0];
  } while (b >= cutoff);
  return b % n;
}

/** Generates a secure 16-char temp password: uppercase + digits + lowercase. */
function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const all = upper + digits + lower;
  // Guarantee at least 2 of each required char class
  const chars = [
    upper[uniformIndex(upper.length)],
    upper[uniformIndex(upper.length)],
    digits[uniformIndex(digits.length)],
    digits[uniformIndex(digits.length)],
    ...Array.from({ length: 12 }, () => all[uniformIndex(all.length)]),
  ];
  // Fisher-Yates shuffle — uniform swap index at every step
  for (let i = chars.length - 1; i > 0; i--) {
    const j = uniformIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const currentUser = await validateAdminSession(req);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Cannot reset your own password this way
  if (id === currentUser.id || id === currentUser.id.replace("apikey:", "")) {
    return NextResponse.json({ error: "Utilisez la page Mon compte pour changer votre propre mot de passe" }, { status: 400 });
  }

  const existing = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, id)).limit(1);
  if (existing.length === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const tempPassword = generateTempPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 13);

  // Atomic: update password + set mustChangePassword + delete all sessions
  await db.transaction(async (tx) => {
    await tx.update(users)
      .set({ hashedPassword, mustChangePassword: true })
      .where(eq(users.id, id));
    await tx.delete(sessions).where(eq(sessions.userId, id));
  });

  logAdminEvent({
    userId: currentUser.id,
    userEmail: currentUser.email,
    action: "user.temp_password",
    resourceType: "user",
    resourceId: id,
    details: { targetUsername: existing[0].username },
  });

  return NextResponse.json({ tempPassword }, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" },
  });
}
