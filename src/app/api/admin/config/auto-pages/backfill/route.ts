import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { backfillAutoViews } from "@/lib/admin/autoFormView";

/**
 * POST /api/admin/config/auto-pages/backfill
 *
 * Generates an auto-dashboard page for every form that doesn't already have
 * one. No-op when `admin.features.autoCreateDashboardViewOnFormCreate` is off
 * — turn the toggle on first.
 *
 * Returns `{ created, skipped }` with arrays of form slugs.
 */
export async function POST(req: NextRequest) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  const actor = await validateAdminSession(req);
  try {
    const result = await backfillAutoViews(actor);
    return NextResponse.json(result, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Backfill failed" },
      { status: 500 },
    );
  }
}
