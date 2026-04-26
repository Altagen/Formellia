import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/validateSession";
import { requireFormAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { formVersionHistory } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminSession(req);
  if (guard) return guard;

  const { id } = await params;
  const accessGuard = await requireFormAccess(req, id, "viewer");
  if (accessGuard) return accessGuard;

  const versions = await db
    .select()
    .from(formVersionHistory)
    .where(eq(formVersionHistory.formInstanceId, id))
    .orderBy(desc(formVersionHistory.createdAt))
    .limit(50);

  return NextResponse.json(versions);
}
