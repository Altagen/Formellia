import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/validateSession";
import { requireFormAccess } from "@/lib/auth/permissions";
import { getFormInstanceById } from "@/lib/db/formInstanceLoader";
import { buildFormExportData } from "@/lib/yaml/formExporter";
import { serializeConfig } from "@/lib/serialization/serializeConfig";

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

  const filename = instance.slug === "/" ? "root.yaml" : `${instance.slug}.yaml`;
  return serializeConfig(buildFormExportData(instance), req, filename);
}
