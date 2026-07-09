import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/validateSession";
import { getFormConfig } from "@/lib/config";
import { buildViewExportData } from "@/lib/yaml/viewExporter";
import { serializeConfig } from "@/lib/serialization/serializeConfig";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminSession(req);
  if (guard) return guard;

  const { id } = await params;
  const config = await getFormConfig();
  const view = (config.admin.pages ?? []).find(p => p.id === id);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const safeSlug = view.slug.replace(/[^a-z0-9-_]/gi, "-").replace(/^-+|-+$/g, "") || "view";
  return serializeConfig(buildViewExportData(view), req, `${safeSlug}.yaml`);
}
