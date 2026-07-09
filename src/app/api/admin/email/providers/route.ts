import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { createEmailProvider, listEmailProviders } from "@/lib/email/providers";

const providerKindSchema = z.enum(["resend", "sendgrid", "mailgun"]);

const createProviderSchema = z.object({
  name:            z.string().min(1, "name required").max(80),
  provider:        providerKindSchema,
  fromAddress:     z.string().email("fromAddress must be a valid email"),
  fromName:        z.string().max(80).optional(),
  apiKey:          z.string().min(1, "apiKey required"),
  apiKeyExpiresAt: z.string().nullish(),
  isDefault:       z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;
  return NextResponse.json(await listEmailProviders());
}

export async function POST(req: NextRequest) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  const parsed = createProviderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 422 });
  }

  let created;
  try {
    created = await createEmailProvider(parsed.data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Insert failed";
    // Unique constraint violation on `name` → 409
    if (/duplicate|unique/i.test(msg)) {
      return NextResponse.json({ error: `A provider named "${parsed.data.name}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "email.provider.create",
    resourceType: "email_provider",
    resourceId:   created.id,
    details:      { name: created.name, provider: created.provider, isDefault: created.isDefault },
  });

  return NextResponse.json(created, { status: 201 });
}
