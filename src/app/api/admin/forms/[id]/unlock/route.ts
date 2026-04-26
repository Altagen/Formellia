import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { getFormInstanceById, saveFormInstance } from "@/lib/db/formInstanceLoader";
import { logAdminEvent } from "@/lib/db/adminAudit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  const current = await getFormInstanceById(id);
  if (!current) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const newConfig = { ...current.config };
  delete newConfig._managedBy;

  const actor = await validateAdminSession(req);
  await saveFormInstance(id, { config: newConfig }, current.slug, actor?.id ?? null, actor?.email ?? null);
  const updated = await getFormInstanceById(id);

  logAdminEvent({
    userId:       actor?.id   ?? null,
    userEmail:    actor?.email ?? null,
    action:       "form.unlock",
    resourceType: "form",
    resourceId:   id,
    details:      { slug: current.slug },
  });

  return NextResponse.json(updated);
}
