import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { submissions, formInstances } from "@/lib/db/schema";
import { and, or, eq, ilike, gte, lte, isNull, inArray, desc, count } from "drizzle-orm";
import { requireAdminMutation, validateAdminSession } from "@/lib/auth/validateSession";
import { getAccessibleFormIds } from "@/lib/auth/permissions";
import type { SQL } from "drizzle-orm";

const MAX_EXPORT_ROWS = 10_000;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  function escapeCell(v: unknown): string {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    // Prefix formula-injection characters so spreadsheet apps don't evaluate them as formulas.
    // Cells starting with =, +, -, @ are treated as formulas by Excel/LibreOffice even when quoted.
    const safe = /^[=+\-@\t\r]/.test(s) ? "\t" + s : s;
    // Wrap in quotes and escape internal quotes by doubling them (RFC 4180)
    return `"${safe.replace(/"/g, '""')}"`;
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map(row => headers.map(h => escapeCell(row[h])).join(",")),
  ];
  return lines.join("\r\n");
}

interface ExportFilters {
  formInstanceId?: string;
  format?: string;
  status?: string;
  priority?: string;
  search?: string;
  from?: string;
  to?: string;
  assignedToMe?: boolean;
}

export async function POST(req: NextRequest) {
  // CSRF check — treat as mutation since it returns sensitive data
  const csrfGuard = await requireAdminMutation(req);
  if (csrfGuard) return csrfGuard;

  // Always resolve the session to enforce per-user scope (same pattern as GET /submissions)
  const sessionUser = await validateAdminSession(req);
  if (!sessionUser) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  const accessibleFormIds = await getAccessibleFormIds(sessionUser.id);

  const body: ExportFilters = await req.json().catch(() => ({}));
  const { formInstanceId, status: statusParam, priority: priorityParam, search, from, to, assignedToMe } = body;
  const format = body.format === "json" ? "json" : "csv";

  // Scoped user with no form grants → nothing to export
  if (accessibleFormIds !== "all" && accessibleFormIds.length === 0) {
    const timestamp = new Date().toISOString().slice(0, 10);
    const emptyBody = format === "json" ? "[]" : "\ufeff";
    return new NextResponse(emptyBody, {
      headers: {
        "Content-Type": format === "json" ? "application/json" : "text/csv;charset=utf-8;",
        "Content-Disposition": `attachment; filename="submissions_${timestamp}.${format}"`,
      },
    });
  }

  // If a specific form is requested, verify the user has access to it
  if (formInstanceId && accessibleFormIds !== "all" && !accessibleFormIds.includes(formInstanceId)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const user = assignedToMe ? sessionUser : null;

  const conditions: (SQL<unknown> | undefined)[] = [];

  // Scope filter: restrict to accessible forms for scoped users
  if (accessibleFormIds !== "all") {
    conditions.push(inArray(submissions.formInstanceId, accessibleFormIds));
  }

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
    fromDate.setHours(0, 0, 0, 0);
    conditions.push(gte(submissions.submittedAt, fromDate));
  }
  if (to && ISO_DATE_RE.test(to)) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(submissions.submittedAt, toDate));
  }
  if (assignedToMe && user?.email) {
    conditions.push(eq(submissions.assignedToEmail, user.email));
  }

  const where = and(...conditions);

  // Guard against OOM: refuse exports exceeding MAX_EXPORT_ROWS
  const [{ total }] = await db.select({ total: count() }).from(submissions).where(where);
  if (total > MAX_EXPORT_ROWS) {
    return NextResponse.json(
      { error: `Export limited to ${MAX_EXPORT_ROWS.toLocaleString()} rows. ${total.toLocaleString()} submissions match your filters — narrow them down.` },
      { status: 400 }
    );
  }

  const rows = await db
    .select()
    .from(submissions)
    .where(where)
    .orderBy(desc(submissions.submittedAt));

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `submissions_${timestamp}.${format}`;

  if (format === "json") {
    const response = NextResponse.json(rows);
    response.headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    return response;
  }

  // CSV: flatten formData with data_ prefix
  const flat = rows.map(r => ({
    id: r.id,
    email: r.email,
    status: r.status,
    priority: r.priority,
    submittedAt: r.submittedAt.toISOString(),
    dueDate: r.dueDate ?? "",
    notes: r.notes ?? "",
    assignedToEmail: r.assignedToEmail ?? "",
    ...Object.fromEntries(
      Object.entries((r.formData as Record<string, unknown>) ?? {}).map(([k, v]) => [
        `data_${k}`,
        typeof v === "object" ? JSON.stringify(v) : String(v ?? ""),
      ])
    ),
  }));

  const csv = toCSV(flat);
  return new NextResponse("\ufeff" + csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8;",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
