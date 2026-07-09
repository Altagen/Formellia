import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { getFormConfig, saveFormConfig, isConfigEditable } from "@/lib/config";
import { parseBody } from "@/lib/serialization/parseBody";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { mergeAdminPages } from "@/lib/admin/mergeAdminConfig";
import type { AdminPage } from "@/types/config";

const yamlViewSchema = z.object({
  id:                   z.string().min(1, "id required"),
  title:                z.string().min(1, "title required"),
  slug:                 z.string().min(1, "slug required"),
  icon:                 z.string().optional(),
  widgets:              z.array(z.record(z.string(), z.unknown())).default([]),
  dataSourceId:         z.string().optional(),
  formInstanceId:       z.string().optional(),
  refreshInterval:      z.number().int().min(0).optional(),
  interactiveFilter:    z.boolean().optional(),
  showCompletionFunnel: z.boolean().optional(),
  flattenRepeater:      z.object({ fieldId: z.string() }).optional(),
  folderId:             z.string().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  if (!isConfigEditable()) {
    return NextResponse.json({ error: "Configuration en lecture seule (mode fichier)" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await parseBody(req);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Parsing failed" }, { status: 422 });
  }

  const arrayInput = Array.isArray(raw);
  const schema = arrayInput ? z.array(yamlViewSchema).min(1, "At least one view is required") : yamlViewSchema;
  const validation = schema.safeParse(raw);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") },
      { status: 422 },
    );
  }

  const incoming = (arrayInput ? validation.data : [validation.data]) as AdminPage[];

  const current = await getFormConfig();
  const merged = mergeAdminPages(current.admin.pages ?? [], incoming, "append");
  const created = incoming.filter(v => !(current.admin.pages ?? []).some(p => p.id === v.id)).map(v => v.id);
  const updated = incoming.filter(v =>  (current.admin.pages ?? []).some(p => p.id === v.id)).map(v => v.id);

  await saveFormConfig({ ...current, admin: { ...current.admin, pages: merged } });
  revalidatePath("/admin", "layout");

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id    ?? null,
    userEmail:    actor?.email ?? null,
    action:       "view.import",
    resourceType: "view",
    resourceId:   incoming.map(v => v.id).join(","),
    details:      { created, updated, count: incoming.length },
  });

  return NextResponse.json({ created, updated, count: incoming.length });
}
