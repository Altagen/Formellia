/**
 * Per-form notification config — post UI-11 model.
 *
 * A form's notification blob is now just {enabled, providerId?, subject,
 * bodyText}. All credentials live in the `email_providers` table; the form
 * only references a preset via UUID. The submitter-confirmation second-email
 * path has been removed.
 *
 * GET returns the sanitized shape (no secrets — nothing to hide since the
 * form doesn't hold any). PATCH accepts partial updates.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { requireFormAccess } from "@/lib/auth/permissions";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { validateCsrfOrigin } from "@/lib/security/csrf";
import { getFormInstanceById, saveFormInstance } from "@/lib/db/formInstanceLoader";
import type { EmailNotificationConfig } from "@/types/formInstance";

const patchSchema = z.object({
  enabled:    z.boolean().optional(),
  /** UUID of the preset in `email_providers`, or null to clear the reference (falls back to default). */
  providerId: z.string().uuid().nullable().optional(),
  subject:    z.string().optional(),
  bodyText:   z.string().optional(),
});

/** Sanitized view returned to the client. No secrets to hide any more. */
function sanitize(email: EmailNotificationConfig | undefined) {
  return {
    enabled:    email?.enabled    ?? false,
    providerId: email?.providerId ?? null,
    subject:    email?.subject    ?? "",
    bodyText:   email?.bodyText   ?? "",
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateCsrfOrigin(req)) {
    return NextResponse.json({ error: "Cross-origin request denied" }, { status: 403 });
  }
  const { id } = await params;
  const guard = await requireFormAccess(req, id, "editor");
  if (guard) return guard;
  const instance = await getFormInstanceById(id);
  if (!instance) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  return NextResponse.json(sanitize(instance.config.notifications?.email));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  const instance = await getFormInstanceById(id);
  if (!instance) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const patch = parsed.data;
  const existing = instance.config.notifications?.email;

  const updated: EmailNotificationConfig = {
    enabled:    patch.enabled    ?? existing?.enabled    ?? false,
    providerId: patch.providerId === null ? undefined : (patch.providerId ?? existing?.providerId),
    subject:    patch.subject    ?? existing?.subject    ?? "",
    bodyText:   patch.bodyText   ?? existing?.bodyText   ?? "",
  };

  const newConfig = {
    ...instance.config,
    notifications: {
      ...instance.config.notifications,
      email: updated,
    },
  };

  await saveFormInstance(id, { config: newConfig }, instance.slug);
  revalidatePath("/admin", "layout");

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "form.notifications_update",
    resourceType: "form",
    resourceId:   id,
    details:      { slug: instance.slug, providerId: updated.providerId ?? null, enabled: updated.enabled },
  });

  return NextResponse.json(sanitize(updated));
}
