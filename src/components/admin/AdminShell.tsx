"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { toast } from "sonner";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { UserPreferencesProvider } from "@/lib/context/UserPreferencesContext";
import { useUserCtx } from "@/lib/context/UserRoleContext";
import { useTranslations } from "@/lib/context/LocaleContext";
import type { AdminPage, AdminFeatures, AdminBrandingConfig } from "@/types/config";
import type { ThemeMode } from "@/types/config";
import type { Locale } from "@/i18n";
import type { SidebarLayout } from "@/types/sidebarLayout";

interface AdminShellProps {
  userEmail: string;
  pages: AdminPage[];
  features?: AdminFeatures;
  branding?: AdminBrandingConfig;
  initialThemeMode: ThemeMode;
  initialColorPreset: string;
  initialLocale: Locale;
  initialSidebarLayout?: SidebarLayout | null;
  initialSidebarCollapsed?: boolean;
  pinnedFormMeta?: { id: string; name: string; slug: string }[];
  children: React.ReactNode;
}

export function AdminShell({ userEmail, pages, features, branding, initialThemeMode, initialColorPreset, initialLocale, initialSidebarLayout, initialSidebarCollapsed = false, pinnedFormMeta, children }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const appName = branding?.appName || "Formellia";

  // Restore collapse pref (desktop only) once the shell mounts.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDesktopCollapsed(window.localStorage.getItem("admin-sidebar-collapsed") === "1");
  }, []);

  function toggleDesktopCollapsed() {
    setDesktopCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("admin-sidebar-collapsed", next ? "1" : "0");
      }
      return next;
    });
  }
  const { hasEmail, hasRecoveryCodes } = useUserCtx();
  const router = useRouter();
  const tr = useTranslations();

  useEffect(() => {
    if (!hasEmail && !sessionStorage.getItem("email-reminded")) {
      sessionStorage.setItem("email-reminded", "1");
      toast.warning(tr.admin.emailMissingToast, {
        action: { label: tr.admin.emailMissingAction, onClick: () => router.push("/admin/profile") },
      });
    }
    if (!hasRecoveryCodes && !sessionStorage.getItem("recovery-codes-reminded")) {
      sessionStorage.setItem("recovery-codes-reminded", "1");
      toast.warning(tr.admin.recoveryCodesMissingToast, {
        action: { label: tr.admin.recoveryCodesMissingAction, onClick: () => router.push("/admin/profile") },
      });
    }

    // Show migration status toast once per session after a migration is applied
    if (!sessionStorage.getItem("migration-notified")) {
      sessionStorage.setItem("migration-notified", "1");
      fetch("/api/health")
        .then(r => r.json())
        .then((data: { checks?: { db?: { migrated?: boolean } } }) => {
          if (data?.checks?.db?.migrated) {
            toast.success(tr.admin.health.dbUpToDate, { duration: 4000 });
          }
        })
        .catch(() => {});
    }
  }, [hasEmail, hasRecoveryCodes, router, tr]);

  return (
    <UserPreferencesProvider initialThemeMode={initialThemeMode} initialColorPreset={initialColorPreset} initialLocale={initialLocale}>
      <div className="flex h-screen bg-background overflow-hidden">
        {/* Mobile header — hidden on md+ */}
        <header className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-3 h-14 px-4 border-b border-border bg-card shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
            aria-label={tr.admin.openMenu}
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-sm tracking-tight truncate">{appName}</span>
        </header>

        {/* Backdrop mobile */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar — drawer fixe sur mobile, statique sur md+ (collapsible on desktop) */}
        <div
          className={`group/sb fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out md:static md:z-auto md:translate-x-0 md:transition-none ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } md:relative`}
        >
          <AdminSidebar
            userEmail={userEmail}
            pages={pages}
            features={features}
            branding={branding}
            initialSidebarLayout={initialSidebarLayout}
            pinnedFormMeta={pinnedFormMeta}
            collapsed={desktopCollapsed}
            onClose={() => setSidebarOpen(false)}
          />
          {/* Desktop-only collapse toggle — small chevron that grows on hover */}
          <button
            type="button"
            onClick={toggleDesktopCollapsed}
            aria-label={desktopCollapsed ? tr.admin.expandSidebar : tr.admin.collapseSidebar}
            title={desktopCollapsed ? tr.admin.expandSidebar : tr.admin.collapseSidebar}
            className="hidden md:flex absolute top-1/2 -right-3 -translate-y-1/2 z-10 items-center justify-center w-5 h-5 rounded-full border border-border bg-card text-muted-foreground shadow-sm opacity-60 hover:opacity-100 hover:w-7 hover:h-7 hover:text-foreground hover:shadow-md transition-all duration-150 cursor-pointer"
          >
            {desktopCollapsed
              ? <ChevronRight className="w-3 h-3" />
              : <ChevronLeft className="w-3 h-3" />}
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Spacer for the fixed mobile header */}
          <div className="md:hidden h-14 shrink-0" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </UserPreferencesProvider>
  );
}
