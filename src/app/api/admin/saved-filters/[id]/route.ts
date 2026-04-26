import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { savedFilters } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAdminMutation, validateAdminSession } from "@/lib/auth/validateSession";

const patchSchema = z.object({
  name:    z.string().min(1).max(100).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
}).refine(d => d.name !== undefined || d.filters !== undefined, {
  message: "Au moins un champ (name, filters) est requis",
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminMutation(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "JSON invalide" }, { status: 400 });

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const rows = await db.update(savedFilters)
    .set({
      ...(parsed.data.name    !== undefined ? { name:    parsed.data.name }    : {}),
      ...(parsed.data.filters !== undefined ? { filters: parsed.data.filters } : {}),
    })
    .where(and(eq(savedFilters.id, id), eq(savedFilters.userId, user.id)))
    .returning();

  if (rows.length === 0) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminMutation(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await db.delete(savedFilters).where(
    and(eq(savedFilters.id, id), eq(savedFilters.userId, user.id))
  );

  return NextResponse.json({ deleted: true });
}
