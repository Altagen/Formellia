import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { getDataPool, updateDataPool, deleteDataPool, getDataPoolBySlug } from "@/lib/datapools/crud";
import { updateDataPoolSchema } from "@/lib/datapools/validation";

type Props = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Props) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;
  const { id } = await params;
  const pool = await getDataPool(id);
  if (!pool) return NextResponse.json({ error: "DataPool not found" }, { status: 404 });
  return NextResponse.json(pool);
}

export async function PATCH(req: NextRequest, { params }: Props) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateDataPoolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 422 });
  }

  // If renaming a slug, check it's not taken by ANOTHER pool.
  if (parsed.data.slug) {
    const conflict = await getDataPoolBySlug(parsed.data.slug);
    if (conflict && conflict.id !== id) {
      return NextResponse.json({ error: `Slug "${parsed.data.slug}" already taken` }, { status: 409 });
    }
  }

  const updated = await updateDataPool(id, parsed.data);
  if (!updated) return NextResponse.json({ error: "DataPool not found" }, { status: 404 });

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "datapool.update",
    resourceType: "data_pool",
    resourceId:   id,
    details:      parsed.data as Record<string, unknown>,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: Props) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  const { id } = await params;
  const existing = await getDataPool(id);
  if (!existing) return NextResponse.json({ error: "DataPool not found" }, { status: 404 });

  await deleteDataPool(id);

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "datapool.delete",
    resourceType: "data_pool",
    resourceId:   id,
    details:      { slug: existing.slug, name: existing.name },
  });

  return NextResponse.json({ success: true });
}
