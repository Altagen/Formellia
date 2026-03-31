import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { requireFormAccess } from "@/lib/auth/permissions";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { validateCsrfOrigin } from "@/lib/security/csrf";
import { getFormInstanceById, saveFormInstance } from "@/lib/db/formInstanceLoader";
import { encryptApiKey } from "@/lib/email/crypto";
import type { EmailNotificationConfig, SubmitterConfirmationConfig } from "@/types/formInstance";

const submitterConfirmationSchema = z.object({
  enabled:  z.boolean(),
  subject:  z.string(),
  bodyText: z.string(),
});

const patchSchema = z.object({
  enabled:        z.boolean().optional(),
  provider:       z.enum(["resend", "sendgrid", "mailgun"]).optional(),
  apiKey:         z.string().optional(),         // plaintext — encrypted server-side, never stored raw
  deleteKey:      z.boolean().optional(),        // true → wipe apiKeyEncrypted + expiry
  apiKeyExpiresAt: z.string().nullable().optional(), // ISO date or null (no expiration)
  fromAddress:    z.string().email("Adresse email invalide").optional(),
  fromName:       z.string().optional(),
  subject:        z.string().optional(),
  bodyText:       z.string().optional(),
  submitterConfirmation: submitterConfirmationSchema.optional(),
});

/** Sanitized view returned to the client — apiKeyEncrypted is never included. */
function sanitize(email: EmailNotificationConfig | undefined, sc: SubmitterConfirmationConfig | undefined) {
  return {
    enabled:         email?.enabled         ?? false,
    provider:        email?.provider        ?? "resend",
    apiKeySet:       !!(email?.apiKeyEncrypted),
    apiKeyExpiresAt: email?.apiKeyExpiresAt ?? null,
    fromAddress:     email?.fromAddress     ?? "",
    fromName:        email?.fromName        ?? "",
    subject:         email?.subject         ?? "",
    bodyText:        email?.bodyText        ?? "",
    submitterConfirmation: {
      enabled:  sc?.enabled  ?? false,
      subject:  sc?.subject  ?? "",
      bodyText: sc?.bodyText ?? "",
    },
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // CSRF check on GET: prevents cross-origin scripts from probing whether an API key is set
  if (!validateCsrfOrigin(req)) {
    return NextResponse.json({ error: "Cross-origin request denied" }, { status: 403 });
  }
  const { id } = await params;
  const guard = await requireFormAccess(req, id, "editor");
  if (guard) return guard;
  const instance = await getFormInstanceById(id);
  if (!instance) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  return NextResponse.json(sanitize(instance.config.notifications?.email, instance.config.notifications?.submitterConfirmation));
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
  if (!body) return NextResponse.json({ error: "JSON invalide" }, { status: 400 });

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const { apiKey, deleteKey, apiKeyExpiresAt, submitterConfirmation, ...rest } = parsed.data;
  const existing = instance.config.notifications?.email;

  const updated: EmailNotificationConfig = {
    enabled:         rest.enabled     ?? existing?.enabled     ?? false,
    provider:        rest.provider    ?? existing?.provider    ?? "resend",
    apiKeyEncrypted: existing?.apiKeyEncrypted ?? "",
    apiKeyExpiresAt: existing?.apiKeyExpiresAt ?? null,
    fromAddress:     rest.fromAddress ?? existing?.fromAddress ?? "",
    fromName:        rest.fromName    ?? existing?.fromName,
    subject:         rest.subject     ?? existing?.subject     ?? "",
    bodyText:        rest.bodyText    ?? existing?.bodyText    ?? "",
  };

  // Delete key — wipes encrypted key and expiry
  if (deleteKey) {
    updated.apiKeyEncrypted = "";
    updated.apiKeyExpiresAt = null;
  }

  // Set/replace expiry (independent of key change)
  if (apiKeyExpiresAt !== undefined) {
    updated.apiKeyExpiresAt = apiKeyExpiresAt;
  }

  // Encrypt and store new key if provided (and not deleting at the same time)
  if (!deleteKey && apiKey && apiKey.trim()) {
    try {
      updated.apiKeyEncrypted = encryptApiKey(apiKey.trim());
    } catch (err) {
      import("@/lib/logger").then(({ logger }) => logger.error({ err }, "Failed to encrypt API key"));
      return NextResponse.json(
        { error: "Cannot encrypt API key. Check the ENCRYPTION_KEY variable." },
        { status: 500 }
      );
    }
  }

  const updatedSc: SubmitterConfirmationConfig | undefined = submitterConfirmation
    ?? instance.config.notifications?.submitterConfirmation;

  const newConfig = {
    ...instance.config,
    notifications: {
      ...instance.config.notifications,
      email: updated,
      ...(updatedSc !== undefined ? { submitterConfirmation: updatedSc } : {}),
    },
  };

  await saveFormInstance(id, { config: newConfig }, instance.slug);

  const actor = await validateAdminSession(req);
  logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "form.notifications_update", resourceType: "form", resourceId: id, details: { slug: instance.slug, provider: updated.provider, enabled: updated.enabled } });

  return NextResponse.json(sanitize(updated, updatedSc));
}
