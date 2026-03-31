import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { submissions, formInstances } from "@/lib/db/schema";
import { and, or, eq, ilike, gte, lte, isNull, desc, asc, count, sql, inArray } from "drizzle-orm";
import { requireAdminSession, validateAdminSession } from "@/lib/auth/validateSession";
import { getAccessibleFormIds } from "@/lib/auth/permissions";
import type { SQL } from "drizzle-orm";

const SORT_COLUMNS = {
  submittedAt: submissions.submittedAt,
  email: submissions.email,
  dateEcheance: submissions.dateEcheance,
  status: submissions.status,
  priority: submissions.priority,
} as const;

type SortKey = keyof typeof SORT_COLUMNS;

export async function GET(req: NextRequest) {
  const sessionUser = await validateAdminSession(req);
  if (!sessionUser) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const formInstanceId = searchParams.get("formInstanceId") ?? undefined;
  const page = Math.max(1, Math.min(10_000, parseInt(searchParams.get("page") ?? "1") || 1));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25") || 25));
  const sortParam = searchParams.get("sort") ?? "submittedAt";
  const sort: SortKey = (sortParam in SORT_COLUMNS ? sortParam : "submittedAt") as SortKey;
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const statusParam = searchParams.get("status") ?? undefined;
  const priorityParam = searchParams.get("priority") ?? undefined;
  const search = searchParams.get("search") ?? undefined;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const assignedToMe = searchParams.get("assignedToMe") === "true";

  const user = assignedToMe ? sessionUser : null;

  // Scope to forms accessible to this user
  const accessibleFormIds = await getAccessibleFormIds(sessionUser.id);
  const conditions: (SQL<unknown> | undefined)[] = [];

  if (accessibleFormIds !== "all" && accessibleFormIds.length > 0) {
    conditions.push(inArray(submissions.formInstanceId, accessibleFormIds));
  } else if (accessibleFormIds !== "all" && accessibleFormIds.length === 0) {
    // Scoped user with no grants — return empty result set
    return NextResponse.json({ rows: [], total: 0, page, pages: 1 });
  }

  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  if (formInstanceId) {
    const [instance] = await db
      .select({ slug: formInstances.slug })
      .from(formInstances)
      .where(eq(formInstances.id, formInstanceId))
      .limit(1);

    if (!instance) {
      return NextResponse.json({ error: "Formulaire introuvable" }, { status: 404 });
    }

    if (instance.slug === "/") {
      conditions.push(
        or(isNull(submissions.formInstanceId), eq(submissions.formInstanceId, formInstanceId))
      );
    } else {
      conditions.push(eq(submissions.formInstanceId, formInstanceId));
    }
  }

  if (statusParam) conditions.push(eq(submissions.status, statusParam));
  if (priorityParam) conditions.push(eq(submissions.priority, priorityParam));
  if (search) conditions.push(ilike(submissions.email, `%${search}%`));
  if (from && ISO_DATE_RE.test(from)) {
    const fromDate = new Date(from);
    if (!isNaN(fromDate.getTime())) {
      fromDate.setHours(0, 0, 0, 0);
      conditions.push(gte(submissions.submittedAt, fromDate));
    }
  }
  if (to && ISO_DATE_RE.test(to)) {
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime())) {
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(submissions.submittedAt, toDate));
    }
  }
  if (assignedToMe && user?.email) {
    conditions.push(eq(submissions.assignedToEmail, user.email));
  }

  // Custom form field searches (fs_<key>=<value> → formData->>'key' ILIKE '%value%')
  const SAFE_KEY_RE = /^[a-zA-Z0-9_]{1,64}$/;
  for (const [param, value] of searchParams.entries()) {
    if (!param.startsWith("fs_") || !value) continue;
    const key = param.slice(3);
    if (!SAFE_KEY_RE.test(key)) continue;
    // Strip null bytes — PostgreSQL rejects text containing \x00
    const safeValue = value.replace(/\0/g, "");
    if (!safeValue) continue;
    conditions.push(sql`${submissions.formData}->>${key} ILIKE ${"%" + safeValue + "%"}`);
  }

  const where = and(...conditions);
  const orderBy = dir === "asc" ? asc(SORT_COLUMNS[sort]) : desc(SORT_COLUMNS[sort]);

  const [countResult, rows] = await Promise.all([
    db.select({ total: count() }).from(submissions).where(where),
    db
      .select()
      .from(submissions)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset((page - 1) * limit),
  ]);

  const total = countResult[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  return NextResponse.json({ rows, total, page, pages });
}
