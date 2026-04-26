import type { NextRequest } from "next/server";
import yaml from "js-yaml";

/**
 * Parses a request body as JSON or YAML depending on Content-Type.
 * - application/json → JSON.parse
 * - anything else (including application/x-yaml, text/yaml, absent) → yaml.load
 *
 * Returns the parsed value or throws with a human-readable message.
 */
export async function parseBody(req: NextRequest): Promise<unknown> {
  const contentType = req.headers.get("content-type") ?? "";
  const text = await req.text();

  if (!text.trim()) throw new Error("Empty request body");

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("JSON invalide");
    }
  }

  try {
    return yaml.load(text);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erreur de parsing";
    throw new Error(`YAML invalide : ${msg}`);
  }
}
