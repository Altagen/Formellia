import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/validateSession";
import { requireFormAccess } from "@/lib/auth/permissions";
import { getFormInstanceById } from "@/lib/db/formInstanceLoader";
import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isDisposableEmail } from "@/lib/utils/disposableEmails";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminSession(req);
  if (guard) return guard;

  const { id } = await params;
  const accessGuard = await requireFormAccess(req, id, "viewer");
  if (accessGuard) return accessGuard;
  const instance = await getFormInstanceById(id);
  if (!instance) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const rows = await db
    .select({ email: submissions.email })
    .from(submissions)
    .where(eq(submissions.formInstanceId, id));

  const total = rows.length;
  const disposable = rows.filter(r => r.email != null && isDisposableEmail(r.email)).length;
  const disposablePercent = total > 0 ? Math.round((disposable / total) * 100) : 0;

  return NextResponse.json({ total, disposable, disposablePercent });
}
