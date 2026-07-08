import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { adminEvents } from "@/lib/db/schema";
import { and, gte, lte, eq, desc, type SQL } from "drizzle-orm";
import { toCsv } from "@/lib/csv/rfc4180";

/**
 * GET /api/admin/audit/export?format=csv|json|yaml&from=YYYY-MM-DD&to=YYYY-MM-DD&action=&userId=
 *
 * Returns the full audit log as a downloadable file. Filters are optional and
 * ANDed together. Admin-only — the log contains identities and IPs of every
 * operator action. `from` and `to` are inclusive.
 */
export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const url    = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const from   = url.searchParams.get("from");
  const to     = url.searchParams.get("to");
  const action = url.searchParams.get("action");
  const userId = url.searchParams.get("userId");

  const clauses: SQL[] = [];
  if (from)   { const d = new Date(from); if (!isNaN(+d)) clauses.push(gte(adminEvents.createdAt, d)); }
  if (to)     { const d = new Date(to);   if (!isNaN(+d)) { d.setHours(23, 59, 59, 999); clauses.push(lte(adminEvents.createdAt, d)); } }
  if (action) { clauses.push(eq(adminEvents.action, action)); }
  if (userId) { clauses.push(eq(adminEvents.userId, userId)); }

  const rows = clauses.length > 0
    ? await db.select().from(adminEvents).where(and(...clauses)).orderBy(desc(adminEvents.createdAt))
    : await db.select().from(adminEvents).orderBy(desc(adminEvents.createdAt));

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    const body = JSON.stringify(rows, null, 2);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-${stamp}.json"`,
      },
    });
  }

  if (format === "yaml" || format === "yml") {
    const yaml = await import("js-yaml");
    const body = yaml.dump(rows, { lineWidth: 120, noRefs: true, indent: 2 });
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/x-yaml; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-${stamp}.yaml"`,
      },
    });
  }

  // Default CSV
  const cols = ["id", "createdAt", "userId", "userEmail", "action", "resourceType", "resourceId", "details"] as const;
  const body = toCsv(rows as unknown as Record<string, unknown>[], cols as unknown as string[]);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${stamp}.csv"`,
    },
  });
}
