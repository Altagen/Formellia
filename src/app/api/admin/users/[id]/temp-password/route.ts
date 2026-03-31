import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";

/** Generates a secure 16-char temp password: uppercase + digits + lowercase. */
function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const all = upper + digits + lower;
  const bytes = randomBytes(16);
  // Guarantee at least 2 of each required char class
  const chars = [
    upper[bytes[0] % upper.length],
    upper[bytes[1] % upper.length],
    digits[bytes[2] % digits.length],
    digits[bytes[3] % digits.length],
    ...Array.from({ length: 12 }, (_, i) => all[bytes[4 + i] % all.length]),
  ];
  // Fisher-Yates shuffle using remaining random bytes
  const shuffleBytes = randomBytes(16);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1);
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
  if (existing.length === 0) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

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
