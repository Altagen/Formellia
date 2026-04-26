import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { getFormConfig, saveFormConfig, resetFormConfig, isConfigEditable } from "@/lib/config";
import { logAdminEvent } from "@/lib/db/adminAudit";
import type { FormConfig } from "@/types/config";

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const config = await getFormConfig();
  return NextResponse.json({ config, editable: isConfigEditable() });
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  if (!isConfigEditable()) {
    return NextResponse.json(
      { error: "Immutable config — server is running in file mode (CONFIG_SOURCE=file). Redeploy with CONFIG_SOURCE=db to enable editing." },
      { status: 403 }
    );
  }

  let body: FormConfig;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  // Structural validation
  if (!body || typeof body !== "object" || !body.admin) {
    return NextResponse.json(
      { error: "Invalid config structure — admin key is required" },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.admin.pages)) {
    return NextResponse.json({ error: "admin.pages must be an array" }, { status: 400 });
  }

  // Validate pages: unique IDs, required fields, known widget types
  const KNOWN_WIDGET_TYPES = new Set([
    "stats_card", "stats_table", "chart", "recent", "info_card", "submissions_table",
    "traffic_chart", "email_quality", "urgency_distribution", "funnel_chart", "deadline_distribution", "filter_pills",
  ]);
  const pageIds = new Set<string>();
  for (const page of body.admin.pages) {
    if (!page.id || typeof page.id !== "string") {
      return NextResponse.json({ error: "Chaque page doit avoir un identifiant (id)" }, { status: 400 });
    }
    if (pageIds.has(page.id)) {
      return NextResponse.json({ error: `ID de page en double : "${page.id}"` }, { status: 400 });
    }
    pageIds.add(page.id);
    if (!page.slug || typeof page.slug !== "string") {
      return NextResponse.json({ error: `Page "${page.id}" : slug manquant` }, { status: 400 });
    }
    if (!Array.isArray(page.widgets)) {
      return NextResponse.json({ error: `Page "${page.id}" : widgets must be an array` }, { status: 400 });
    }
    for (const widget of page.widgets) {
      if (!widget.type || !KNOWN_WIDGET_TYPES.has(widget.type)) {
        return NextResponse.json(
          { error: `Page "${page.id}" : type de widget inconnu "${widget.type}"` },
          { status: 400 }
        );
      }
    }
  }

  await saveFormConfig(body);

  const actor = await validateAdminSession(req);
  logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "config.update", resourceType: "config", resourceId: "global" });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  if (!isConfigEditable()) {
    return NextResponse.json(
      { error: "Immutable config — cannot reset in file mode" },
      { status: 403 }
    );
  }

  await resetFormConfig();

  const actor = await validateAdminSession(req);
  logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "config.reset", resourceType: "config", resourceId: "global" });

  return NextResponse.json({ success: true });
}
