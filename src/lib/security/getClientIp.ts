import type { NextRequest } from "next/server";

/**
 * Extracts the client IP address for rate limiting.
 *
 * Trust model (set TRUSTED_PROXY=true when behind nginx / Cloudflare / AWS ALB):
 *   TRUSTED_PROXY=true  → trust X-Real-IP set by the reverse proxy (single value, not forgeable)
 *   TRUSTED_PROXY=false → ignore forwarded headers (default, prevents spoofing)
 *
 * "unknown" is a valid value — it means all unidentified clients share the same
 * rate limit bucket, which is conservative and safe.
 */
export function getClientIp(req: NextRequest): string {
  const trusted = process.env.TRUSTED_PROXY === "true";

  if (trusted) {
    // X-Real-IP is set by the reverse proxy itself — not user-controllable
    const realIp = req.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;

    // Fallback: rightmost entry in X-Forwarded-For is added by our trusted proxy
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded.split(",");
      const last = parts[parts.length - 1]?.trim();
      if (last) return last;
    }
  }

  // Not trusted or no headers — conservative fallback
  // All unknown clients share one rate-limit bucket, which is safe
  return "unknown";
}
