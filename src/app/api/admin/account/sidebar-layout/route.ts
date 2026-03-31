import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, requireAdminMutation, validateAdminSession } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const customLinkSchema = z.object({
  id:    z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  href:  z.string().min(1).max(500).refine(
    v => /^(https?:\/\/|\/)/i.test(v),
    { message: "Le lien doit commencer par http://, https:// ou /" }
  ),
  icon:  z.string().max(50).optional(),
});

const categorySchema = z.object({
  id:        z.string().min(1).max(50),
  name:      z.string().min(1).max(100),
  emoji:     z.string().max(10),
  formIds:   z.array(z.string().max(36)).max(500),
  linkIds:   z.array(z.string().max(50)).max(500).optional(),
  pageIds:   z.array(z.string().max(36)).max(500).optional(),
  itemOrder: z.array(z.string().max(60)).max(1000).optional(),
});

const layoutSchema = z.object({
  favorites:   z.array(z.string().max(36)).max(500).optional(),
  formOrder:   z.array(z.string().max(36)).max(500).optional(),
  pinnedForms: z.array(z.string().max(36)).max(200).optional(),
  customLinks: z.array(customLinkSchema).max(200).optional(),
  categories:  z.array(categorySchema).max(100).optional(),
});

/** GET /api/admin/account/sidebar-layout */
export async function GET(req: NextRequest) {
  const guard = await requireAdminSession(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const [row] = await db
    .select({ sidebarLayout: users.sidebarLayout })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return NextResponse.json(row?.sidebarLayout ?? { favorites: [], formOrder: [], categories: [] });
}

/** PATCH /api/admin/account/sidebar-layout — merge partial updates */
export async function PATCH(req: NextRequest) {
  const guard = await requireAdminMutation(req);
  if (guard) return guard;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps JSON invalide" }, { status: 422 });

  const parsed = layoutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });

  // Read existing layout and merge
  const [existing] = await db
    .select({ sidebarLayout: users.sidebarLayout })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const current = existing?.sidebarLayout ?? {};
  const merged = {
    favorites:   parsed.data.favorites   ?? current.favorites   ?? [],
    formOrder:   parsed.data.formOrder   ?? current.formOrder   ?? [],
    pinnedForms: parsed.data.pinnedForms ?? current.pinnedForms ?? [],
    customLinks: parsed.data.customLinks ?? current.customLinks ?? [],
    categories:  parsed.data.categories  ?? current.categories  ?? [],
  };

  await db.update(users).set({ sidebarLayout: merged }).where(eq(users.id, user.id));

  return NextResponse.json(merged);
}
