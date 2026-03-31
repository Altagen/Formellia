/**
 * POST /api/auth/recovery
 *
 * Authenticate using a one-time recovery code.
 * The code is consumed on use. The session is created with mustChangePassword=true.
 *
 * Body: { identifier: string, code: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { lucia } from "@/lib/auth/lucia";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/security/loginRateLimit";
import { getClientIp } from "@/lib/security/getClientIp";
import { getSessionDurationDays } from "@/lib/security/sessionConfig";
import { logAdminEvent } from "@/lib/db/adminAudit";

const bodySchema = z.object({
  identifier: z.string().min(1),
  code: z.string().min(1),
});

function hashCode(code: string): string {
  return createHash("sha256").update(code.replace(/-/g, "").toLowerCase()).digest("hex");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const { identifier, code } = parsed.data;

  const ip = getClientIp(req);
  const rl = await checkLoginRateLimit(ip);
  if (rl.blocked) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const rows = await db.select().from(users).where(
    or(eq(users.username, identifier), eq(users.email, identifier))
  ).limit(1);
  const user = rows[0];

  if (!user || !user.recoveryCodes?.length) {
    return NextResponse.json({ error: "Invalid recovery code" }, { status: 401 });
  }

  const hashed = hashCode(code);

  // Constant-time scan: always iterate ALL codes to avoid timing oracle.
  // timingSafeEqual requires equal-length buffers — SHA-256 hex is always 64 chars.
  const { timingSafeEqual } = await import("node:crypto");
  const hashedBuf = Buffer.from(hashed);
  let matchIdx = -1;
  for (let i = 0; i < user.recoveryCodes.length; i++) {
    const candidate = Buffer.from(user.recoveryCodes[i]);
    if (candidate.length === hashedBuf.length && timingSafeEqual(candidate, hashedBuf)) {
      matchIdx = i; // do NOT break — keep iterating to prevent early-exit timing leak
    }
  }

  if (matchIdx === -1) {
    return NextResponse.json({ error: "Invalid recovery code" }, { status: 401 });
  }

  // Consume the code — remove it from the array
  const remaining = user.recoveryCodes.filter((_, i) => i !== matchIdx);
  await db.update(users).set({
    recoveryCodes: remaining.length > 0 ? remaining : null,
    mustChangePassword: true,
  }).where(eq(users.id, user.id));

  await resetLoginRateLimit(ip);

  const session = await lucia.createSession(user.id, {});
  const durationDays = await getSessionDurationDays();
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, session.id));

  logAdminEvent({
    userId: user.id,
    userEmail: user.email ?? null,
    action: "account.recovery_code_used",
    details: { remainingCodes: remaining.length },
  });

  const sessionCookie = lucia.createSessionCookie(session.id);
  const response = NextResponse.json({ success: true, remainingCodes: remaining.length });
  response.cookies.set(sessionCookie.name, sessionCookie.value, {
    ...sessionCookie.attributes,
    maxAge: durationDays * 24 * 60 * 60,
  });
  return response;
}
