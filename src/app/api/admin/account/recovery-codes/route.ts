/**
 * Recovery codes management.
 *
 * POST  — Generate 8 new codes (replaces existing ones). Returns plain codes ONE TIME.
 * DELETE — Clear all recovery codes.
 *
 * Storage: SHA-256 hashed array in users.recoveryCodes (jsonb).
 * Each code is used once; consumed codes are removed from the array.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdminMutation, requireAdminSession, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";

const CODE_COUNT = 8;

function generateCode(): string {
  // 4 groups of 4 hex chars = "a1b2-c3d4-e5f6-a7b8"
  const raw = randomBytes(8).toString("hex"); // 16 hex chars
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code.replace(/-/g, "")).digest("hex");
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  const plainCodes = Array.from({ length: CODE_COUNT }, generateCode);
  const hashedCodes = plainCodes.map(hashCode);

  await db.update(users).set({ recoveryCodes: hashedCodes }).where(eq(users.id, user.id));

  logAdminEvent({
    userId: user.id,
    userEmail: user.email,
    action: "account.recovery_codes_generated",
  });

  return NextResponse.json({ codes: plainCodes });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdminMutation(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  await db.update(users).set({ recoveryCodes: null }).where(eq(users.id, user.id));

  logAdminEvent({
    userId: user.id,
    userEmail: user.email,
    action: "account.recovery_codes_cleared",
  });

  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const guard = await requireAdminSession(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  const rows = await db.select({ recoveryCodes: users.recoveryCodes }).from(users).where(eq(users.id, user.id)).limit(1);
  const count = rows[0]?.recoveryCodes?.length ?? 0;

  return NextResponse.json({ count });
}
