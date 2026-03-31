/**
 * Shared SSRF guard utility.
 *
 * Blocks requests targeting private/loopback/link-local IP ranges including
 * IPv4-mapped IPv6 variants (::ffff:*) that cover cloud metadata endpoints
 * (169.254.169.254 on AWS/GCP/Azure) and all RFC-1918 private ranges.
 *
 * Implementation notes:
 * - WHATWG URL keeps IPv6 brackets: new URL("http://[::1]").hostname === "[::1]"
 * - WHATWG URL normalises IPv4-mapped IPv6 to hex: ::ffff:127.0.0.1 → ::ffff:7f00:1
 *   So we strip brackets then test against the de-bracketed form.
 *
 * Usage:
 *   if (isSsrfUrl(url)) return 400/skip;
 */

// Matches bare hostnames (after bracket-stripping) for private/loopback/link-local.
// ::ffff: is blocked broadly — covers all IPv4-mapped IPv6 after WHATWG normalisation.
const PRIVATE_PATTERN =
  /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|0\.|224\.|240\.|::1$|fc00:|fe80:|::ffff:)/i;

/**
 * Returns true if the URL string targets a private/internal address and should be blocked.
 * Returns true if the URL is unparseable or uses a non-http(s) scheme.
 */
export function isSsrfUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return true; // unparseable = block
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return true;

  // Strip IPv6 brackets: "[::1]" → "::1", "[fc00::1]" → "fc00::1"
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  return PRIVATE_PATTERN.test(hostname);
}
