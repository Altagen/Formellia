import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole } from "@/lib/auth/validateSession";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  try {
    const { runJob } = await import("@/lib/scheduler/runner");
    await runJob(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
