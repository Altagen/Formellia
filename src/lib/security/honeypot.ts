import type { SecurityConfig } from "@/types/config";

/**
 * Returns the honeypot field name for this deployment.
 * Uses the configured fieldName, or derives a stable name from the app meta
 * to make it less obvious to scrapers.
 */
export function getHoneypotFieldName(security: SecurityConfig, appName: string): string {
  return security.honeypot?.fieldName ?? `_${appName.toLowerCase().replace(/\s+/g, "_")}_check`;
}

/**
 * Returns true if the honeypot field was filled (bot detected).
 * A legitimate user will never see or fill this field.
 */
export function isHoneypotFilled(
  body: Record<string, unknown>,
  fieldName: string
): boolean {
  const value = body[fieldName];
  return value !== undefined && value !== "" && value !== null;
}
