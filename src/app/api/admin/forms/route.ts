import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { getAccessibleFormIds } from "@/lib/auth/permissions";
import { listFormInstances, createFormInstance } from "@/lib/db/formInstanceLoader";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { isReservedSlug } from "@/lib/config/reservedSlugs";
import { getUseCustomRoot } from "@/lib/security/rootPageConfig";
import type { FormInstanceConfig } from "@/types/formInstance";

const postBodySchema = z.object({
  slug:   z.string().min(1).max(100),
  name:   z.string().min(1).max(255),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  const sessionUser = await validateAdminSession(req);
  if (!sessionUser) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  const accessibleFormIds = await getAccessibleFormIds(sessionUser.id);

  const instances = await listFormInstances();

  if (accessibleFormIds === "all") {
    return NextResponse.json(instances);
  }
  return NextResponse.json(instances.filter(f => accessibleFormIds.includes(f.id)));
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const { slug, name } = parsed.data;

  if (isReservedSlug(slug)) {
    return NextResponse.json(
      { error: `Le slug "${slug}" is reserved and cannot be used` },
      { status: 400 }
    );
  }

  if (slug === "/") {
    const useCustomRoot = await getUseCustomRoot();
    if (!useCustomRoot) {
      return NextResponse.json(
        { error: "Slug \"/\" is reserved for the default home page. Enable \"Custom home page\" in the admin settings to use it." },
        { status: 409 }
      );
    }
  }

  const config: FormInstanceConfig = (parsed.data.config as unknown as FormInstanceConfig) ?? {
    meta:     { name, title: "", description: "", locale: "en" },
    page:     { branding: { defaultTheme: "light" }, hero: { title: "", ctaLabel: "", backgroundVariant: "gradient" } },
    form:     { steps: [{ id: "step-contact", title: "", fields: [{ id: "email", type: "email", label: "", placeholder: "", required: true }] }] },
    features: { landingPage: true, form: true },
  };

  let instance;
  try {
    instance = await createFormInstance(slug, name, config);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("slug")) {
      return NextResponse.json({ error: `Le slug "${slug}" is already in use` }, { status: 409 });
    }
    throw e;
  }
  const actor = await validateAdminSession(req);
  logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "form.create", resourceType: "form", resourceId: instance.id, details: { slug, name } });
  return NextResponse.json(instance, { status: 201 });
}
