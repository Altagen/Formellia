import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { savedFilters } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAdminMutation, validateAdminSession } from "@/lib/auth/validateSession";

export async function GET(req: NextRequest) {
  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const formSlug = searchParams.get("formSlug");

  const rows = await db.select().from(savedFilters)
    .where(
      formSlug
        ? and(eq(savedFilters.userId, user.id), eq(savedFilters.formSlug!, formSlug))
        : eq(savedFilters.userId, user.id)
    )
    .orderBy(savedFilters.createdAt);

  return NextResponse.json(rows);
}

const createSchema = z.object({
  name:     z.string().min(1).max(100),
  formSlug: z.string().max(100).optional(),
  filters:  z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  const [row] = await db.insert(savedFilters).values({
    userId:    user.id,
    userEmail: user.email,
    name:      parsed.data.name,
    formSlug:  parsed.data.formSlug ?? null,
    filters:   parsed.data.filters,
  }).returning();

  return NextResponse.json(row, { status: 201 });
}
