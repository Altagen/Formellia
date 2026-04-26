import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { backupProviders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildProvider } from "@/lib/backup/providers/index";

/**
 * GET /api/admin/backup/list?providerId=xxx
 * Lists backup files available on the given provider.
 */
export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const providerId = req.nextUrl.searchParams.get("providerId");
  if (!providerId) return NextResponse.json({ error: "providerId est requis" }, { status: 400 });

  const [providerRow] = await db.select().from(backupProviders).where(eq(backupProviders.id, providerId)).limit(1);
  if (!providerRow) return NextResponse.json({ error: "Fournisseur introuvable" }, { status: 404 });

  const provider = await buildProvider(providerRow.type as "local" | "s3", providerRow.encryptedConfig);

  const entries = await provider.list();
  return NextResponse.json(entries);
}
