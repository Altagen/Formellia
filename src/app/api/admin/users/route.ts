import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { users, adminEvents } from "@/lib/db/schema";
import { sql, gte, and, eq as deq } from "drizzle-orm";
import { validateAdminSession, requireAdminMutation, requireRole } from "@/lib/auth/validateSession";
import { validatePassword } from "@/lib/security/passwordPolicy";
import { getUserCreationRateLimit } from "@/lib/security/userCreationRateLimit";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { logger } from "@/lib/logger";

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,50}$/;

const createUserSchema = z.object({
  username: z.string().regex(USERNAME_RE, "Invalid username (3-50 characters: letters, digits, _ and -)"),
  email: z.string().email("Invalid email").optional().or(z.literal("")).transform(v => v || undefined),
  password: z.string().min(8, "Password too short (min 8 characters)"),
});

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  try {
    const allUsers = await db.select({ id: users.id, username: users.username, email: users.email, role: users.role }).from(users);
    return NextResponse.json(allUsers);
  } catch (error) {
    logger.error({ err: error }, "Users GET error");
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  // Bootstrap check: if no users exist yet, skip auth (first admin creation)
  const existingCount = await db.select({ id: users.id }).from(users).limit(1);
  const isBootstrap = existingCount.length === 0;

  if (!isBootstrap) {
    const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
    if (guard) return guard;
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const first = Object.values(fieldErrors).flat()[0];
    return NextResponse.json(
      { error: first ?? "Invalid data" },
      { status: 400 }
    );
  }

  const { username, email, password } = parsed.data;

  // Validate against password policy (no-op if policy is disabled)
  const policyCheck = await validatePassword(password);
  if (!policyCheck.valid) {
    return NextResponse.json({ error: policyCheck.errors[0] }, { status: 400 });
  }

  // Rate limit: configurable account creations per hour (via audit log)
  // limit === 0 means creation is fully disabled
  try {
    const limit = await getUserCreationRateLimit();
    if (limit === 0) {
      return NextResponse.json({ error: "Account creation has been disabled by the administrator." }, { status: 429 });
    }
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const [recent] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminEvents)
      .where(and(deq(adminEvents.action, "user.create"), gte(adminEvents.createdAt, oneHourAgo)));
    if ((recent?.count ?? 0) >= limit) {
      return NextResponse.json({ error: "Too many account creations. Try again in one hour." }, { status: 429 });
    }
  } catch (err) { logger.warn({ err }, "Rate limit check failed — proceeding without limit (audit table unavailable)"); }

  try {
    const result = await db.transaction(async (tx) => {
      // Re-check inside transaction to close the race window
      const existingUsers = await tx.select({ id: users.id }).from(users).limit(1);
      const bootstrapInTx = existingUsers.length === 0;

      if (!bootstrapInTx) {
        const caller = await validateAdminSession(req);
        if (!caller) return "UNAUTHORIZED" as const;
      }

      // Check duplicate username inside same transaction
      const dupUsername = await tx.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
      if (dupUsername.length > 0) return "DUPLICATE_USERNAME" as const;

      // Check duplicate email (only if email provided)
      if (email) {
        const dupEmail = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
        if (dupEmail.length > 0) return "DUPLICATE_EMAIL" as const;
      }

      const hashedPassword = await bcrypt.hash(password, 13);
      const id = nanoid();
      await tx.insert(users).values({ id, username, email: email ?? null, hashedPassword });
      return id;
    });

    if (result === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (result === "DUPLICATE_USERNAME") {
      return NextResponse.json({ error: "This username is already taken" }, { status: 409 });
    }
    if (result === "DUPLICATE_EMAIL") {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const actor = await validateAdminSession(req);
    logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "user.create", resourceType: "user", resourceId: result, details: { username, email, bootstrap: isBootstrap } });
    return NextResponse.json({ success: true, id: result, bootstrap: isBootstrap }, { status: 201 });

  } catch (error) {
    logger.error({ err: error }, "Users POST error");
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
