import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { listDataPools, createDataPool, getDataPoolBySlug } from "@/lib/datapools/crud";
import { createDataPoolSchema } from "@/lib/datapools/validation";

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;
  const pools = await listDataPools();
  return NextResponse.json(pools);
}

export async function POST(req: NextRequest) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  const parsed = createDataPoolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 422 });
  }

  // Slug uniqueness — return 409 with a clear message rather than letting the DB
  // bubble up a constraint violation as a 500.
  if (await getDataPoolBySlug(parsed.data.slug)) {
    return NextResponse.json({ error: `Slug "${parsed.data.slug}" already taken` }, { status: 409 });
  }

  const pool = await createDataPool(parsed.data);

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "datapool.create",
    resourceType: "data_pool",
    resourceId:   pool.id,
    details:      { slug: pool.slug, name: pool.name, keyField: pool.keyField, sources: pool.sources.length },
  });

  return NextResponse.json(pool, { status: 201 });
}
