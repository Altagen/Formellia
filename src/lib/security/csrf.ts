import type { NextRequest } from "next/server";

/**
 * Validates that a state-changing request originates from the same host.
 * Checks the `Origin` header — browsers always send it on cross-site requests.
 * Same-origin fetch() from the admin UI doesn't send Origin on all browsers,
 * so we fall back to allowing requests without Origin (same-origin assumption).
 *
 * This prevents cross-site request forgery from attacker-controlled origins.
 */
export function validateCsrfOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    // No Origin header — browser same-origin request or server-to-server; allow.
    return true;
  }

  const host = req.headers.get("host");
  if (!host) return false;

  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}
