import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { getFormInstanceById, createFormInstance, listFormInstances } from "@/lib/db/formInstanceLoader";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { isReservedSlug } from "@/lib/config/reservedSlugs";
import { getUseCustomRoot } from "@/lib/security/rootPageConfig";

const bodySchema = z.object({
  slug: z.string().min(1).max(100),
  name: z.string().min(1).max(255).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  const source = await getFormInstanceById(id);
  if (!source) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "JSON invalide" }, { status: 400 });

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const { slug, name } = parsed.data;
  const newName = name ?? `${source.name} (copie)`;

  if (isReservedSlug(slug)) {
    return NextResponse.json({ error: `Le slug "${slug}" is reserved` }, { status: 400 });
  }

  if (slug === "/") {
    const useCustomRoot = await getUseCustomRoot();
    if (!useCustomRoot) {
      return NextResponse.json({ error: "Le slug \"/\" requires enabling \"Custom home page\"" }, { status: 409 });
    }
  }

  const all = await listFormInstances();
  if (all.some(f => f.slug === slug)) {
    return NextResponse.json({ error: `Le slug "${slug}" is already in use` }, { status: 409 });
  }

  let instance;
  try {
    instance = await createFormInstance(slug, newName, source.config);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json({ error: `Le slug "${slug}" is already in use` }, { status: 409 });
    }
    throw e;
  }

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId: actor?.id ?? null, userEmail: actor?.email ?? null,
    action: "form.duplicate", resourceType: "form", resourceId: instance.id,
    details: { sourceId: id, sourceSlug: source.slug, newSlug: slug, name: newName },
  });

  return NextResponse.json(instance, { status: 201 });
}
