import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { appConfig } from "@/lib/db/schema";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { isPasswordPolicyEnforced, _resetPolicyCache } from "@/lib/security/passwordPolicy";
import { getSessionDurationDays, _resetSessionDurationCache } from "@/lib/security/sessionConfig";
import { getUserCreationRateLimit, _resetUserCreationRateLimitCache } from "@/lib/security/userCreationRateLimit";
import { getLoginRateLimitConfig, _resetLoginRateLimitConfigCache } from "@/lib/security/loginRateLimitConfig";
import { getUseCustomRoot, _resetUseCustomRootCache } from "@/lib/security/rootPageConfig";
import { getProtectedSlugs, _resetProtectedSlugsCache } from "@/lib/security/protectedSlugs";
import { listFormInstances } from "@/lib/db/formInstanceLoader";
import { logAdminEvent } from "@/lib/db/adminAudit";

const patchSchema = z.object({
  enforcePasswordPolicy:       z.boolean().optional(),
  sessionDurationDays:         z.number().int().min(1).max(365).optional(),
  userCreationRateLimit:       z.number().int().min(0).max(128).optional(),
  loginRateLimitMaxAttempts:   z.number().int().min(1).max(200).optional(),
  loginRateLimitWindowMinutes: z.number().int().min(1).max(1440).optional(),
  useCustomRoot:               z.boolean().optional(),
  protectedSlugs:              z.array(z.string().min(1).max(100)).optional(),
});

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const [enforcePasswordPolicy, sessionDurationDays, userCreationRateLimit, loginRateLimitCfg, useCustomRoot, rawProtected, forms] = await Promise.all([
    isPasswordPolicyEnforced(),
    getSessionDurationDays(),
    getUserCreationRateLimit(),
    getLoginRateLimitConfig(),
    getUseCustomRoot(),
    getProtectedSlugs(),
    listFormInstances(),
  ]);

  // Filter to only slugs that still have an existing form (invariant: protection is tied to existence)
  const existingSlugs = new Set(forms.map(f => f.slug));
  const protectedSlugs = rawProtected.filter(s => existingSlugs.has(s));

  return NextResponse.json({
    enforcePasswordPolicy,
    sessionDurationDays,
    userCreationRateLimit,
    loginRateLimitMaxAttempts: loginRateLimitCfg.maxAttempts,
    loginRateLimitWindowMinutes: loginRateLimitCfg.windowMinutes,
    useCustomRoot,
    protectedSlugs,
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  // Validate that each slug in protectedSlugs refers to an existing form
  if (parsed.data.protectedSlugs !== undefined) {
    const forms = await listFormInstances();
    const existingSlugs = new Set(forms.map(f => f.slug));
    const invalid = parsed.data.protectedSlugs.filter(s => !existingSlugs.has(s));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Non-existent slug(s): ${invalid.join(", ")}. Create the form first before protecting it.` },
        { status: 400 }
      );
    }
  }

  const updates: Partial<{
    enforcePasswordPolicy: boolean;
    sessionDurationDays: number;
    userCreationRateLimit: number;
    loginRateLimitMaxAttempts: number;
    loginRateLimitWindowMinutes: number;
    useCustomRoot: boolean;
    protectedSlugs: string[];
  }> = {};
  if (parsed.data.enforcePasswordPolicy       !== undefined) updates.enforcePasswordPolicy       = parsed.data.enforcePasswordPolicy;
  if (parsed.data.sessionDurationDays         !== undefined) updates.sessionDurationDays         = parsed.data.sessionDurationDays;
  if (parsed.data.userCreationRateLimit       !== undefined) updates.userCreationRateLimit       = parsed.data.userCreationRateLimit;
  if (parsed.data.loginRateLimitMaxAttempts   !== undefined) updates.loginRateLimitMaxAttempts   = parsed.data.loginRateLimitMaxAttempts;
  if (parsed.data.loginRateLimitWindowMinutes !== undefined) updates.loginRateLimitWindowMinutes = parsed.data.loginRateLimitWindowMinutes;
  if (parsed.data.useCustomRoot               !== undefined) updates.useCustomRoot               = parsed.data.useCustomRoot;
  if (parsed.data.protectedSlugs              !== undefined) updates.protectedSlugs              = parsed.data.protectedSlugs;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await db
    .insert(appConfig)
    .values({ id: 1, ...updates })
    .onConflictDoUpdate({ target: appConfig.id, set: updates });

  if (updates.enforcePasswordPolicy       !== undefined) _resetPolicyCache();
  if (updates.sessionDurationDays         !== undefined) _resetSessionDurationCache();
  if (updates.userCreationRateLimit       !== undefined) _resetUserCreationRateLimitCache();
  if (updates.loginRateLimitMaxAttempts   !== undefined) _resetLoginRateLimitConfigCache();
  if (updates.loginRateLimitWindowMinutes !== undefined) _resetLoginRateLimitConfigCache();
  if (updates.useCustomRoot               !== undefined) _resetUseCustomRootCache();
  if (updates.protectedSlugs              !== undefined) _resetProtectedSlugsCache();

  const user = await validateAdminSession(req);
  logAdminEvent({
    userId:       user?.id ?? null,
    userEmail:    user?.email ?? null,
    action:       "config.update",
    resourceType: "app_config",
    details:      updates,
  });

  return NextResponse.json(updates);
}
