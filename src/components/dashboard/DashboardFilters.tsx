"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { Submission } from "@/lib/db/schema";
import type { FormConfig, StepDef } from "@/types/config";
import { SubmissionsTable, type SubmissionServerFilters } from "./SubmissionsTable";
import { SubmissionDetail } from "./SubmissionDetail";
import { calcAutoPriority } from "@/lib/utils/priority";
import { usePrioritySettings } from "@/lib/context/PrioritySettingsContext";
import { useTranslations } from "@/lib/context/LocaleContext";
import type { ChartFilter } from "./DashboardView";

const PAGE_SIZE = 20;

function toDateString(date: Date): string { return date.toISOString().slice(0, 10); }

function formatFieldKey(key: string): string {
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const DATE_KEY_RE = /date|_at$|timestamp/i;
const SKIP_FIELD_KEYS = new Set(["id"]);

interface CustomStatus {
  value: string;
  label: string;
  color: string;
}

interface DashboardFiltersProps {
  // Server-side mode: native form submissions
  formInstanceId?: string;
  // Client-side mode: external sources (pass submissions directly)
  submissions?: Submission[];
  formConfig?: FormConfig;
  formSteps?: StepDef[];
  searchFields?: string[];
  isExternalSource?: boolean;
  hiddenColumns?: string[];
  customStatuses?: CustomStatus[];
  currentUserEmail?: string;
  /** Filter pushed from a chart segment click (Feature 3) */
  chartFilter?: ChartFilter;
}

export function DashboardFilters({
  formInstanceId,
  submissions: externalSubmissions,
  formConfig,
  formSteps,
  searchFields,
  isExternalSource,
  hiddenColumns,
  customStatuses,
  currentUserEmail,
  chartFilter,
}: DashboardFiltersProps) {
  // If external submissions are provided, use the legacy client-side mode
  const isClientMode = !!externalSubmissions;

  if (isClientMode) {
    return (
      <DashboardFiltersClient
        submissions={externalSubmissions!}
        formConfig={formConfig}
        formSteps={formSteps}
        searchFields={searchFields}
        isExternalSource={isExternalSource}
        hiddenColumns={hiddenColumns}
        customStatuses={customStatuses}
        currentUserEmail={currentUserEmail}
      />
    );
  }

  return (
    <DashboardFiltersServer
      formInstanceId={formInstanceId}
      formConfig={formConfig}
      formSteps={formSteps}
      searchFields={searchFields}
      customStatuses={customStatuses}
      currentUserEmail={currentUserEmail}
      chartFilter={chartFilter}
    />
  );
}

// ─────────────────────────────────────────────────────────
// Server-driven filter panel (for native form submissions)
// ─────────────────────────────────────────────────────────

interface DashboardFiltersServerProps {
  formInstanceId?: string;
  formConfig?: FormConfig;
  formSteps?: StepDef[];
  searchFields?: string[];
  customStatuses?: CustomStatus[];
  currentUserEmail?: string;
  chartFilter?: ChartFilter;
}

function DashboardFiltersServer({
  formInstanceId,
  formConfig,
  formSteps,
  searchFields,
  customStatuses,
  currentUserEmail,
  chartFilter,
}: DashboardFiltersServerProps) {
  const tr = useTranslations();
  const f = tr.admin.filters;
  const statusLabels: Record<string, string> = {
    pending: tr.status.pending, in_progress: tr.status.in_progress,
    done: tr.status.done, waiting_user: tr.status.waiting_user,
  };
  const priorityLabels: Record<string, string> = {
    none: tr.priority.none_filter, green: tr.priority.green,
    yellow: tr.priority.yellow, orange: tr.priority.orange, red: tr.priority.red,
  };

  const [emailSearch, setEmailSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDateTo, setShowDateTo] = useState(false);
  const [mySubmissionsOnly, setMySubmissionsOnly] = useState(false);

  // Saved views
  const [savedViews, setSavedViews] = useState<Array<{ id: string; name: string; filters: unknown }>>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [viewName, setViewName] = useState("");
  const [savingView, setSavingView] = useState(false);
  const [showViewsDropdown, setShowViewsDropdown] = useState(false);

  // Custom form field searches
  const [fieldSearches, setFieldSearches] = useState<Record<string, string>>({});

  // Export state
  const [exporting, setExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportError, setExportError] = useState("");

  // Apply chart filter when it changes (click-to-filter from charts)
  useEffect(() => {
    if (chartFilter?.status !== undefined) setStatusFilter(chartFilter.status ?? "");
    if (chartFilter?.priority !== undefined) setPriorityFilter(chartFilter.priority ?? "");
  }, [chartFilter]);

  useEffect(() => {
    fetch("/api/admin/saved-filters")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSavedViews(data); })
      .catch(() => {});
  }, []);

  function serializeFilters() {
    return { emailSearch, statusFilter, priorityFilter, dateFrom, dateTo, showDateTo, fieldSearches };
  }

  function applyFilters(f: Record<string, unknown>) {
    const ff = f as { emailSearch?: string; statusFilter?: string; priorityFilter?: string; dateFrom?: string; dateTo?: string; showDateTo?: boolean; fieldSearches?: Record<string, string> };
    if (ff.emailSearch !== undefined) setEmailSearch(ff.emailSearch);
    if (ff.statusFilter !== undefined) setStatusFilter(ff.statusFilter);
    if (ff.priorityFilter !== undefined) setPriorityFilter(ff.priorityFilter);
    if (ff.dateFrom !== undefined) setDateFrom(ff.dateFrom);
    if (ff.dateTo !== undefined) setDateTo(ff.dateTo);
    if (ff.showDateTo !== undefined) setShowDateTo(ff.showDateTo);
    if (ff.fieldSearches !== undefined) setFieldSearches(ff.fieldSearches);
  }

  async function saveView() {
    if (!viewName.trim()) return;
    setSavingView(true);
    try {
      const res = await fetch("/api/admin/saved-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: viewName.trim(), filters: serializeFilters() }),
      });
      if (res.ok) {
        const view = await res.json();
        setSavedViews(prev => [...prev, view]);
        setShowSaveModal(false);
        setViewName("");
      }
    } finally {
      setSavingView(false);
    }
  }

  async function deleteView(id: string) {
    await fetch(`/api/admin/saved-filters/${id}`, { method: "DELETE" });
    setSavedViews(prev => prev.filter(v => v.id !== id));
  }

  function resetFilters() {
    setEmailSearch("");
    setStatusFilter("");
    setPriorityFilter("");
    setDateFrom("");
    setDateTo("");
    setShowDateTo(false);
    setMySubmissionsOnly(false);
    setFieldSearches({});
  }

  // Build export body with current filters and POST (CSRF-safe, no token in URL)
  async function handleExport(format: "csv" | "json") {
    setExporting(true);
    setExportError("");
    try {
      const res = await fetch("/api/admin/submissions/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          formInstanceId: formInstanceId ?? undefined,
          search: emailSearch || undefined,
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
          from: dateFrom || undefined,
          to: (dateTo && showDateTo) ? dateTo : undefined,
          assignedToMe: mySubmissionsOnly || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setExportError(data.error ?? f.exportError);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      a.download = `submissions_${timestamp}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(f.exportNetworkError);
    } finally {
      setExporting(false);
    }
  }

  const serverFilters: SubmissionServerFilters = {
    search: emailSearch,
    status: statusFilter,
    priority: priorityFilter,
    dateFrom,
    dateTo,
    showDateTo,
    assignedToMe: mySubmissionsOnly,
    fieldSearches,
  };

  // Status options
  const statusOptions = customStatuses && customStatuses.length > 0
    ? customStatuses
    : Object.entries(statusLabels).map(([value, label]) => ({ value, label, color: "" }));

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border">

        {/* ── Filters ── */}
        {(() => {
          const BUILTIN = new Set(["email", "status", "priority", "submittedAt", "dateEcheance"]);
          const allStepFields = (formSteps ?? []).flatMap(s => s.fields).filter(fld => fld.type !== "section_header");
          // If searchFields configured, use it; otherwise default to email+status+priority + all step fields
          const activeKeys: string[] = searchFields
            ? searchFields
            : ["email", "status", "priority", ...allStepFields.map(fld => fld.dbKey ?? fld.id)];
          const activeSet = new Set(activeKeys);
          const labelMap: Record<string, string> = {};
          allStepFields.forEach(fld => { labelMap[fld.dbKey ?? fld.id] = fld.label; });
          const customKeys = activeKeys.filter(k => !BUILTIN.has(k));
          return (
        <div className="px-4 pt-4 pb-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{f.title}</p>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end flex-wrap">

            {/* Email search */}
            {activeSet.has("email") && (
            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <label className="text-xs text-muted-foreground">{f.emailLabel}</label>
              <input
                type="text"
                value={emailSearch}
                onChange={e => setEmailSearch(e.target.value)}
                placeholder={f.emailPlaceholder}
                autoComplete="off"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
              />
            </div>
            )}

            {/* Status filter */}
            {activeSet.has("status") && (
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs text-muted-foreground">{f.statusLabel}</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
              >
                <option value="">{f.allStatuses}</option>
                {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            )}

            {/* Priority filter */}
            {activeSet.has("priority") && (
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-xs text-muted-foreground">{f.priorityLabel}</label>
              <select
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
              >
                <option value="">{f.allPriorities}</option>
                {Object.entries(priorityLabels).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
              </select>
            </div>
            )}

            {/* Custom form field filters */}
            {(() => {
              return customKeys.map(key => {
                const field = allStepFields.find(f => (f.dbKey ?? f.id) === key);
                const label = labelMap[key] ?? key;
                if (field?.options && field.options.length > 0) {
                  return (
                    <div key={key} className="flex flex-col gap-1 min-w-[140px]">
                      <label className="text-xs text-muted-foreground">{label}</label>
                      <select value={fieldSearches[key] ?? ""} onChange={e => setFieldSearches(prev => ({ ...prev, [key]: e.target.value }))}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
                        <option value="">Tous</option>
                        {field.options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                  );
                }
                return (
                  <div key={key} className="flex flex-col gap-1 flex-1 min-w-[150px]">
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <input type="text" value={fieldSearches[key] ?? ""}
                      onChange={e => setFieldSearches(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder="Filtrer…"
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50" />
                  </div>
                );
              });
            })()}
          </div>
        </div>
          );
        })()}

        {/* ── Date de soumission ── */}
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{f.dateLabel}</p>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{showDateTo ? f.fromLabel : f.singleDateLabel}</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50" />
            </div>

            {showDateTo ? (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">{f.toLabel}</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    min={dateFrom || undefined}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50" />
                </div>
                <button onClick={() => { setShowDateTo(false); setDateTo(""); }}
                  className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer whitespace-nowrap">
                  {f.removeRange}
                </button>
              </>
            ) : (
              <button onClick={() => setShowDateTo(true)}
                className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer whitespace-nowrap">
                {f.addRange}
              </button>
            )}

            <div className="ml-auto flex items-center gap-2">
              {/* Saved views */}
              <div className="relative">
                <button
                  onClick={() => setShowViewsDropdown(v => !v)}
                  className="h-9 px-3 text-xs border border-border rounded-md bg-background hover:bg-accent flex items-center gap-1.5 cursor-pointer"
                >
                  {f.savedViews} {savedViews.length > 0 && <span className="text-primary font-medium">({savedViews.length})</span>}
                </button>
                {showViewsDropdown && (
                  <div className="absolute top-full mt-1 right-0 bg-card border border-border rounded-lg shadow-lg z-20 min-w-[180px] overflow-hidden">
                    {savedViews.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-3 py-2">{f.noSavedViews}</p>
                    ) : (
                      savedViews.map(v => (
                        <div key={v.id} className="flex items-center justify-between px-3 py-2 hover:bg-accent group">
                          <button
                            onMouseDown={() => { applyFilters(v.filters as Record<string, unknown>); setShowViewsDropdown(false); }}
                            className="text-sm text-foreground flex-1 text-left cursor-pointer"
                          >
                            {v.name}
                          </button>
                          <button
                            onMouseDown={() => deleteView(v.id)}
                            className="text-xs text-muted-foreground hover:text-destructive ml-2 opacity-0 group-hover:opacity-100 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                    <div className="border-t border-border">
                      <button
                        onMouseDown={() => { setShowViewsDropdown(false); setShowSaveModal(true); }}
                        className="w-full text-left text-xs text-primary px-3 py-2 hover:bg-accent cursor-pointer"
                      >
                        {f.saveCurrentView}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button onClick={resetFilters} className="h-9 px-3 text-xs text-primary hover:text-primary/80 font-medium cursor-pointer whitespace-nowrap">
                {f.reset}
              </button>
            </div>
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="px-4 py-2.5 border-t border-border/50 bg-muted/20 rounded-b-xl flex items-center gap-4 flex-wrap">
          {currentUserEmail && (
            <button
              onClick={() => setMySubmissionsOnly(v => !v)}
              className={`text-xs font-medium px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                mySubmissionsOnly
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.mySubmissions}
            </button>
          )}

          {exportError && (
            <p className="text-xs text-red-600 dark:text-red-400 max-w-xs">{exportError}</p>
          )}

          {/* Export dropdown */}
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(v => !v)}
                disabled={exporting}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors disabled:opacity-50"
                title={f.export}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {exporting ? "…" : f.export}
              </button>
              {showExportMenu && (
                <div className="absolute bottom-full right-0 mb-1 bg-card border border-border rounded-lg shadow-lg z-20 overflow-hidden">
                  <button
                    onClick={() => { handleExport("csv"); setShowExportMenu(false); }}
                    className="block w-full text-left text-xs px-4 py-2 hover:bg-accent cursor-pointer whitespace-nowrap"
                  >
                    CSV
                  </button>
                  <button
                    onClick={() => { handleExport("json"); setShowExportMenu(false); }}
                    className="block w-full text-left text-xs px-4 py-2 hover:bg-accent cursor-pointer whitespace-nowrap"
                  >
                    JSON
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <SubmissionsTable
        formInstanceId={formInstanceId}
        serverFilters={serverFilters}
        formConfig={formConfig}
        formSteps={formSteps}
        customStatuses={customStatuses}
      />

      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-base font-semibold">{f.saveView}</h3>
            <input
              type="text"
              value={viewName}
              onChange={e => setViewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveView()}
              placeholder={f.viewNamePlaceholder}
              autoFocus
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSaveModal(false)} className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground cursor-pointer">{f.cancel}</button>
              <button onClick={saveView} disabled={savingView || !viewName.trim()} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer">
                {savingView ? "…" : f.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Legacy client-side filter panel (for external data sources)
// ─────────────────────────────────────────────────────────

interface DashboardFiltersClientProps {
  submissions: Submission[];
  formConfig?: FormConfig;
  formSteps?: StepDef[];
  searchFields?: string[];
  isExternalSource?: boolean;
  hiddenColumns?: string[];
  customStatuses?: CustomStatus[];
  currentUserEmail?: string;
}

function DashboardFiltersClient({ submissions: initialSubmissions, formConfig, formSteps, searchFields, isExternalSource, hiddenColumns, customStatuses, currentUserEmail }: DashboardFiltersClientProps) {
  const thresholds = usePrioritySettings();
  const tr = useTranslations();
  const f = tr.admin.filters;
  const statusLabels: Record<string, string> = {
    pending: tr.status.pending, in_progress: tr.status.in_progress,
    done: tr.status.done, waiting_user: tr.status.waiting_user,
  };
  const priorityLabels: Record<string, string> = {
    none: tr.priority.none_filter, green: tr.priority.green,
    yellow: tr.priority.yellow, orange: tr.priority.orange, red: tr.priority.red,
  };
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions);

  const activeSearchFields = useMemo(() => {
    if (isExternalSource) {
      const sample = initialSubmissions[0]?.formData as Record<string, unknown> | undefined;
      if (!sample) return [];
      return Object.keys(sample).filter(k => !SKIP_FIELD_KEYS.has(k) && !k.endsWith("_id"));
    }
    // Build the full list from formSteps (ground truth)
    const fromSteps: string[] = [];
    if (formSteps && formSteps.length > 0) {
      fromSteps.push("email");
      for (const step of formSteps) {
        for (const field of step.fields) {
          if (field.type === "section_header") continue;
          const source = field.dbKey ?? field.id;
          if (source !== "email") fromSteps.push(source);
        }
      }
    }
    if (searchFields && searchFields.length > 0) {
      // Merge: keep configured order, append any formStep fields not yet configured
      const extra = fromSteps.filter(k => !searchFields.includes(k));
      return [...searchFields, ...extra];
    }
    if (fromSteps.length > 0) return fromSteps;
    const cols = formConfig?.admin.tableColumns ?? [];
    const derived = cols.filter(c => !c.hidden && c.source && c.source !== "__custom__").map(c => c.source);
    return derived.length > 0 ? derived : [];
  }, [isExternalSource, searchFields, formSteps, formConfig, initialSubmissions]);

  const [emailSearch, setEmailSearch] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [emailPage, setEmailPage] = useState(1);
  const [fieldSearches, setFieldSearches] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDateTo, setShowDateTo] = useState(false);
  const [savedViews, setSavedViews] = useState<Array<{ id: string; name: string; filters: unknown }>>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [viewName, setViewName] = useState("");
  const [savingView, setSavingView] = useState(false);
  const [showViewsDropdown, setShowViewsDropdown] = useState(false);
  const [mySubmissionsOnly, setMySubmissionsOnly] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          emailInputRef.current && !emailInputRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    fetch("/api/admin/saved-filters")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSavedViews(data); })
      .catch(() => {});
  }, []);

  function serializeFilters() {
    return { emailSearch, fieldSearches, dateFrom, dateTo, showDateTo };
  }

  function applyFilters(f: Record<string, unknown>) {
    const ff = f as { emailSearch?: string; fieldSearches?: Record<string, string>; dateFrom?: string; dateTo?: string; showDateTo?: boolean };
    if (ff.emailSearch !== undefined) setEmailSearch(ff.emailSearch);
    if (ff.fieldSearches) setFieldSearches(ff.fieldSearches);
    if (ff.dateFrom !== undefined) setDateFrom(ff.dateFrom);
    if (ff.dateTo !== undefined) setDateTo(ff.dateTo);
    if (ff.showDateTo !== undefined) setShowDateTo(ff.showDateTo);
  }

  async function saveView() {
    if (!viewName.trim()) return;
    setSavingView(true);
    try {
      const res = await fetch("/api/admin/saved-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: viewName.trim(), filters: serializeFilters() }),
      });
      if (res.ok) {
        const view = await res.json();
        setSavedViews(prev => [...prev, view]);
        setShowSaveModal(false);
        setViewName("");
      }
    } finally {
      setSavingView(false);
    }
  }

  async function deleteView(id: string) {
    await fetch(`/api/admin/saved-filters/${id}`, { method: "DELETE" });
    setSavedViews(prev => prev.filter(v => v.id !== id));
  }

  const fieldLabelMap = useMemo(() => {
    const map: Record<string, string> = {
      email: tr.admin.table.columns.email,
      status: tr.admin.table.columns.status,
      priority: tr.admin.table.columns.priority,
      dateEcheance: tr.admin.table.columns.echeance,
      submittedAt: tr.admin.table.columns.submittedAt,
    };
    if (isExternalSource) {
      const sample = initialSubmissions[0]?.formData as Record<string, unknown> | undefined;
      if (sample) Object.keys(sample).forEach(k => { map[k] = formatFieldKey(k); });
    } else if (formSteps) {
      formSteps.flatMap(s => s.fields).forEach(f => { map[f.dbKey ?? f.id] = f.label; });
    }
    return map;
  }, [isExternalSource, formSteps, initialSubmissions]);

  const allEmails = useMemo(() => [...new Set(submissions.map(s => s.email).filter((e): e is string => e != null))].sort((a, b) => a.localeCompare(b)), [submissions]);
  const suggestedEmails = useMemo(() => {
    if (!emailSearch.trim() || selectedEmail) return [];
    const q = emailSearch.toLowerCase();
    return allEmails.filter(e => e.toLowerCase().startsWith(q));
  }, [allEmails, emailSearch, selectedEmail]);

  const emailSubmissions = useMemo(() => selectedEmail ? submissions.filter(s => s.email === selectedEmail) : [], [submissions, selectedEmail]);
  const emailTotalPages = Math.max(1, Math.ceil(emailSubmissions.length / PAGE_SIZE));
  const emailPaginated = emailSubmissions.slice((emailPage - 1) * PAGE_SIZE, emailPage * PAGE_SIZE);

  const allFormFields = useMemo(() => (formSteps ?? []).flatMap(s => s.fields), [formSteps]);

  const externalFieldOptions = useMemo(() => {
    if (!isExternalSource) return {} as Record<string, string[]>;
    const map: Record<string, string[]> = {};
    const sample = submissions.slice(0, 300);
    for (const sub of sample) {
      const fd = sub.formData as Record<string, unknown>;
      if (!fd) continue;
      for (const [k, v] of Object.entries(fd)) {
        if (v == null || v === "") continue;
        const str = String(v);
        if (!map[k]) map[k] = [];
        if (!map[k].includes(str)) map[k].push(str);
      }
    }
    return map;
  }, [isExternalSource, submissions]);

  function resolveFieldValue(source: string, sub: Submission): string {
    const fd = sub.formData as Record<string, string>;
    const raw = fd?.[source] ?? "";
    const field = allFormFields.find(f => (f.dbKey ?? f.id) === source);
    if (field?.options) {
      const opt = field.options.find(o => o.value === raw);
      if (opt) return opt.label;
    }
    return raw;
  }

  function getFieldInputType(source: string): "text" | "date" | "select" | "email-autocomplete" | "status-select" | "priority-select" | "dynamic-select" {
    if (source === "email") return "email-autocomplete";
    if (source === "status") return "status-select";
    if (source === "priority") return "priority-select";
    if (source === "dateEcheance") return "date";
    if (isExternalSource) {
      if (DATE_KEY_RE.test(source)) return "date";
      const unique = externalFieldOptions[source];
      if (unique && unique.length > 0 && unique.length <= 15) return "dynamic-select";
      return "text";
    }
    const field = allFormFields.find(f => (f.dbKey ?? f.id) === source);
    if (field?.type === "date") return "date";
    if (field?.options && field.options.length > 0) return "select";
    return "text";
  }

  const filtered = useMemo(() => {
    if (selectedEmail) return emailSubmissions;
    return submissions.filter(sub => {
      if (activeSearchFields.includes("email") && emailSearch) {
        if (!(sub.email ?? "").toLowerCase().includes(emailSearch.toLowerCase())) return false;
      }
      if (dateFrom) {
        const d = toDateString(new Date(sub.submittedAt));
        if (!showDateTo || !dateTo) {
          if (d !== dateFrom) return false;
        } else {
          if (d < dateFrom || d > dateTo) return false;
        }
      }
      for (const [source, query] of Object.entries(fieldSearches)) {
        if (!query) continue;
        const q = query.toLowerCase();
        if (source === "status") {
          if (!(sub.status ?? "").toLowerCase().includes(q) &&
              !(statusLabels[sub.status ?? ""] ?? "").toLowerCase().includes(q)) return false;
        } else if (source === "priority") {
          if (!(sub.priority ?? "").toLowerCase().includes(q) &&
              !(priorityLabels[sub.priority ?? "none"] ?? "").toLowerCase().includes(q)) return false;
        } else if (source === "dateEcheance") {
          if ((sub.dateEcheance ?? "") !== query) return false;
        } else {
          const fd = sub.formData as Record<string, unknown>;
          if (isExternalSource) {
            const inputType = getFieldInputType(source);
            if (inputType === "date") {
              if (!String(fd?.[source] ?? "").startsWith(query)) return false;
            } else if (inputType === "dynamic-select") {
              if (String(fd?.[source] ?? "") !== query) return false;
            } else {
              if (!String(fd?.[source] ?? "").toLowerCase().includes(q)) return false;
            }
          } else {
            const field = allFormFields.find(f => (f.dbKey ?? f.id) === source);
            if (field?.type === "date") {
              const val = (fd as Record<string, string>)?.[source] ?? "";
              if (val !== query) return false;
            } else if (field?.options) {
              const val = (fd as Record<string, string>)?.[source] ?? "";
              if (val !== query) return false;
            } else {
              const val = resolveFieldValue(source, sub).toLowerCase();
              if (!val.includes(q)) return false;
            }
          }
        }
      }
      if (mySubmissionsOnly && currentUserEmail) {
        if ((sub as { assignedToEmail?: string | null }).assignedToEmail !== currentUserEmail) return false;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, emailSearch, selectedEmail, emailSubmissions, dateFrom, dateTo, fieldSearches, activeSearchFields, mySubmissionsOnly, currentUserEmail]);

  const todayStr = toDateString(new Date());
  const filteredStats = useMemo(() => ({
    overdue: filtered.filter(s => s.dateEcheance && s.dateEcheance < todayStr && s.status !== "done").length,
    done:    filtered.filter(s => s.status === "done").length,
    urgent:  filtered.filter(s => {
      const p = s.priority && s.priority !== "none" ? s.priority : calcAutoPriority(s.dateEcheance, thresholds).priority;
      return p === "red" && s.status !== "done";
    }).length,
  }), [filtered, todayStr, thresholds]);

  function handleUpdate(updated: Submission) {
    setSubmissions(prev => prev.map(s => s.id === updated.id ? updated : s));
  }
  function selectEmail(email: string) { setSelectedEmail(email); setEmailSearch(email); setEmailPage(1); setDropdownOpen(false); }
  function clearEmail() { setSelectedEmail(null); setEmailSearch(""); setEmailPage(1); }
  function resetFilters() {
    clearEmail();
    setFieldSearches({});
    setDateFrom(""); setDateTo(""); setShowDateTo(false);
    setMySubmissionsOnly(false);
  }

  function exportCsv() {
    const headerKeys: string[] = ["email"];
    const headerLabels: string[] = ["Email"];
    if (formSteps && formSteps.length > 0) {
      for (const step of formSteps) {
        for (const field of step.fields) {
          if (field.type === "section_header") continue;
          const key = field.dbKey ?? field.id;
          if (key === "email") continue;
          headerKeys.push(key); headerLabels.push(field.label);
        }
      }
    } else if (isExternalSource) {
      const sample = filtered[0]?.formData as Record<string, unknown> | undefined;
      if (sample) {
        Object.keys(sample).forEach(k => {
          if (k !== "email") { headerKeys.push(k); headerLabels.push(fieldLabelMap[k] ?? k); }
        });
      }
    }
    headerKeys.push("status", "priority", "dateEcheance", "submittedAt");
    headerLabels.push(tr.admin.table.columns.status, tr.admin.table.columns.priority, tr.admin.table.columns.echeance, tr.admin.table.columns.submittedAt);
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = filtered.map(sub => {
      const fd = sub.formData as Record<string, string | null>;
      return headerKeys.map(key => {
        if (key === "email") return escape(sub.email ?? "");
        if (key === "status") return escape(statusLabels[sub.status ?? ""] ?? sub.status ?? "");
        if (key === "priority") return escape(priorityLabels[sub.priority ?? "none"] ?? "");
        if (key === "dateEcheance") return escape(sub.dateEcheance ?? "");
        if (key === "submittedAt") return escape(new Date(sub.submittedAt).toLocaleString());
        return escape(String(fd?.[key] ?? ""));
      }).join(",");
    });
    const csv = [headerLabels.map(escape).join(","), ...rows].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `submissions_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (selectedEmail) {
    return (
      <div className="space-y-4">
        <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3 flex-wrap">
          <button onClick={clearEmail} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            {f.back}
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm text-muted-foreground">{f.submissionsOf}</span>
            <span className="text-sm font-semibold text-foreground truncate">{selectedEmail}</span>
          </div>
          <span className="text-xs text-muted-foreground">{emailSubmissions.length > 1 ? f.submissionCount_other.replace("{count}", String(emailSubmissions.length)) : f.submissionCount_one.replace("{count}", String(emailSubmissions.length))}</span>
        </div>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <EmailSubmissionsList submissions={emailPaginated} onUpdate={handleUpdate} formConfig={formConfig} formSteps={formSteps} />
          </div>
          {emailTotalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">Page {emailPage} / {emailTotalPages}</p>
              <div className="flex gap-2">
                <Pager onClick={() => setEmailPage(p => Math.max(1, p - 1))} disabled={emailPage === 1}>←</Pager>
                <Pager onClick={() => setEmailPage(p => Math.min(emailTotalPages, p + 1))} disabled={emailPage === emailTotalPages}>→</Pager>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const businessFields = activeSearchFields.filter(s => s !== "submittedAt");

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border">

        {businessFields.length > 0 && (
          <div className="px-4 pt-4 pb-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filtres</p>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end flex-wrap">
              {businessFields.map(source => {
                const inputType = getFieldInputType(source);
                const label = fieldLabelMap[source] ?? source;
                const field = allFormFields.find(f => (f.dbKey ?? f.id) === source);

                if (inputType === "email-autocomplete") return (
                  <div key={source} className="flex flex-col gap-1 flex-1 min-w-[180px] relative">
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <input ref={emailInputRef} type="text" value={emailSearch}
                      onChange={e => { setEmailSearch(e.target.value); setDropdownOpen(true); }}
                      onFocus={() => emailSearch && setDropdownOpen(true)}
                      placeholder="Filtrer par email…" autoComplete="off"
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50" />
                    {dropdownOpen && suggestedEmails.length > 0 && (
                      <div ref={dropdownRef} className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-20 overflow-hidden max-h-56 overflow-y-auto">
                        {suggestedEmails.map(email => {
                          const count = submissions.filter(s => s.email === email).length;
                          return (
                            <button key={email} onMouseDown={e => { e.preventDefault(); selectEmail(email); }}
                              className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-accent cursor-pointer transition-colors">
                              <span>
                                <span className="font-medium text-primary">{email.slice(0, emailSearch.length)}</span>
                                <span className="text-foreground">{email.slice(emailSearch.length)}</span>
                              </span>
                              <span className="text-xs text-muted-foreground ml-3 shrink-0">{count} soumission{count > 1 ? "s" : ""}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );

                if (inputType === "status-select") return (
                  <div key={source} className="flex flex-col gap-1 min-w-[140px]">
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <select value={fieldSearches["status"] ?? ""} onChange={e => setFieldSearches(prev => ({ ...prev, status: e.target.value }))}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
                      <option value="">{f.allStatuses}</option>
                      {customStatuses && customStatuses.length > 0
                        ? customStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)
                        : Object.entries(statusLabels).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                    </select>
                  </div>
                );

                if (inputType === "priority-select") return (
                  <div key={source} className="flex flex-col gap-1 min-w-[130px]">
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <select value={fieldSearches["priority"] ?? ""} onChange={e => setFieldSearches(prev => ({ ...prev, priority: e.target.value }))}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
                      <option value="">{f.allPriorities}</option>
                      {Object.entries(priorityLabels).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                    </select>
                  </div>
                );

                if (inputType === "date") return (
                  <div key={source} className="flex flex-col gap-1 min-w-[150px]">
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <input type="date" value={fieldSearches[source] ?? ""}
                      onChange={e => setFieldSearches(prev => ({ ...prev, [source]: e.target.value }))}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50" />
                  </div>
                );

                if (inputType === "select" && field?.options) return (
                  <div key={source} className="flex flex-col gap-1 min-w-[140px]">
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <select value={fieldSearches[source] ?? ""} onChange={e => setFieldSearches(prev => ({ ...prev, [source]: e.target.value }))}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
                      <option value="">Tous</option>
                      {field.options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                );

                if (inputType === "dynamic-select") {
                  const options = (externalFieldOptions[source] ?? []).slice().sort();
                  return (
                    <div key={source} className="flex flex-col gap-1 min-w-[140px]">
                      <label className="text-xs text-muted-foreground">{label}</label>
                      <select value={fieldSearches[source] ?? ""} onChange={e => setFieldSearches(prev => ({ ...prev, [source]: e.target.value }))}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
                        <option value="">Tous</option>
                        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  );
                }

                return (
                  <div key={source} className="flex flex-col gap-1 flex-1 min-w-[150px]">
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <input type="text" value={fieldSearches[source] ?? ""}
                      onChange={e => setFieldSearches(prev => ({ ...prev, [source]: e.target.value }))}
                      placeholder="Filtrer…"
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className={businessFields.length > 0 ? "border-t border-border px-4 py-3" : "px-4 py-3"}>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{f.dateLabel}</p>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{showDateTo ? f.fromLabel : f.singleDateLabel}</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50" />
            </div>
            {showDateTo ? (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">{f.toLabel}</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    min={dateFrom || undefined}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50" />
                </div>
                <button onClick={() => { setShowDateTo(false); setDateTo(""); }}
                  className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer whitespace-nowrap">{f.removeRange}</button>
              </>
            ) : (
              <button onClick={() => setShowDateTo(true)}
                className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer whitespace-nowrap">{f.addRange}</button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <button onClick={() => setShowViewsDropdown(v => !v)}
                  className="h-9 px-3 text-xs border border-border rounded-md bg-background hover:bg-accent flex items-center gap-1.5 cursor-pointer">
                  {f.savedViews} {savedViews.length > 0 && <span className="text-primary font-medium">({savedViews.length})</span>}
                </button>
                {showViewsDropdown && (
                  <div className="absolute top-full mt-1 right-0 bg-card border border-border rounded-lg shadow-lg z-20 min-w-[180px] overflow-hidden">
                    {savedViews.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-3 py-2">{f.noSavedViews}</p>
                    ) : savedViews.map(v => (
                      <div key={v.id} className="flex items-center justify-between px-3 py-2 hover:bg-accent group">
                        <button onMouseDown={() => { applyFilters(v.filters as Record<string, unknown>); setShowViewsDropdown(false); }}
                          className="text-sm text-foreground flex-1 text-left cursor-pointer">{v.name}</button>
                        <button onMouseDown={() => deleteView(v.id)}
                          className="text-xs text-muted-foreground hover:text-destructive ml-2 opacity-0 group-hover:opacity-100 cursor-pointer">✕</button>
                      </div>
                    ))}
                    <div className="border-t border-border">
                      <button onMouseDown={() => { setShowViewsDropdown(false); setShowSaveModal(true); }}
                        className="w-full text-left text-xs text-primary px-3 py-2 hover:bg-accent cursor-pointer">
                        {f.saveCurrentView}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={resetFilters} className="h-9 px-3 text-xs text-primary hover:text-primary/80 font-medium cursor-pointer whitespace-nowrap">
                {f.reset}
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 py-2.5 border-t border-border/50 bg-muted/20 rounded-b-xl flex items-center gap-4 flex-wrap">
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{filtered.length}</span> soumission{filtered.length > 1 ? "s" : ""}
            {emailSearch && <span className="ml-1">pour <span className="text-foreground font-medium">{emailSearch}</span></span>}
          </span>
          {currentUserEmail && (
            <button onClick={() => setMySubmissionsOnly(v => !v)}
              className={`text-xs font-medium px-2 py-0.5 rounded-full cursor-pointer transition-colors ${mySubmissionsOnly ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {f.mySubmissions}
            </button>
          )}
          {filteredStats.overdue > 0 && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />{filteredStats.overdue > 1 ? f.statOverdue_other.replace("{n}", String(filteredStats.overdue)) : f.statOverdue_one.replace("{n}", String(filteredStats.overdue))}
            </span>
          )}
          {filteredStats.urgent > 0 && (
            <span className="text-xs font-medium text-orange-600 dark:text-orange-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />{filteredStats.urgent > 1 ? f.statUrgent_other.replace("{n}", String(filteredStats.urgent)) : f.statUrgent_one.replace("{n}", String(filteredStats.urgent))}
            </span>
          )}
          {filteredStats.done > 0 && (
            <span className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />{filteredStats.done > 1 ? f.statDone_other.replace("{n}", String(filteredStats.done)) : f.statDone_one.replace("{n}", String(filteredStats.done))}
            </span>
          )}
          {filtered.length > 0 && !isExternalSource && (
            <button onClick={exportCsv}
              className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors" title={f.export}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {f.export} CSV
            </button>
          )}
        </div>
      </div>

      <SubmissionsTable
        submissions={filtered}
        onUpdate={handleUpdate}
        onDelete={(ids) => setSubmissions(prev => prev.filter(s => !ids.includes(s.id)))}
        formConfig={formConfig}
        formSteps={formSteps}
        isExternalSource={isExternalSource}
        hiddenColumns={hiddenColumns}
        customStatuses={customStatuses}
      />

      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-base font-semibold">{f.saveView}</h3>
            <input type="text" value={viewName} onChange={e => setViewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveView()}
              placeholder={f.viewNamePlaceholder} autoFocus
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSaveModal(false)} className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground cursor-pointer">{f.cancel}</button>
              <button onClick={saveView} disabled={savingView || !viewName.trim()} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer">
                {savingView ? "…" : f.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function EmailSubmissionsList({ submissions, onUpdate, formConfig, formSteps }: {
  submissions: Submission[];
  onUpdate: (updated: Submission) => void;
  formConfig?: FormConfig;
  formSteps?: StepDef[];
}) {
  const thresholds = usePrioritySettings();
  const tr = useTranslations();
  const statusLabels: Record<string, string> = {
    pending: tr.status.pending,
    in_progress: tr.status.in_progress,
    done: tr.status.done,
    waiting_user: tr.status.waiting_user,
  };
  const [selected, setSelected] = useState<Submission | null>(null);

  function handleSaved(updated: Submission) {
    if (selected?.id === updated.id) setSelected(updated);
    onUpdate(updated);
  }

  if (submissions.length === 0)
    return <p className="text-sm text-muted-foreground text-center py-12">{tr.admin.table.noSubmissionsForEmail}</p>;

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-border">
            <th className="px-4 py-3 font-medium text-muted-foreground">{tr.admin.table.columns.type}</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">{tr.admin.table.columns.status}</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">{tr.admin.table.columns.echeance}</th>
            <th className="px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">{tr.admin.table.columns.submittedAt}</th>
          </tr>
        </thead>
        <tbody>
          {submissions.map(sub => {
            const fd = sub.formData as Record<string, string>;
            const autoInfo = calcAutoPriority(sub.dateEcheance, thresholds);
            let typeLabel = fd?.requestType ?? "—";
            if (formSteps) {
              const allFields = formSteps.flatMap(s => s.fields);
              const field = allFields.find(f => (f.dbKey ?? f.id) === "requestType");
              const opt = field?.options?.find(o => o.value === typeLabel);
              if (opt) typeLabel = opt.label;
            }
            return (
              <tr key={sub.id} onClick={() => setSelected(sub)} className="border-b border-border/50 last:border-0 hover:bg-muted/40 cursor-pointer transition-colors">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">{typeLabel}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{statusLabels[sub.status ?? "pending"] ?? sub.status}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {sub.dateEcheance ? (
                    <span className="flex items-center gap-1.5">
                      {sub.dateEcheance}
                      {autoInfo.label && sub.priority === "none" && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          autoInfo.priority === "red" ? "bg-red-50 text-red-700" :
                          autoInfo.priority === "orange" ? "bg-orange-50 text-orange-700" :
                          autoInfo.priority === "yellow" ? "bg-yellow-50 text-yellow-700" :
                          "bg-green-50 text-green-700"}`}>{autoInfo.label}</span>
                      )}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                  {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(sub.submittedAt))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selected && <SubmissionDetail submission={selected} onClose={() => setSelected(null)} onSaved={handleSaved} formConfig={formConfig} formSteps={formSteps} />}
    </>
  );
}

function Pager({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-8 h-8 flex items-center justify-center rounded-lg text-sm border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
      {children}
    </button>
  );
}
