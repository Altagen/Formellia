/**
 * Custom CA certificate management.
 *
 * Loads enabled PEM certificates from the DB and applies them to
 * outgoing TLS connections via:
 *   1. https.globalAgent (covers AWS SDK v3, node-https, etc.)
 *   2. undici setGlobalDispatcher (covers Node 18+ native fetch)
 */
import { startupLogger as log } from "@/lib/logger";

let _cachedBundle: string | null = null;

/** Returns a PEM bundle of all enabled custom CA certs. "" when none. */
export async function getCustomCaPemBundle(): Promise<string> {
  if (_cachedBundle !== null) return _cachedBundle;

  try {
    const { db } = await import("@/lib/db");
    const { customCaCerts } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({ pem: customCaCerts.pem })
      .from(customCaCerts)
      .where(eq(customCaCerts.enabled, true));
    _cachedBundle = rows.map(r => r.pem.trim()).join("\n\n");
  } catch {
    _cachedBundle = "";
  }

  return _cachedBundle;
}

export function invalidateCustomCaCache(): void {
  _cachedBundle = null;
  // Re-apply asynchronously so new/removed certs take effect without a restart
  applyCustomCaCerts().catch(() => {});
}

/**
 * Applies all enabled custom CA certs to the process-wide TLS stack.
 * Called once at server startup (bootstrap.ts).
 */
export async function applyCustomCaCerts(): Promise<void> {
  const bundle = await getCustomCaPemBundle();
  if (!bundle) return;

  let applied = 0;

  // 1. Patch https.globalAgent — covers @aws-sdk/client-s3 and legacy libs
  try {
    const https = await import("node:https");
    const existing = https.globalAgent.options.ca;
    const existingArr: (string | Buffer)[] = Array.isArray(existing) ? existing : existing ? [existing as string | Buffer] : [];
    https.globalAgent.options.ca = [...existingArr, bundle];
    applied++;
  } catch {
    // Edge runtime — skip
  }

  // 2. Try undici setGlobalDispatcher — covers Node 18+ native fetch
  try {
    const { setGlobalDispatcher, Agent } = await import("undici");
    setGlobalDispatcher(new Agent({ connect: { ca: bundle } }));
    applied++;
  } catch {
    // undici not available as a named import — Node native fetch won't use custom CA
  }

  log.info({ applied }, "Custom CA certs applied to TLS stack");
}
