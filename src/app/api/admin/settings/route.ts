import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { getSettings, saveSettings } from "@/lib/db/settings";
import { logAdminEvent } from "@/lib/db/adminAudit";

const settingsSchema = z.object({
  redMaxDays: z.number().int().min(0).max(365),
  orangeMaxDays: z.number().int().min(0).max(365),
  yellowMaxDays: z.number().int().min(0).max(365),
}).refine(
  (s) => s.redMaxDays < s.orangeMaxDays && s.orangeMaxDays < s.yellowMaxDays,
  { message: "Thresholds must be increasing: red < orange < yellow" }
);

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid data";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await saveSettings(parsed.data);

  const actor = await validateAdminSession(req);
  logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "settings.update", resourceType: "settings", resourceId: "priority_thresholds", details: parsed.data });

  return NextResponse.json({ success: true });
}
