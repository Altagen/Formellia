import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/validateSession";
import { getFormConfig } from "@/lib/config";
import { serializeConfig } from "@/lib/serialization/serializeConfig";

/**
 * GET /api/admin/config/export
 *
 * Exports the global admin config (pages, widgets, columns, branding, features,
 * priorityThresholds) as YAML (default) or JSON (Accept: application/json).
 *
 * Replaces the legacy TypeScript export (form.config.ts).
 */
export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const config = await getFormConfig();
  return serializeConfig(config, req, "admin-config.yaml");
}
