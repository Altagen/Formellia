"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FileText, LayoutDashboard, Globe, FolderOpen, Clock, Archive, AlertTriangle, Users, Database, Mail } from "lucide-react";
import type { FormConfig } from "@/types/config";
import type { FormInstance } from "@/types/formInstance";
import { FormsTab } from "@/components/admin/config/FormsTab";
import { PagesTab } from "@/components/admin/config/ViewsTab";
import { DangerZoneTab } from "@/components/admin/config/DangerZoneTab";
import { DataSourcesTab } from "@/components/admin/config/DataSourcesTab";
import { ScheduledJobsTab } from "@/components/admin/config/ScheduledJobsTab";
import { AdminBrandingTab } from "@/components/admin/config/AdminBrandingTab";
import { BackupTab } from "@/components/admin/config/BackupTab";
import { AdminTab } from "@/components/admin/config/AdminTab";
import { DataPoolsTab } from "@/components/admin/config/DataPoolsTab";
import { ProvidersTab } from "@/components/admin/config/ProvidersTab";
import { MasterDetailLayout, type MasterDetailSection } from "@/components/admin/layout/MasterDetailLayout";
import { useTranslations } from "@/lib/context/LocaleContext";
import { useUserRole, useUserCtx } from "@/lib/context/UserRoleContext";

interface ConfigEditorProps {
  config: FormConfig;
  formInstances?: FormInstance[];
  initialTab?: string;
}

const ALL_TAB_IDS = ["general", "forms", "pages", "datapools", "emails", "sources", "taches", "backup", "danger", "administration"] as const;
type TabId = (typeof ALL_TAB_IDS)[number];

export function ConfigEditor({ config, formInstances = [], initialTab }: ConfigEditorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tr = useTranslations();
  const cfg = tr.admin.config;
  const role = useUserRole();
  const { accessibleFormIds } = useUserCtx();

  // Filter form instances to only those the user has access to
  const visibleFormInstances = accessibleFormIds === "all"
    ? formInstances
    : formInstances.filter(f => accessibleFormIds.includes(f.id));

  const iconClass = "w-4 h-4";
  const SECTIONS = useMemo<MasterDetailSection[]>(() => {
    const adminOnly = role === "admin";
    const contentItems = [
      { id: "forms", label: cfg.tabs.forms, icon: <FileText className={iconClass} /> },
      { id: "pages", label: cfg.tabs.pages, icon: <LayoutDashboard className={iconClass} /> },
    ];
    if (!adminOnly) {
      return [{ id: "content", label: cfg.sections.content, items: contentItems }];
    }
    return [
      { id: "content", label: cfg.sections.content, items: contentItems },
      {
        id: "platform",
        label: cfg.sections.platform,
        items: [
          { id: "general",   label: cfg.tabs.general,   icon: <Globe className={iconClass} /> },
          { id: "datapools", label: cfg.tabs.datapools, icon: <Database className={iconClass} /> },
          { id: "emails",    label: cfg.tabs.providers, icon: <Mail className={iconClass} /> },
          { id: "sources",   label: cfg.tabs.sources,   icon: <FolderOpen className={iconClass} /> },
          { id: "taches",    label: cfg.tabs.jobs,      icon: <Clock className={iconClass} /> },
          { id: "backup",    label: cfg.tabs.backup,    icon: <Archive className={iconClass} /> },
        ],
      },
      {
        id: "admin",
        label: cfg.sections.admin,
        items: [
          { id: "administration", label: cfg.tabs.administration, icon: <Users className={iconClass} /> },
          { id: "danger",         label: cfg.tabs.danger,         icon: <AlertTriangle className={iconClass} />, danger: true },
        ],
      },
    ];
  }, [role, cfg]);

  const [draft, setDraft] = useState<FormConfig>(() => JSON.parse(JSON.stringify(config)));

  const validInitial = (ALL_TAB_IDS.includes(initialTab as TabId) && (role === "admin" || ["forms", "pages"].includes(initialTab as string)))
    ? (initialTab as TabId)
    : "forms";
  const [activeTab, setActiveTab] = useState<TabId>(validInitial);

  // Keep activeTab in sync with the ?tab= URL param (sidebar links navigate
  // without remounting this component, so the initial-state pattern alone
  // would leave the right pane stuck on the previous tab).
  const urlTab = searchParams.get("tab");
  useEffect(() => {
    if (urlTab && ALL_TAB_IDS.includes(urlTab as TabId) && urlTab !== activeTab) {
      const isAllowed = role === "admin" || ["forms", "pages"].includes(urlTab);
      if (isAllowed) setActiveTab(urlTab as TabId);
    }
  }, [urlTab, activeTab, role]);

  function handleTabChange(id: TabId) {
    setActiveTab(id);
    router.replace(`?tab=${id}`, { scroll: false });
  }
  const [saving, setSaving] = useState(false);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(config);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const toastId = toast.loading(cfg.toasts.saving);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? cfg.toasts.errorStatus.replace("{status}", String(res.status)), { id: toastId });
      } else {
        toast.success(cfg.toasts.saved, { id: toastId });
        router.refresh();
      }
    } catch {
      toast.error(cfg.toasts.networkError, { id: toastId });
    } finally {
      setSaving(false);
    }
  }, [draft, cfg]);

  const handleExport = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/config/export");
      if (!res.ok) { toast.error(cfg.toasts.networkError); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "admin-config.yaml";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(cfg.toasts.networkError);
    }
  }, [cfg]);

  const handleReset = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/config", { method: "DELETE" });
      if (res.ok) {
        window.location.reload();
      } else {
        toast.error(cfg.toasts.networkError);
      }
    } catch {
      toast.error(cfg.toasts.networkError);
    }
  }, [cfg]);

  return (
    <div className="space-y-0">
      {/* Sticky top bar */}
      <div className="border-b border-border pb-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{cfg.title}</h1>
            {isDirty && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 text-xs font-medium">
                {cfg.unsaved}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">

            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {cfg.export}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {cfg.saving}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  {cfg.save}
                </>
              )}
            </button>
          </div>
        </div>

      </div>

      {/* DB mode info banner */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
        <svg className="w-4 h-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-200">{cfg.dbModeBannerTitle}</p>
          <p className="text-xs text-blue-800/80 dark:text-blue-300/80 mt-0.5">{cfg.dbModeBannerBody}</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[11px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          {cfg.dbMode}
        </span>
      </div>

      {/* Master/detail layout : vertical nav + content pane */}
      <MasterDetailLayout
        sections={SECTIONS}
        activeId={activeTab}
        onSelect={(id) => handleTabChange(id as TabId)}
      >
        {activeTab === "general" && (
          <div className="space-y-6">
            <AdminBrandingTab
              branding={draft.admin.branding}
              onChange={(branding) => setDraft({ ...draft, admin: { ...draft.admin, branding } })}
            />
            {/* Default locale for public forms */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">{cfg.defaultLocale}</h2>
              <p className="text-xs text-muted-foreground">{cfg.defaultLocaleDesc}</p>
              <select
                value={draft.locale ?? "fr"}
                onChange={(e) => setDraft({ ...draft, locale: e.target.value })}
                className="h-9 px-3 text-sm border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
              >
                <option value="fr">{cfg.meta.localeFr}</option>
                <option value="en">{cfg.meta.localeEn}</option>
              </select>
            </div>
          </div>
        )}
        {activeTab === "forms" && (
          <FormsTab instances={visibleFormInstances} />
        )}
        {activeTab === "pages" && (
          <PagesTab
            pages={draft.admin.pages}
            defaultPage={draft.admin.defaultPage}
            formSteps={visibleFormInstances.flatMap(inst => inst.config?.form?.steps ?? [])}
            formInstances={visibleFormInstances}
            features={draft.admin.features}
            autoGenerateView={draft.admin.autoGenerateView}
            initialExpandedPageId={searchParams.get("pageId") ?? undefined}
            onChangePages={(pages) => setDraft({ ...draft, admin: { ...draft.admin, pages } })}
            onChangeDefault={(defaultPage) => setDraft({ ...draft, admin: { ...draft.admin, defaultPage } })}
            tableColumns={draft.admin.tableColumns}
            onChangeColumns={(tableColumns) => setDraft({ ...draft, admin: { ...draft.admin, tableColumns } })}
            onChangeFeatures={(features) => setDraft({ ...draft, admin: { ...draft.admin, features } })}
            onChangeAutoGenerateView={(autoGenerateView) => setDraft({ ...draft, admin: { ...draft.admin, autoGenerateView } })}
          />
        )}
        {activeTab === "datapools" && (
          <DataPoolsTab
            exclusionReasons={draft.admin.exclusionReasons}
            onChangeExclusionReasons={(reasons) => setDraft({ ...draft, admin: { ...draft.admin, exclusionReasons: reasons } })}
          />
        )}
        {activeTab === "emails" && (
          <ProvidersTab />
        )}
        {activeTab === "sources" && (
          <DataSourcesTab />
        )}
        {activeTab === "taches" && (
          <ScheduledJobsTab />
        )}
        {activeTab === "backup" && (
          <BackupTab />
        )}
        {activeTab === "danger" && (
          <DangerZoneTab onReset={handleReset} />
        )}
        {activeTab === "administration" && (
          <AdminTab />
        )}
      </MasterDetailLayout>

      {/* Floating save button — visible when scrolled away from top bar */}
      {isDirty && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground rounded-full shadow-lg text-sm font-medium transition-all"
        >
          {saving ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
          )}
          {saving ? cfg.saving : cfg.save}
        </button>
      )}
    </div>
  );
}
