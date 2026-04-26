import { NextResponse } from "next/server";
import { isPasswordPolicyEnforced, POLICY_RULES } from "@/lib/security/passwordPolicy";

/**
 * Returns the current password policy configuration.
 * Public endpoint — no auth required (used by the setup wizard before any user exists).
 */
export async function GET() {
  const enforced = await isPasswordPolicyEnforced();
  return NextResponse.json({
    enforced,
    rules: enforced ? [...POLICY_RULES] : [],
  });
}
