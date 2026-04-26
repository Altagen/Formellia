import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/validateSession";
import { requireFormAccess } from "@/lib/auth/permissions";
import { getFormInstanceById } from "@/lib/db/formInstanceLoader";
import { db } from "@/lib/db";
import { pageViews, formAnalytics, submissions } from "@/lib/db/schema";
import { and, gte, lte, eq, sql } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminSession(req);
  if (guard) return guard;

  const { id } = await params;
  const accessGuard = await requireFormAccess(req, id, "viewer");
  if (accessGuard) return accessGuard;
  const instance = await getFormInstanceById(id);
  if (!instance) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const { slug } = instance;
  const url = new URL(req.url);
  const granularity = (url.searchParams.get("granularity") ?? "day") as "hour" | "day";

  // Parse from/to; default to last 30 days
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const fromParam = url.searchParams.get("from");
  const toParam   = url.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : defaultFrom;
  const to   = toParam   ? new Date(toParam)   : now;

  const fromTs = from.toISOString();
  const toTs   = to.toISOString();

  // ── Views timeline ───────────────────────────────────────────────────────

  const truncFn = granularity === "hour"
    ? sql`date_trunc('hour', ${pageViews.createdAt})`
    : sql`date_trunc('day',  ${pageViews.createdAt})`;

  const timelineRows = await db
    .select({
      date: truncFn.as("date"),
      views: sql<number>`count(distinct ${pageViews.sessionId})`.as("views"),
    })
    .from(pageViews)
    .where(and(
      eq(pageViews.formSlug, slug),
      gte(pageViews.createdAt, new Date(fromTs)),
      lte(pageViews.createdAt, new Date(toTs)),
    ))
    .groupBy(truncFn)
    .orderBy(truncFn);

  const timeline = timelineRows.map(r => ({
    date: r.date instanceof Date
      ? r.date.toISOString().slice(0, granularity === "hour" ? 16 : 10)
      : String(r.date).slice(0, granularity === "hour" ? 16 : 10),
    views: Number(r.views),
  }));

  // ── Totals ───────────────────────────────────────────────────────────────

  const [viewsRow] = await db
    .select({ count: sql<number>`count(distinct ${pageViews.sessionId})` })
    .from(pageViews)
    .where(and(
      eq(pageViews.formSlug, slug),
      gte(pageViews.createdAt, new Date(fromTs)),
      lte(pageViews.createdAt, new Date(toTs)),
    ));

  const [startedRow] = await db
    .select({ count: sql<number>`count(distinct ${formAnalytics.sessionId})` })
    .from(formAnalytics)
    .where(and(
      eq(formAnalytics.formSlug, slug),
      eq(formAnalytics.step, 1),
      eq(formAnalytics.action, "view"),
      gte(formAnalytics.createdAt, new Date(fromTs)),
      lte(formAnalytics.createdAt, new Date(toTs)),
    ));

  const [submittedRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(submissions)
    .where(and(
      eq(submissions.formInstanceId, id),
      gte(submissions.submittedAt, new Date(fromTs)),
      lte(submissions.submittedAt, new Date(toTs)),
    ));

  // ── By source ────────────────────────────────────────────────────────────

  const sourceRows = await db
    .select({
      source: pageViews.source,
      count:  sql<number>`count(distinct ${pageViews.sessionId})`,
    })
    .from(pageViews)
    .where(and(
      eq(pageViews.formSlug, slug),
      gte(pageViews.createdAt, new Date(fromTs)),
      lte(pageViews.createdAt, new Date(toTs)),
    ))
    .groupBy(pageViews.source);

  const bySource: Record<string, number> = { direct: 0, social: 0, search: 0, referral: 0 };
  for (const row of sourceRows) {
    bySource[row.source] = Number(row.count);
  }

  return NextResponse.json({
    timeline,
    totals: {
      views:     Number(viewsRow?.count ?? 0),
      started:   Number(startedRow?.count ?? 0),
      submitted: Number(submittedRow?.count ?? 0),
    },
    bySource,
  });
}
