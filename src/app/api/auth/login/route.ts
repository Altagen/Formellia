import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { lucia } from "@/lib/auth/lucia";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/security/loginRateLimit";
import { getClientIp } from "@/lib/security/getClientIp";
import { getSessionDurationDays } from "@/lib/security/sessionConfig";
import { authLogger as log } from "@/lib/logger";
import { z } from "zod";

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Identifier or password missing" }, { status: 400 });
    }

    const { identifier, password } = parsed.data;

    // Rate limit by IP — uses trusted proxy model (see TRUSTED_PROXY env var)
    const ip = getClientIp(req);
    const rl = await checkLoginRateLimit(ip);
    if (rl.blocked) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again in 15 minutes." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
        }
      );
    }

    // Look up user by username or email
    let user;
    try {
      const rows = await db.select().from(users).where(
        or(eq(users.username, identifier), eq(users.email, identifier))
      ).limit(1);
      user = rows[0];
    } catch (dbError) {
      log.error({ err: dbError }, "DB error looking up user");
      return NextResponse.json(
        { error: "Database connection error. Please try again." },
        { status: 503 }
      );
    }

    if (!user) {
      return NextResponse.json({ error: "Invalid identifier or password" }, { status: 401 });
    }

    // Verify password — supports bcrypt (current) and SHA-256 (legacy migration path)
    const isBcrypt = user.hashedPassword.startsWith("$2");
    let passwordValid: boolean;
    if (isBcrypt) {
      passwordValid = await bcrypt.compare(password, user.hashedPassword);
    } else {
      const sha = createHash("sha256").update(password).digest("hex");
      passwordValid = sha === user.hashedPassword;
    }

    if (!passwordValid) {
      return NextResponse.json({ error: "Invalid identifier or password" }, { status: 401 });
    }

    // Auto-upgrade SHA-256 passwords to bcrypt on successful login
    if (!isBcrypt) {
      const upgraded = await bcrypt.hash(password, 13);
      await db.update(users).set({ hashedPassword: upgraded }).where(eq(users.id, user.id));
    }

    // Reset rate limit on successful login
    await resetLoginRateLimit(ip);

    // Create session
    let session;
    try {
      session = await lucia.createSession(user.id, {});
    } catch (sessionError) {
      log.error({ err: sessionError }, "Error creating session");
      return NextResponse.json(
        { error: "Could not create session. Please try again." },
        { status: 503 }
      );
    }

    // Apply configured session duration (cookie maxAge + DB expiry)
    const durationDays = await getSessionDurationDays();
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, session.id));

    const sessionCookie = lucia.createSessionCookie(session.id);
    const response = NextResponse.json({ success: true, mustChangePassword: user.mustChangePassword });
    response.cookies.set(sessionCookie.name, sessionCookie.value, {
      ...sessionCookie.attributes,
      maxAge: durationDays * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    log.error({ err: error }, "Unexpected login error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
