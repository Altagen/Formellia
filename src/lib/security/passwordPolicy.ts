/**
 * Password policy validation.
 *
 * Enforcement priority:
 *   1. ENFORCE_PASSWORD_POLICY env var ("true" | "false") — overrides everything
 *   2. app_config DB row (written by YAML bootstrap)
 *   3. Default: false (no policy — suitable for dev/test)
 *
 * Policy rules (when enforced):
 *   - Minimum 8 characters
 *   - At least 1 uppercase letter [A-Z]
 *   - At least 1 digit [0-9]
 *   - At least 1 special character
 */

export interface PolicyResult {
  valid:  boolean;
  errors: string[];
}

export const POLICY_RULES = [
  "Minimum 8 characters",
  "Au moins 1 majuscule (A-Z)",
  "At least 1 digit (0-9)",
  "At least 1 special character (!@#$%^&*...)",
] as const;

// Simple in-process cache — cleared on restart (acceptable: policy changes require restart anyway)
let _enforced: boolean | null = null;

/**
 * Returns true if the password policy is currently enforced.
 */
export async function isPasswordPolicyEnforced(): Promise<boolean> {
  // Env var always wins — no DB round-trip needed
  if (process.env.ENFORCE_PASSWORD_POLICY !== undefined) {
    return process.env.ENFORCE_PASSWORD_POLICY === "true";
  }

  if (_enforced !== null) return _enforced;

  try {
    const { db } = await import("@/lib/db");
    const { appConfig } = await import("@/lib/db/schema");
    const rows = await db
      .select({ enforcePasswordPolicy: appConfig.enforcePasswordPolicy })
      .from(appConfig)
      .limit(1);
    _enforced = rows[0]?.enforcePasswordPolicy ?? false;
  } catch {
    _enforced = false;
  }

  return _enforced;
}

/**
 * Validates a password against the active policy.
 * If policy is not enforced, always returns { valid: true, errors: [] }.
 */
export async function validatePassword(password: string): Promise<PolicyResult> {
  const enforced = await isPasswordPolicyEnforced();
  if (!enforced) return { valid: true, errors: [] };

  const errors: string[] = [];
  if (password.length < 8)              errors.push(POLICY_RULES[0]);
  if (!/[A-Z]/.test(password))          errors.push(POLICY_RULES[1]);
  if (!/[0-9]/.test(password))          errors.push(POLICY_RULES[2]);
  if (!/[!@#$%^&*()\-_=+[\]{}|;:,.<>?/\\'"~`]/.test(password)) errors.push(POLICY_RULES[3]);

  return { valid: errors.length === 0, errors };
}

/** Clears the cached policy state — for tests only. */
export function _resetPolicyCache(): void {
  _enforced = null;
}
