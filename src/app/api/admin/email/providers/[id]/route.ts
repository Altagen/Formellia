import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { deleteEmailProvider, getEmailProvider, updateEmailProvider } from "@/lib/email/providers";

const providerKindSchema = z.enum(["resend", "sendgrid", "mailgun"]);

const updateProviderSchema = z.object({
  name:            z.string().min(1).max(80).optional(),
  provider:        providerKindSchema.optional(),
  fromAddress:     z.string().email().optional(),
  fromName:        z.string().max(80).nullish(),
  /** Undefined → don't rotate. Empty string → clear. Non-empty → re-encrypt. */
  apiKey:          z.string().optional(),
  apiKeyExpiresAt: z.string().nullish(),
  isDefault:       z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;
  const { id } = await params;
  const provider = await getEmailProvider(id);
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(provider);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateProviderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 422 });
  }

  let updated;
  try {
    updated = await updateEmailProvider(id, parsed.data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Update failed";
    if (/duplicate|unique/i.test(msg)) {
      return NextResponse.json({ error: `A provider named "${parsed.data.name}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "email.provider.update",
    resourceType: "email_provider",
    resourceId:   id,
    details: {
      fieldsChanged: Object.keys(parsed.data).filter(k => k !== "apiKey"),
      apiKeyChanged: parsed.data.apiKey !== undefined,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  const { id } = await params;
  const existing = await getEmailProvider(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteEmailProvider(id);

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "email.provider.delete",
    resourceType: "email_provider",
    resourceId:   id,
    details:      { name: existing.name, provider: existing.provider },
  });

  return NextResponse.json({ ok: true });
}
