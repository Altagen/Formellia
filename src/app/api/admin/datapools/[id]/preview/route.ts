import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/validateSession";
import { getDataPoolEntries } from "@/lib/datapools/compute";

type Props = { params: Promise<{ id: string }> };

const MAX_LIMIT = 200;

export async function GET(req: NextRequest, { params }: Props) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;
  const { id } = await params;

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 50);
  const offsetRaw = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), MAX_LIMIT) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
  const search = url.searchParams.get("search") ?? undefined;

  try {
    const result = await getDataPoolEntries(id, { limit, offset, search });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
