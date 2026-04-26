import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { backupProviders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildProvider } from "@/lib/backup/providers/index";
import { checkAdminRateLimit } from "@/lib/security/adminRateLimit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  // Rate limit: 5 connection tests per user per 5 minutes
  const user = await validateAdminSession(req);
  const rl = checkAdminRateLimit(`provider-test:${user?.id ?? "anon"}`, 5, 5 * 60 * 1000);
  if (rl.blocked) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }

  const { id } = await params;
  const [provider] = await db.select().from(backupProviders).where(eq(backupProviders.id, id)).limit(1);
  if (!provider) return NextResponse.json({ error: "Fournisseur introuvable" }, { status: 404 });

  try {
    const impl = await buildProvider(provider.type as "local" | "s3", provider.encryptedConfig);
    await impl.testConnection();
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }
}
