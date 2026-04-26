import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { customCaCerts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  name:    z.string().min(1).max(200).optional(),
});

/** PATCH /api/admin/certs/:id — toggle enabled or rename */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps JSON invalide" }, { status: 422 });

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });

  const [existing] = await db.select({ id: customCaCerts.id }).from(customCaCerts).where(eq(customCaCerts.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Certificat introuvable" }, { status: 404 });

  await db.update(customCaCerts).set({
    ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
    ...(parsed.data.name    !== undefined ? { name:    parsed.data.name }    : {}),
  }).where(eq(customCaCerts.id, id));

  const { invalidateCustomCaCache } = await import("@/lib/security/customCa");
  invalidateCustomCaCache();

  return NextResponse.json({ success: true });
}

/** DELETE /api/admin/certs/:id — remove a custom CA cert */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  const [existing] = await db.select({ id: customCaCerts.id }).from(customCaCerts).where(eq(customCaCerts.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Certificat introuvable" }, { status: 404 });

  await db.delete(customCaCerts).where(eq(customCaCerts.id, id));

  const { invalidateCustomCaCache } = await import("@/lib/security/customCa");
  invalidateCustomCaCache();

  return NextResponse.json({ success: true });
}
