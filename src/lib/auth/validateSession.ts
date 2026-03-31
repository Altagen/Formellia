import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { lucia } from "./lucia";
import { validateCsrfOrigin } from "@/lib/security/csrf";
import { db } from "@/lib/db";
import { users, apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { authLogger as log } from "@/lib/logger";
import { checkAdminRateLimit } from "@/lib/security/adminRateLimit";
import { getClientIp } from "@/lib/security/getClientIp";

export type AdminRole = "admin" | "editor" | "agent" | "viewer";

/**
 * Validates the admin session from:
 * 1. Authorization: Bearer <api_key> header (programmatic access)
 * 2. Session cookie managed by Lucia (browser UI)
 *
 * Returns the user/key identity or null if unauthenticated.
 */
export async function validateAdminSession(req?: NextRequest): Promise<{ id: string; email: string | null; username?: string; role: AdminRole } | null> {
  // ── 1. Bearer token (API key) ──────────────────────────
  const authHeader = req?.headers.get("authorization") ?? null;
  if (authHeader?.startsWith("Bearer ")) {
    const rawKey = authHeader.slice(7).trim();
    if (rawKey) {
      // Rate-limit invalid Bearer attempts per IP to prevent brute-force
      const ip = req ? getClientIp(req) : "unknown";
      const rl = checkAdminRateLimit(`bearer:${ip}`, 30, 60 * 1000); // 30 attempts/min per IP
      if (rl.blocked) return null; // silently reject — caller will get 401

      const keyHash = createHash("sha256").update(rawKey).digest("hex");
      try {
        const rows = await db
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.keyHash, keyHash))
          .limit(1);
        const key = rows[0];
        if (key) {
          // Check expiry
          if (key.expiresAt && key.expiresAt < new Date()) return null;
          // Update lastUsedAt (fire-and-forget, no await)
          db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id)).catch(() => {});
          const role = (["admin", "editor", "agent", "viewer"].includes(key.role) ? key.role : "viewer") as AdminRole;
          return { id: `apikey:${key.id}`, email: `[api-key] ${key.name}`, role };
        }
      } catch (error) {
        log.error({ err: error }, "API key lookup error");
      }
      return null; // Invalid bearer token — do not fall through to cookie auth
    }
  }

  // ── 2. Session cookie (browser UI) ────────────────────
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(lucia.sessionCookieName)?.value;
    if (!sessionId) return null;
    const { user } = await lucia.validateSession(sessionId);
    if (!user) return null;

    // Fetch role, email and username from DB (lucia user object doesn't include them)
    const rows = await db.select({ role: users.role, email: users.email, username: users.username }).from(users).where(eq(users.id, user.id)).limit(1);
    const rawRole = rows[0]?.role ?? null;
    // null = scoped-only user; unknown values → "viewer" (least privilege)
    const VALID: AdminRole[] = ["admin", "editor", "agent", "viewer"];
    const role: AdminRole = rawRole !== null && VALID.includes(rawRole as AdminRole) ? (rawRole as AdminRole) : "viewer";
    return { id: user.id, email: rows[0]?.email ?? null, username: rows[0]?.username, role };
  } catch (error) {
    log.error({ err: error }, "validateAdminSession error");
    return null;
  }
}

const ROLE_LEVELS: Record<AdminRole, number> = { viewer: 0, agent: 1, editor: 2, admin: 3 };

/**
 * Returns 403 if the authenticated user's role is below the required minimum.
 * Accepts an optional req to support bearer token auth.
 */
export async function requireRole(minRole: AdminRole, req?: NextRequest): Promise<NextResponse | null> {
  const user = await validateAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }
  if (ROLE_LEVELS[user.role] < ROLE_LEVELS[minRole]) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  return null;
}

/**
 * Guard helper for API route handlers.
 * Checks session cookie OR Bearer token.
 *
 * Usage:
 *   const guard = await requireAdminSession(req);
 *   if (guard) return guard;
 */
export async function requireAdminSession(req?: NextRequest): Promise<NextResponse | null> {
  const user = await validateAdminSession(req);
  if (!user) {
    return NextResponse.json(
      { error: "Session expired" },
      { status: 401 }
    );
  }
  return null;
}

/**
 * Guard for state-changing admin routes (POST/PUT/DELETE/PATCH).
 * - Browser requests: validates CSRF origin + session cookie
 * - API key requests (Bearer token): skips CSRF (not applicable), validates key
 *
 * Usage:
 *   const guard = await requireAdminMutation(req);
 *   if (guard) return guard;
 */
export async function requireAdminMutation(req: NextRequest): Promise<NextResponse | null> {
  // API key bearer tokens bypass CSRF (they are not browser-initiated)
  if (req.headers.get("authorization")?.startsWith("Bearer ")) {
    return requireAdminSession(req);
  }
  if (!validateCsrfOrigin(req)) {
    return NextResponse.json(
      { error: "Cross-origin request denied" },
      { status: 403 }
    );
  }
  return requireAdminSession(req);
}
