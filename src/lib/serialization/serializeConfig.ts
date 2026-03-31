import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import yaml from "js-yaml";

/** Serialises data to a YAML string (for use in backup ZIP). */
export function serializeConfigToString(data: unknown): string {
  return yaml.dump(data, { lineWidth: 120, noRefs: true, indent: 2 });
}

/**
 * Serialises data to YAML or JSON depending on the Accept header.
 * - Accept: application/json → JSON response
 * - Anything else (default)  → YAML response
 */
export function serializeConfig(
  data: unknown,
  req: NextRequest,
  filename?: string,
): NextResponse {
  const accept = req.headers.get("accept") ?? "";

  if (accept.includes("application/json")) {
    const body = JSON.stringify(data, null, 2);
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
    };
    if (filename) {
      headers["Content-Disposition"] = `attachment; filename="${filename.replace(/\.ya?ml$/, ".json")}"`;
    }
    return new NextResponse(body, { headers });
  }

  const body = yaml.dump(data, { lineWidth: 120, noRefs: true, indent: 2 });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-yaml; charset=utf-8",
  };
  if (filename) {
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }
  return new NextResponse(body, { headers });
}
