import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { getFormConfig, saveFormConfig, isConfigEditable } from "@/lib/config";
import { parseBody } from "@/lib/serialization/parseBody";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { z } from "zod";
import type { FormConfig } from "@/types/config";

const KNOWN_WIDGET_TYPES = new Set([
  "stats_card", "stats_table", "chart", "recent", "info_card", "submissions_table",
  "traffic_chart", "email_quality", "urgency_distribution", "funnel_chart",
  "deadline_distribution", "filter_pills",
]);

const sectionSchema = z.enum(["full", "pages", "columns", "branding", "features"]);

/**
 * POST /api/admin/config/admin-import
 *
 * Imports a section of the global admin config.
 * Body: the config payload (YAML or JSON) + ?section= query param
 * Section: full | pages | columns | branding | features
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  if (!isConfigEditable()) {
    return NextResponse.json(
      { error: "Config immuable — le serveur tourne en mode fichier (CONFIG_SOURCE=file)" },
      { status: 403 }
    );
  }

  const sectionParam = req.nextUrl.searchParams.get("section") ?? "full";
  const sectionParsed = sectionSchema.safeParse(sectionParam);
  if (!sectionParsed.success) {
    return NextResponse.json({ error: `Section invalide : "${sectionParam}"` }, { status: 400 });
  }
  const section = sectionParsed.data;

  let rawParsed: unknown;
  try {
    rawParsed = await parseBody(req);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Parsing failed" }, { status: 422 });
  }

  if (typeof rawParsed !== "object" || rawParsed === null) {
    return NextResponse.json({ error: "Body must be an object" }, { status: 422 });
  }

  const current = await getFormConfig();
  const updated: FormConfig = JSON.parse(JSON.stringify(current));

  const incoming = rawParsed as Record<string, unknown>;

  if (section === "full") {
    // Validate mandatory structure
    if (!incoming.admin || typeof incoming.admin !== "object") {
      return NextResponse.json({ error: "Admin key missing" }, { status: 422 });
    }
    const inAdmin = incoming.admin as Record<string, unknown>;
    if (inAdmin.pages !== undefined) {
      const pagesErr = validatePages(inAdmin.pages);
      if (pagesErr) return NextResponse.json({ error: pagesErr }, { status: 422 });
      updated.admin.pages = inAdmin.pages as typeof updated.admin.pages;
    }
    if (inAdmin.tableColumns !== undefined) updated.admin.tableColumns = inAdmin.tableColumns as typeof updated.admin.tableColumns;
    if (inAdmin.branding     !== undefined) updated.admin.branding     = inAdmin.branding     as typeof updated.admin.branding;
    if (inAdmin.features     !== undefined) updated.admin.features     = inAdmin.features     as typeof updated.admin.features;
    if ((incoming as Record<string, unknown>).priorityThresholds !== undefined) {
      (updated as unknown as Record<string, unknown>).priorityThresholds = (incoming as Record<string, unknown>).priorityThresholds;
    }
  } else if (section === "pages") {
    if (!Array.isArray(rawParsed)) return NextResponse.json({ error: "pages must be an array" }, { status: 422 });
    const pagesErr = validatePages(rawParsed);
    if (pagesErr) return NextResponse.json({ error: pagesErr }, { status: 422 });
    updated.admin.pages = rawParsed as typeof updated.admin.pages;
  } else if (section === "columns") {
    if (!Array.isArray(rawParsed)) return NextResponse.json({ error: "columns must be an array" }, { status: 422 });
    updated.admin.tableColumns = rawParsed as typeof updated.admin.tableColumns;
  } else if (section === "branding") {
    updated.admin.branding = rawParsed as typeof updated.admin.branding;
  } else if (section === "features") {
    updated.admin.features = rawParsed as typeof updated.admin.features;
  }

  await saveFormConfig(updated);

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id   ?? null,
    userEmail:    actor?.email ?? null,
    action:       "config.import",
    resourceType: "admin_config",
    resourceId:   "1",
    details:      { section },
  });

  return NextResponse.json({ success: true, section });
}

function validatePages(pages: unknown): string | null {
  if (!Array.isArray(pages)) return "pages must be an array";
  const ids = new Set<string>();
  for (const page of pages) {
    if (!page?.id || typeof page.id !== "string") return "Chaque page doit avoir un id";
    if (ids.has(page.id)) return `ID de page en double : "${page.id}"`;
    ids.add(page.id);
    if (!page.slug) return `Page "${page.id}" : slug manquant`;
    if (!Array.isArray(page.widgets)) return `Page "${page.id}" : widgets must be an array`;
    for (const w of page.widgets) {
      if (!w?.type || !KNOWN_WIDGET_TYPES.has(w.type)) {
        return `Page "${page.id}" : type de widget inconnu "${w?.type}"`;
      }
    }
  }
  return null;
}
