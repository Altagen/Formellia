import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { lucia } from "@/lib/auth/lucia";
import { db } from "@/lib/db";
import { users, userFormGrants, formInstances } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { PrioritySettingsProvider } from "@/lib/context/PrioritySettingsContext";
import { DEFAULT_THRESHOLDS } from "@/lib/utils/priority";
import { UserRoleProvider } from "@/lib/context/UserRoleContext";
import { LocaleProvider } from "@/lib/context/LocaleContext";
import { AdminShell } from "@/components/admin/AdminShell";
import { Toaster } from "@/components/ui/sonner";
import { getFormConfig } from "@/lib/config";
import { buildPresetCssVars } from "@/lib/theme/cssVars";
import type { AdminRole } from "@/lib/auth/validateSession";
import type { ThemeMode } from "@/types/config";
import type { Locale } from "@/i18n";

export const dynamic = "force-dynamic";

async function getUserWithPrefs() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(lucia.sessionCookieName)?.value;
    if (!sessionId) return null;
    const { session, user } = await lucia.validateSession(sessionId);
    if (!session || !user) return null;
    const rows = await db
      .select({ role: users.role, themeMode: users.themeMode, colorPreset: users.colorPreset, locale: users.locale, recoveryCodes: users.recoveryCodes, sidebarLayout: users.sidebarLayout })
      .from(users).where(eq(users.id, user.id)).limit(1);
    const row = rows[0];
    if (!row) return null;

    // Resolve accessible form IDs for scoped-only users (role = null)
    let accessibleFormIds: string[] | "all" = "all";
    if (row.role === null) {
      const grants = await db
        .select({ formInstanceId: userFormGrants.formInstanceId })
        .from(userFormGrants)
        .where(eq(userFormGrants.userId, user.id));
      accessibleFormIds = grants.map(g => g.formInstanceId);
    }

    const VALID_ROLES: AdminRole[] = ["admin", "editor", "agent", "viewer"];
    const resolvedRole: AdminRole = row.role !== null && VALID_ROLES.includes(row.role as AdminRole)
      ? (row.role as AdminRole)
      : "viewer";

    // Resolve metadata for pinned forms (name + slug for sidebar display)
    const pinnedIds = row.sidebarLayout?.pinnedForms ?? [];
    const pinnedFormMeta = pinnedIds.length > 0
      ? await db
          .select({ id: formInstances.id, name: formInstances.name, slug: formInstances.slug })
          .from(formInstances)
          .where(inArray(formInstances.id, pinnedIds))
      : [];

    return {
      id: user.id,
      email: user.email,
      role: resolvedRole,
      themeMode: (row.themeMode ?? "light") as ThemeMode,
      colorPreset: row.colorPreset ?? "default",
      locale: (row.locale ?? "fr") as Locale,
      hasRecoveryCodes: !!(row.recoveryCodes?.length),
      accessibleFormIds,
      sidebarLayout: row.sidebarLayout ?? null,
      pinnedFormMeta,
    };
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("DYNAMIC_SERVER_USAGE") || digest.startsWith("NEXT_REDIRECT")) throw error;
    console.error("[Auth] Admin layout session error:", error);
    return null;
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserWithPrefs();
  if (!user) redirect("/admin/login");

  const config = await getFormConfig();
  // User locale is always set (DB default "fr")
  const effectiveLocale = user.locale ?? "fr";
  const presetCss = buildPresetCssVars(user.colorPreset);

  // Inline script injected before page render to avoid FOUC on dark mode
  const themeScript = `(function(){var m=${JSON.stringify(user.themeMode)};if(m==="dark")document.documentElement.classList.add("dark");else document.documentElement.classList.remove("dark");})()`;

  return (
    <LocaleProvider locale={effectiveLocale}>
      <UserRoleProvider role={user.role} hasEmail={!!user.email} hasRecoveryCodes={user.hasRecoveryCodes} accessibleFormIds={user.accessibleFormIds}>
        {/* FOUC prevention: apply theme class synchronously before first paint */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {presetCss && (
          <style id="admin-user-preset-css" dangerouslySetInnerHTML={{ __html: presetCss }} />
        )}
        <AdminShell
          userEmail={user.email ?? ""}
          pages={config.admin.pages}
          features={config.admin.features}
          branding={config.admin.branding}
          initialThemeMode={user.themeMode}
          initialColorPreset={user.colorPreset}
          initialLocale={user.locale}
          initialSidebarLayout={user.sidebarLayout}
          pinnedFormMeta={user.pinnedFormMeta}
        >
          <PrioritySettingsProvider settings={DEFAULT_THRESHOLDS}>
            {children}
          </PrioritySettingsProvider>
        </AdminShell>
        <Toaster position="bottom-right" richColors />
      </UserRoleProvider>
    </LocaleProvider>
  );
}
