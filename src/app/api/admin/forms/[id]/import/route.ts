import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { getFormInstanceById, saveFormInstance } from "@/lib/db/formInstanceLoader";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { parseBody } from "@/lib/serialization/parseBody";
import { z } from "zod";
import { yamlFormConfigSchema } from "@/lib/yaml/configSchema";

const sectionSchema = z.enum(["full", "page", "form", "onSubmitActions"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  const current = await getFormInstanceById(id);
  if (!current) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const sectionParam = req.nextUrl.searchParams.get("section") ?? "full";
  const sectionParsed = sectionSchema.safeParse(sectionParam);
  if (!sectionParsed.success) {
    return NextResponse.json({ error: "section invalide (full|page|form|onSubmitActions)" }, { status: 400 });
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

  const existingConfig = { ...current.config };

  if (section === "full") {
    const validation = yamlFormConfigSchema.safeParse(rawParsed);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues.map(i => i.message).join("; ") }, { status: 422 });
    }
    const v = validation.data;
    if (v.meta)                existingConfig.meta                = v.meta as unknown as typeof existingConfig.meta;
    if (v.page)                existingConfig.page                = v.page as unknown as typeof existingConfig.page;
    if (v.form)                existingConfig.form                = v.form as unknown as typeof existingConfig.form;
    if (v.security)            existingConfig.security            = v.security as unknown as typeof existingConfig.security;
    if (v.features)            existingConfig.features            = v.features;
    if (v.onSubmitActions)     existingConfig.onSubmitActions     = v.onSubmitActions as unknown as typeof existingConfig.onSubmitActions;
    if (v.customStatuses)      existingConfig.customStatuses      = v.customStatuses as unknown as typeof existingConfig.customStatuses;
    if (v.successMessage       !== undefined) existingConfig.successMessage       = v.successMessage;
    if (v.successRedirectUrl   !== undefined) existingConfig.successRedirectUrl   = v.successRedirectUrl;
    if (v.successRedirectDelay !== undefined) existingConfig.successRedirectDelay = v.successRedirectDelay;
    if (v.priorityThresholds)  existingConfig.priorityThresholds  = v.priorityThresholds;
  } else if (section === "page") {
    existingConfig.page = rawParsed as typeof existingConfig.page;
  } else if (section === "form") {
    existingConfig.form = rawParsed as typeof existingConfig.form;
  } else if (section === "onSubmitActions") {
    if (!Array.isArray(rawParsed)) {
      return NextResponse.json({ error: "onSubmitActions must be an array" }, { status: 422 });
    }
    existingConfig.onSubmitActions = rawParsed as typeof existingConfig.onSubmitActions;
  }

  existingConfig._managedBy = "ui-import";

  const actor = await validateAdminSession(req);
  await saveFormInstance(id, { config: existingConfig }, current.slug, actor?.id ?? null, actor?.email ?? null);
  const updated = await getFormInstanceById(id);

  logAdminEvent({
    userId:       actor?.id   ?? null,
    userEmail:    actor?.email ?? null,
    action:       "form.import",
    resourceType: "form",
    resourceId:   id,
    details:      { slug: current.slug, section },
  });

  return NextResponse.json(updated);
}
