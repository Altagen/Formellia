import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  requireAdminMutation,
  requireRole,
  validateAdminSession,
} from "@/lib/auth/validateSession";
import { getFormConfig, saveFormConfig, isConfigEditable } from "@/lib/config";
import { getFormInstanceById, listFormInstances, saveFormInstance } from "@/lib/db/formInstanceLoader";
import { logAdminEvent } from "@/lib/db/adminAudit";
import type { AdminFolder } from "@/types/config";

const folderSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["forms", "views"]),
  parentId: z.string().optional(),
  emoji: z.string().max(4).optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  parentId: z.string().nullable().optional(),
  emoji: z.string().max(4).nullable().optional(),
});

const moveSchema = z.object({
  itemType: z.enum(["form", "view"]),
  itemId: z.string(),
  folderId: z.string().nullable(),
});

/** GET /api/admin/folders → { folders: AdminFolder[] } */
export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;
  const config = await getFormConfig();
  return NextResponse.json({ folders: config.admin.folders ?? [] });
}

/** POST /api/admin/folders — create a new folder. */
export async function POST(req: NextRequest) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;
  if (!isConfigEditable()) {
    return NextResponse.json({ error: "Config is read-only." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = folderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  const config = await getFormConfig();
  const folders = [...(config.admin.folders ?? [])];
  const folder: AdminFolder = {
    id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: parsed.data.name,
    kind: parsed.data.kind,
    parentId: parsed.data.parentId,
    emoji: parsed.data.emoji,
  };
  folders.push(folder);
  await saveFormConfig({ ...config, admin: { ...config.admin, folders } });

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId: actor?.id ?? null,
    userEmail: actor?.email ?? null,
    action: "folder.create",
    resourceType: "folder",
    resourceId: folder.id,
    details: { kind: folder.kind, name: folder.name },
  });

  revalidatePath("/admin", "layout");
  return NextResponse.json({ folder });
}

/** PATCH /api/admin/folders?id=<id> — rename / re-parent / re-emoji.
 *  PATCH /api/admin/folders (with body `moveSchema`) — move an item into a folder. */
export async function PATCH(req: NextRequest) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;
  if (!isConfigEditable()) {
    return NextResponse.json({ error: "Config is read-only." }, { status: 403 });
  }

  const url = new URL(req.url);
  const folderId = url.searchParams.get("id");
  const body = await req.json().catch(() => null);
  const config = await getFormConfig();

  // Move-item variant
  if (!folderId) {
    const parsed = moveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid move payload" }, { status: 400 });
    }
    const targetId = parsed.data.folderId;
    if (targetId && !(config.admin.folders ?? []).some((f) => f.id === targetId)) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    if (parsed.data.itemType === "view") {
      const pages = config.admin.pages.map((p) =>
        p.id === parsed.data.itemId ? { ...p, folderId: targetId ?? undefined } : p,
      );
      await saveFormConfig({ ...config, admin: { ...config.admin, pages } });
    } else {
      const instance = await getFormInstanceById(parsed.data.itemId);
      if (!instance) return NextResponse.json({ error: "Form not found" }, { status: 404 });
      await saveFormInstance(instance.id, {
        config: {
          ...instance.config,
          meta: { ...instance.config.meta, folderId: targetId ?? undefined },
        },
      });
    }
    revalidatePath("/admin", "layout");
    return NextResponse.json({ ok: true });
  }

  // Rename / patch variant
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid patch" }, { status: 400 });
  }
  const folders = (config.admin.folders ?? []).map((f) => {
    if (f.id !== folderId) return f;
    return {
      ...f,
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.parentId !== undefined ? { parentId: parsed.data.parentId ?? undefined } : {}),
      ...(parsed.data.emoji !== undefined ? { emoji: parsed.data.emoji ?? undefined } : {}),
    };
  });
  await saveFormConfig({ ...config, admin: { ...config.admin, folders } });
  revalidatePath("/admin", "layout");
  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/folders?id=<id> — remove folder; items inside get their folderId cleared. */
export async function DELETE(req: NextRequest) {
  const guard = (await requireAdminMutation(req)) ?? (await requireRole("admin", req));
  if (guard) return guard;
  if (!isConfigEditable()) {
    return NextResponse.json({ error: "Config is read-only." }, { status: 403 });
  }

  const url = new URL(req.url);
  const folderId = url.searchParams.get("id");
  if (!folderId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const config = await getFormConfig();
  const folder = (config.admin.folders ?? []).find((f) => f.id === folderId);
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Detach child folders (promote to root) and detach any views that referenced this folder.
  const folders = (config.admin.folders ?? [])
    .filter((f) => f.id !== folderId)
    .map((f) => (f.parentId === folderId ? { ...f, parentId: undefined } : f));
  const pages = config.admin.pages.map((p) =>
    p.folderId === folderId ? { ...p, folderId: undefined } : p,
  );
  await saveFormConfig({ ...config, admin: { ...config.admin, folders, pages } });

  // For form-kind folders, also detach any form instance still pointing to this
  // folder — otherwise those forms silently disappear from the root list.
  if (folder.kind === "forms") {
    const instances = await listFormInstances();
    for (const inst of instances) {
      if (inst.config.meta?.folderId === folderId) {
        await saveFormInstance(inst.id, {
          config: {
            ...inst.config,
            meta: { ...inst.config.meta, folderId: undefined },
          },
        });
      }
    }
  }

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId: actor?.id ?? null,
    userEmail: actor?.email ?? null,
    action: "folder.delete",
    resourceType: "folder",
    resourceId: folderId,
    details: { kind: folder.kind, name: folder.name },
  });

  revalidatePath("/admin", "layout");
  return NextResponse.json({ ok: true });
}
