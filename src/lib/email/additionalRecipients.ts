/**
 * Parsing and normalisation for the composer's "Adresses additionnelles"
 * input. Operators paste free-form lists copied from address books,
 * spreadsheets, or other emails — anything goes in, but only validly-shaped
 * RFC 5322-ish addresses survive.
 *
 * Two surfaces use this helper:
 *   - the composer client (real-time validation feedback while typing)
 *   - the API routes (defensive re-validation before persisting / sending)
 *
 * The regex intentionally errs on the side of "looks like an email": it
 * accepts the addresses every provider accepts and rejects obvious typos
 * (spaces, missing @, missing TLD). It is NOT a full RFC 5322 grammar —
 * those are notoriously over-permissive and would let through quoted-local
 * strings the provider would reject anyway.
 */

// Local-part: any printable ASCII not in the set `()<>[]:;@\,"` plus `.`,
// with the standard constraint that `.` can't be first/last or repeated.
// Domain-part: at least one label + a TLD of >=2 chars.
const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/** Hard cap so a paste of a 50 000-line spreadsheet doesn't OOM the server. */
export const ADDITIONAL_RECIPIENTS_MAX = 1000;

export interface ParseResult {
  /** Lowercased, de-duplicated, syntactically-valid addresses (input order). */
  valid:   string[];
  /** Tokens that looked like an attempt but failed the regex — surfaced to the UI. */
  invalid: string[];
}

/**
 * Splits a chunk of free text on commas, semicolons, whitespace, and
 * newlines, then normalises and validates each token. Empty fragments and
 * exact duplicates (after lowercasing) are dropped silently.
 */
export function parseAdditionalRecipients(raw: string): ParseResult {
  if (!raw || typeof raw !== "string") return { valid: [], invalid: [] };

  const tokens = raw
    .split(/[\s,;]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const tok of tokens) {
    const lower = tok.toLowerCase();
    if (!EMAIL_RE.test(lower)) {
      invalid.push(tok);
      continue;
    }
    if (seen.has(lower)) continue;
    seen.add(lower);
    valid.push(lower);
  }

  return { valid, invalid };
}

/**
 * Defensive normalisation for values that come back from the DB jsonb
 * column. Older rows or hand-edited data may have stray casing / whitespace.
 * Returns the de-duplicated, lowercased, syntactically-valid subset.
 */
export function normalizeAdditionalRecipients(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== "string") continue;
    const lower = v.trim().toLowerCase();
    if (!EMAIL_RE.test(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}
