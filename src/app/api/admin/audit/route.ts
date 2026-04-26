import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { adminEvents } from "@/lib/db/schema";
import { desc, and, eq, gte, lte, count } from "drizzle-orm";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const { getFormConfig } = await import("@/lib/config");
  const config = await getFormConfig();
  if (!config.admin.features?.auditLog) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  // Cap page to prevent offset-based DoS
  const page   = Math.max(1, Math.min(10_000, parseInt(searchParams.get("page") ?? "1") || 1));
  const action = searchParams.get("action") ?? "";
  const userId = searchParams.get("userId") ?? "";
  const fromRaw = searchParams.get("from") ?? "";
  const toRaw   = searchParams.get("to") ?? "";

  // Validate date parameters — reject invalid values to prevent DB errors
  let fromDate: Date | null = null;
  let toDate: Date | null = null;
  if (fromRaw) {
    fromDate = new Date(fromRaw);
    if (isNaN(fromDate.getTime())) {
      return NextResponse.json({ error: "Invalid 'from' parameter" }, { status: 400 });
    }
  }
  if (toRaw) {
    toDate = new Date(toRaw + "T23:59:59Z");
    if (isNaN(toDate.getTime())) {
      return NextResponse.json({ error: "Invalid 'to' parameter" }, { status: 400 });
    }
  }

  const conditions = [];
  if (action) conditions.push(eq(adminEvents.action, action));
  if (userId) conditions.push(eq(adminEvents.userId!, userId));
  if (fromDate) conditions.push(gte(adminEvents.createdAt, fromDate));
  if (toDate)   conditions.push(lte(adminEvents.createdAt, toDate));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRows] = await Promise.all([
    db.select().from(adminEvents)
      .where(where)
      .orderBy(desc(adminEvents.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(adminEvents).where(where),
  ]);

  const total = countRows[0]?.total ?? 0;
  return NextResponse.json({
    events: rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}
