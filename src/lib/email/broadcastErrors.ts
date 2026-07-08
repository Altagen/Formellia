/**
 * Single source of truth for broadcast error codes shared between:
 *
 *   - the /api/admin/email/broadcasts/:id/send route (response body)
 *   - the executeBroadcast service (last_error column prefix)
 *   - the composer client (translation lookup in t.admin.email.composer.errors)
 *   - the i18n bundles (src/i18n/en.ts + src/i18n/fr.ts)
 *
 * Adding a new value here makes the build fail until both bundles ship a
 * matching string — that's the whole point of the union type.
 *
 * The composer's translation map (`t.errors`) keys are declared with the
 * same identifiers; TypeScript checks them at access time via the
 * `Record<BroadcastErrorCode, string>` shape (see i18n/en.ts).
 */

export type BroadcastErrorCode =
  | "rateLimit"
  | "notFound"
  | "wrongState"
  | "noRecipients"
  | "claimFailed"
  | "sendFailed"
  | "providerNotConfigured"
  | "noRecipientsAfterMerge";

/**
 * Build the `code:<key> — <fallback>` string that `markBroadcastFailed`
 * persists in `email_broadcasts.last_error`. The composer client strips the
 * prefix and renders the translated string for known codes, falling back to
 * the human message for unknown ones (forward-compat).
 */
export function formatServiceError(code: BroadcastErrorCode, message: string): string {
  return `code:${code} — ${message}`;
}
