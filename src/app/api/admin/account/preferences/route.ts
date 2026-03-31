import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdminMutation, requireAdminSession, validateAdminSession } from "@/lib/auth/validateSession";

const patchSchema = z.object({
  themeMode:   z.enum(["light", "dark"]).optional(),
  colorPreset: z.string().min(1).max(20).optional(),
  locale:      z.enum(["fr", "en"]).optional(),
});

export async function GET(req: NextRequest) {
  const guard = await requireAdminSession(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({ themeMode: users.themeMode, colorPreset: users.colorPreset, locale: users.locale })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdminMutation(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const updates: Partial<{ themeMode: string; colorPreset: string; locale: string }> = {};
  if (parsed.data.themeMode   !== undefined) updates.themeMode   = parsed.data.themeMode;
  if (parsed.data.colorPreset !== undefined) updates.colorPreset = parsed.data.colorPreset;
  if (parsed.data.locale      !== undefined) updates.locale      = parsed.data.locale;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await db.update(users).set(updates).where(eq(users.id, user.id));

  const rows = await db
    .select({ themeMode: users.themeMode, colorPreset: users.colorPreset, locale: users.locale })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return NextResponse.json(rows[0] ?? updates);
}
