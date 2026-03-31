import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { userFormGrants, formInstances, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";

interface Props {
  params: Promise<{ id: string }>;
}

/** GET /api/admin/users/[id]/grants — list grants for a user (admin only) */
export async function GET(req: NextRequest, { params }: Props) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  const grants = await db
    .select({
      id:             userFormGrants.id,
      formInstanceId: userFormGrants.formInstanceId,
      role:           userFormGrants.role,
      grantedAt:      userFormGrants.grantedAt,
      formName:       formInstances.name,
      formSlug:       formInstances.slug,
    })
    .from(userFormGrants)
    .leftJoin(formInstances, eq(userFormGrants.formInstanceId, formInstances.id))
    .where(eq(userFormGrants.userId, id));

  return NextResponse.json({ grants });
}

const putSchema = z.object({
  grants: z.array(z.object({
    formInstanceId: z.string().uuid(),
    role: z.enum(["editor", "agent", "viewer"]),
  })).max(500),
});

/**
 * PUT /api/admin/users/[id]/grants — replace all grants for a user (admin only).
 * Accepts an array of { formInstanceId, role }. An empty array removes all grants.
 */
export async function PUT(req: NextRequest, { params }: Props) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id: userId } = await params;
  const actor = await validateAdminSession(req);

  // Prevent an admin from modifying their own grants
  const actorId = actor?.id?.startsWith("apikey:") ? actor.id.slice(7) : actor?.id;
  if (actorId && actorId === userId) {
    return NextResponse.json({ error: "Vous ne pouvez pas modifier vos propres grants" }, { status: 403 });
  }

  // Verify target user exists
  const targetUser = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (targetUser.length === 0) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 }
    );
  }

  const { grants } = parsed.data;

  // Verify all formInstanceIds actually exist before touching grants
  if (grants.length > 0) {
    const formIds = grants.map(g => g.formInstanceId);
    const existing = await db
      .select({ id: formInstances.id })
      .from(formInstances)
      .where(inArray(formInstances.id, formIds));
    const existingIds = new Set(existing.map(r => r.id));
    const missing = formIds.filter(id => !existingIds.has(id));
    if (missing.length > 0) {
      return NextResponse.json({ error: `Formulaire(s) introuvable(s) : ${missing.join(", ")}` }, { status: 400 });
    }
  }

  const grantedBy = actor?.id?.startsWith("apikey:") ? null : (actor?.id ?? null);

  // Replace grants atomically — delete + insert in a single transaction
  await db.transaction(async (tx) => {
    await tx.delete(userFormGrants).where(eq(userFormGrants.userId, userId));
    if (grants.length > 0) {
      await tx.insert(userFormGrants).values(
        grants.map(g => ({
          userId,
          formInstanceId: g.formInstanceId,
          role:           g.role,
          grantedBy,
        }))
      );
    }
  });

  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "user.grants.update",
    resourceType: "user",
    resourceId:   userId,
    details:      { grantCount: grants.length },
  });

  return NextResponse.json({ ok: true, grantCount: grants.length });
}
