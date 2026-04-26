import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireAdminMutation, validateAdminSession } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { logAdminEvent } from "@/lib/db/adminAudit";

const ROLE_LEVELS = { viewer: 0, editor: 1, admin: 2 } as const;
type Role = keyof typeof ROLE_LEVELS;

const createSchema = z.object({
  name:      z.string().min(1).max(100),
  role:      z.enum(["viewer", "editor", "admin"]).default("editor"),
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const keys = await db
    .select({
      id:              apiKeys.id,
      name:            apiKeys.name,
      role:            apiKeys.role,
      createdByUserId: apiKeys.createdByUserId,
      lastUsedAt:      apiKeys.lastUsedAt,
      expiresAt:       apiKeys.expiresAt,
      createdAt:       apiKeys.createdAt,
      // keyHash intentionally omitted — never expose even truncated
    })
    .from(apiKeys)
    .orderBy(apiKeys.createdAt);

  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req);
  if (guard) return guard;

  const actor = await validateAdminSession(req);
  if (!actor) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid parameters" }, { status: 400 });
  }

  // A key's role cannot exceed the creator's role
  const actorLevel = ROLE_LEVELS[actor.role as Role] ?? 0;
  const requestedLevel = ROLE_LEVELS[parsed.data.role];
  if (requestedLevel > actorLevel) {
    return NextResponse.json(
      { error: `Cannot create a key with a role higher than your own (${actor.role})` },
      { status: 403 }
    );
  }

  // Generate a cryptographically random key — shown once, never stored in plaintext
  const rawKey = `sk_${randomBytes(32).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const creatorId = actor.id.startsWith("apikey:") ? null : actor.id;

  const [created] = await db
    .insert(apiKeys)
    .values({
      name:            parsed.data.name,
      keyHash,
      role:            parsed.data.role,
      createdByUserId: creatorId,
      expiresAt:       parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    })
    .returning({
      id:        apiKeys.id,
      name:      apiKeys.name,
      role:      apiKeys.role,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    });

  logAdminEvent({
    userId:       actor.id,
    userEmail:    actor.email,
    action:       "apikey.create",
    resourceType: "api_key",
    resourceId:   created.id,
    details:      { name: created.name, role: created.role },
  });

  // rawKey returned ONCE — caller must copy it. key object is nested so the UI can destructure cleanly.
  return NextResponse.json({ key: { ...created, lastUsedAt: null }, rawKey }, { status: 201 });
}
