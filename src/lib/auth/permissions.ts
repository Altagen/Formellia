/**
 * Central authorization engine.
 *
 * All form-scoped access decisions go through this module.
 * Global role checks (admin-only routes) stay in validateSession.ts.
 */
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, userFormGrants } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { validateAdminSession } from "./validateSession";

export type EffectiveRole = "admin" | "editor" | "agent" | "viewer";

export const ROLE_LEVELS: Record<EffectiveRole, number> = {
  viewer: 0,
  agent:  1,
  editor: 2,
  admin:  3,
};

export function roleAtLeast(role: EffectiveRole, min: EffectiveRole): boolean {
  return ROLE_LEVELS[role] >= ROLE_LEVELS[min];
}

const VALID_EFFECTIVE_ROLES: EffectiveRole[] = ["admin", "editor", "agent", "viewer"];
const VALID_GRANT_ROLES:     EffectiveRole[] = ["editor", "agent", "viewer"];

/**
 * Resolves the effective role of a user for an optional form.
 *
 * Resolution rules:
 *   user.role = non-null         → that role (applies to all forms)
 *   user.role = null + formId    → check user_form_grants for that form
 *   user.role = null + no grant  → null (access denied)
 *   user.role = null + no formId → null (no global access)
 */
export async function resolveEffectiveRole(
  userId: string,
  formId?: string,
): Promise<EffectiveRole | null> {
  const [userRow] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const globalRole = userRow?.role ?? null;

  if (globalRole !== null) {
    return VALID_EFFECTIVE_ROLES.includes(globalRole as EffectiveRole)
      ? (globalRole as EffectiveRole)
      : "viewer";
  }

  if (!formId) return null;

  const [grantRow] = await db
    .select({ role: userFormGrants.role })
    .from(userFormGrants)
    .where(and(
      eq(userFormGrants.userId, userId),
      eq(userFormGrants.formInstanceId, formId),
    ))
    .limit(1);

  const grantRole = grantRow?.role ?? null;
  if (!grantRole) return null;

  return VALID_GRANT_ROLES.includes(grantRole as EffectiveRole)
    ? (grantRole as EffectiveRole)
    : null;
}

/**
 * HTTP guard for form-scoped routes.
 * Returns NextResponse(401/403) or null if access is granted.
 *
 * API keys always carry a global role (stored in apiKeys.role) and are never
 * scoped per-form. When the session is an API key, we use the role from the
 * session directly instead of querying user_form_grants.
 */
export async function requireFormAccess(
  req: NextRequest,
  formId: string,
  minRole: EffectiveRole,
): Promise<NextResponse | null> {
  const session = await validateAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  // API keys use a global role — no per-form scoping
  if (session.id.startsWith("apikey:")) {
    const apiKeyRole = VALID_EFFECTIVE_ROLES.includes(session.role as EffectiveRole)
      ? (session.role as EffectiveRole)
      : "viewer";
    if (!roleAtLeast(apiKeyRole, minRole)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return null;
  }

  const effective = await resolveEffectiveRole(session.id, formId);
  if (effective === null || ROLE_LEVELS[effective] < ROLE_LEVELS[minRole]) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  return null;
}

/**
 * Returns the form instance IDs accessible to a user.
 * "all" if the user has a non-null global role (same behaviour as today).
 * string[] if role is null (only forms with an active grant).
 */
export async function getAccessibleFormIds(
  userId: string,
): Promise<string[] | "all"> {
  const [userRow] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userRow?.role !== null && userRow?.role !== undefined) return "all";

  const grants = await db
    .select({ formInstanceId: userFormGrants.formInstanceId })
    .from(userFormGrants)
    .where(eq(userFormGrants.userId, userId));

  return grants.map(g => g.formInstanceId);
}
