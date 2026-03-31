import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { externalRecords } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth/validateSession";

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Props) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  const records = await db
    .select()
    .from(externalRecords)
    .where(eq(externalRecords.datasetId, id))
    .orderBy(desc(externalRecords.importedAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ records, page, limit });
}
