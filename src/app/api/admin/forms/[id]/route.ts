import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession, requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { requireFormAccess } from "@/lib/auth/permissions";
import {
  getFormInstanceById,
  saveFormInstance,
  deleteFormInstance,
  listFormInstances,
} from "@/lib/db/formInstanceLoader";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { isReservedSlug } from "@/lib/config/reservedSlugs";
import { getUseCustomRoot } from "@/lib/security/rootPageConfig";
import { getProtectedSlugs } from "@/lib/security/protectedSlugs";
import type { FormInstanceConfig } from "@/types/formInstance";

const putBodySchema = z.object({
  name:   z.string().min(1).max(255),
  config: z.record(z.string(), z.unknown()),
  slug:   z.string().min(1).max(100).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Viewer+ required, scoped users may only fetch their accessible forms
  const guard = await requireFormAccess(req, id, "viewer");
  if (guard) return guard;

  const instance = await getFormInstanceById(id);
  if (!instance) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(instance);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const mutGuard = await requireAdminMutation(req);
  if (mutGuard) return mutGuard;

  const { id } = await params;

  // Editor+ access required — agents cannot modify form structure
  const accessGuard = await requireFormAccess(req, id, "editor");
  if (accessGuard) return accessGuard;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const current = await getFormInstanceById(id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newSlug = parsed.data.slug;
  if (newSlug !== undefined && newSlug !== current.slug) {
    // Guard: cannot rename away from a protected slug
    const protected_ = await getProtectedSlugs();
    if (protected_.includes(current.slug)) {
      return NextResponse.json(
        { error: `Le slug "${current.slug}" is protected. Remove the protection in settings before renaming it.` },
        { status: 423 }
      );
    }

    if (isReservedSlug(newSlug)) {
      return NextResponse.json({ error: `Le slug "${newSlug}" is reserved` }, { status: 400 });
    }
    if (newSlug === "/") {
      const useCustomRoot = await getUseCustomRoot();
      if (!useCustomRoot) {
        return NextResponse.json({ error: "Le slug \"/\" requires enabling \"Custom home page\"" }, { status: 409 });
      }
    }
    const all = await listFormInstances();
    if (all.some(f => f.slug === newSlug && f.id !== id)) {
      return NextResponse.json({ error: `Le slug "${newSlug}" is already in use` }, { status: 409 });
    }
  }

  const actor = await validateAdminSession(req);
  await saveFormInstance(
    id,
    { name: parsed.data.name, config: parsed.data.config as unknown as FormInstanceConfig },
    current.slug,
    actor?.id ?? null,
    actor?.email ?? null,
    newSlug !== current.slug ? newSlug : undefined,
  );
  const updated = await getFormInstanceById(id);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const details: Record<string, unknown> = { oldSlug: current.slug, name: parsed.data.name };
  if (newSlug && newSlug !== current.slug) details.newSlug = newSlug;
  logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "form.update", resourceType: "form", resourceId: id, details });
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  const instance = await getFormInstanceById(id);
  if (!instance) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const protected_ = await getProtectedSlugs();
  if (protected_.includes(instance.slug)) {
    return NextResponse.json(
      { error: `Le slug "${instance.slug}" is protected. Remove the protection in settings before deleting it.` },
      { status: 423 }
    );
  }

  await deleteFormInstance(id);
  const actor = await validateAdminSession(req);
  logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "form.delete", resourceType: "form", resourceId: id, details: { slug: instance.slug, name: instance.name } });
  return NextResponse.json({ success: true });
}
