"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { Submission } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { SubmissionDetail } from "./SubmissionDetail";
import { calcAutoPriority } from "@/lib/utils/priority";
import { usePrioritySettings } from "@/lib/context/PrioritySettingsContext";
import { useUserRole } from "@/lib/context/UserRoleContext";
import { useTranslations } from "@/lib/context/LocaleContext";
import type { SubmissionPriority, FormConfig, TableColumnDef, StepDef, SubmissionStatus } from "@/types/config";

const PRIORITY_COLORS: Record<SubmissionPriority, string> = {
  none: "bg-gray-200",
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  orange: "bg-orange-500",
  red: "bg-red-500",
};

const SERVER_PAGE_SIZE = 25;
const CLIENT_PAGE_SIZE = 10;

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(date));
}

function formatFieldKey(key: string): string {
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const SKIP_KEYS_TABLE = new Set(["id"]);
const DATE_KEY_RE_TABLE = /date|_at$|timestamp/i;

// Fallback columns — labels are overridden at runtime by useTranslations
const DEFAULT_COLUMNS: TableColumnDef[] = [
  { id: "c-email",     label: "Email",     source: "email" },
  { id: "c-type",      label: "Type",      source: "requestType" },
  { id: "c-status",    label: "Status",    source: "status" },
  { id: "c-echeance",  label: "Due date",  source: "dateEcheance" },
  { id: "c-submitted", label: "Submitted", source: "submittedAt" },
];

interface CustomStatus {
  value: string;
  label: string;
  color: string;
}

/** Filter state passed from DashboardFilters when using server-side mode */
export interface SubmissionServerFilters {
  search: string;
  status: string;
  priority: string;
  dateFrom: string;
  dateTo: string;
  showDateTo: boolean;
  assignedToMe: boolean;
  /** Custom form field searches: { fieldKey: searchValue } */
  fieldSearches?: Record<string, string>;
}

interface SubmissionsTableProps {
  // ── Server-side mode: formInstanceId + serverFilters ──
  formInstanceId?: string;
  serverFilters?: SubmissionServerFilters;
  // ── Client-side mode: pass submissions directly (external sources) ──
  submissions?: Submission[];
  onUpdate?: (updated: Submission) => void;
  onDelete?: (ids: string[]) => void;
  // ── Common ──
  formConfig?: FormConfig;
  formSteps?: StepDef[];
  isExternalSource?: boolean;
  hiddenColumns?: string[];
  customStatuses?: CustomStatus[];
}

function SortableHeader({ col, sortKey, sortDir, onSort }: {
  col: TableColumnDef; sortKey: string; sortDir: "asc" | "desc"; onSort: (key: string) => void;
}) {
  const isActive = sortKey === col.source;
  return (
    <th
      key={col.id}
      onClick={() => onSort(col.source)}
      className="pb-3 font-medium text-muted-foreground pr-4 cursor-pointer hover:text-foreground select-none whitespace-nowrap"
    >
      <span className="inline-flex items-center gap-1">
        {col.label}
        <span className="text-xs opacity-50">
          {isActive ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </span>
    </th>
  );
}

export function SubmissionsTable({
  formInstanceId,
  serverFilters,
  submissions: clientSubmissions,
  onUpdate,
  onDelete,
  formConfig,
  formSteps,
  isExternalSource,
  hiddenColumns,
  customStatuses,
}: SubmissionsTableProps) {
  const thresholds = usePrioritySettings();
  const role = useUserRole();
  const canBulk = role !== "viewer";
  const tr = useTranslations();
  const STATUS_LABELS: Record<string, string> = {
    pending: tr.status.pending, in_progress: tr.status.in_progress,
    done: tr.status.done, waiting_user: tr.status.waiting_user,
  };
  const STATUS_OPTIONS: { value: SubmissionStatus; label: string }[] = [
    { value: "pending", label: tr.status.pending },
    { value: "in_progress", label: tr.status.in_progress },
    { value: "done", label: tr.status.done },
    { value: "waiting_user", label: tr.status.waiting_user },
  ];
  const PRIORITY_OPTIONS: { value: SubmissionPriority; label: string }[] = [
    { value: "none", label: tr.priority.none },
    { value: "green", label: tr.priority.green },
    { value: "yellow", label: tr.priority.yellow },
    { value: "orange", label: tr.priority.orange },
    { value: "red", label: tr.priority.red },
  ];

  // Determine mode
  const isServerMode = !clientSubmissions;

  // ── Server-side state ──
  const [serverRows, setServerRows] = useState<Submission[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverPages, setServerPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // ── Shared state ──
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string>("submittedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [bulkStatus, setBulkStatus] = useState<SubmissionStatus | "">("");
  const [bulkPriority, setBulkPriority] = useState<SubmissionPriority | "">("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [allPagesSelected, setAllPagesSelected] = useState(false);

  // ── Server fetch ──
  const fetchKey = useMemo(() => {
    if (!isServerMode) return null;
    const p = new URLSearchParams();
    if (formInstanceId) p.set("formInstanceId", formInstanceId);
    p.set("page", String(page));
    p.set("limit", String(SERVER_PAGE_SIZE));
    p.set("sort", sortKey);
    p.set("dir", sortDir);
    if (serverFilters?.search) p.set("search", serverFilters.search);
    if (serverFilters?.status) p.set("status", serverFilters.status);
    if (serverFilters?.priority) p.set("priority", serverFilters.priority);
    if (serverFilters?.dateFrom) p.set("from", serverFilters.dateFrom);
    if (serverFilters?.dateTo && serverFilters.showDateTo) p.set("to", serverFilters.dateTo);
    if (serverFilters?.assignedToMe) p.set("assignedToMe", "true");
    if (serverFilters?.fieldSearches) {
      for (const [k, v] of Object.entries(serverFilters.fieldSearches)) {
        if (v) p.set(`fs_${k}`, v);
      }
    }
    return p.toString();
  }, [isServerMode, formInstanceId, page, sortKey, sortDir, serverFilters]);

  const refetch = useCallback(() => {
    if (!isServerMode || fetchKey === null) return;
    setLoading(true);
    fetch(`/api/admin/submissions?${fetchKey}`)
      .then(r => r.json())
      .then(data => {
        setServerRows(data.rows ?? []);
        setServerTotal(data.total ?? 0);
        setServerPages(data.pages ?? 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isServerMode, fetchKey]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Reset page when filters change
  const prevFiltersRef = useRef(serverFilters);
  useEffect(() => {
    if (isServerMode && prevFiltersRef.current !== serverFilters) {
      setPage(1);
      prevFiltersRef.current = serverFilters;
    }
  }, [serverFilters, isServerMode]);

  // ── Display data ──
  const displayRows = isServerMode ? serverRows : [];
  const clientSorted = useMemo(() => {
    if (isServerMode || !clientSubmissions) return [];
    const arr = [...clientSubmissions];
    arr.sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;
      switch (sortKey) {
        case "email":       aVal = a.email; bVal = b.email; break;
        case "submittedAt": aVal = a.submittedAt?.getTime() ?? 0; bVal = b.submittedAt?.getTime() ?? 0; break;
        case "dateEcheance": aVal = a.dateEcheance ?? ""; bVal = b.dateEcheance ?? ""; break;
        case "status":      aVal = a.status ?? ""; bVal = b.status ?? ""; break;
        case "priority": {
          const order = ["red","orange","yellow","green","none"];
          const pa = a.priority && a.priority !== "none" ? a.priority : getEffectivePriority(a).priority;
          const pb = b.priority && b.priority !== "none" ? b.priority : getEffectivePriority(b).priority;
          aVal = order.indexOf(pa); bVal = order.indexOf(pb); break;
        }
        default:
          aVal = String((a.formData as Record<string,unknown>)?.[sortKey] ?? "");
          bVal = String((b.formData as Record<string,unknown>)?.[sortKey] ?? "");
      }
      if (aVal === null || aVal === "") return sortDir === "asc" ? 1 : -1;
      if (bVal === null || bVal === "") return sortDir === "asc" ? -1 : 1;
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSubmissions, sortKey, sortDir, isServerMode]);

  const totalRows = isServerMode ? serverTotal : clientSorted.length;
  const totalPages = isServerMode ? serverPages : Math.max(1, Math.ceil(clientSorted.length / CLIENT_PAGE_SIZE));
  const paginated = isServerMode
    ? displayRows
    : clientSorted.slice((page - 1) * CLIENT_PAGE_SIZE, page * CLIENT_PAGE_SIZE);

  const paginatedIds = paginated.map(s => s.id);
  const allPageSelected = paginatedIds.length > 0 && paginatedIds.every(id => selectedIds.has(id));
  const somePageSelected = paginatedIds.some(id => selectedIds.has(id));
  const headerIndeterminate = somePageSelected && !allPageSelected;

  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = headerIndeterminate;
    }
  }, [headerIndeterminate]);

  useEffect(() => {
    if (!allPageSelected) setAllPagesSelected(false);
  }, [allPageSelected]);

  // ── Columns ──
  const columns = useMemo(() => {
    const sample = paginated[0] ?? clientSubmissions?.[0];
    if (isExternalSource && sample) {
      const fd = sample.formData as Record<string, unknown> | null;
      if (fd) {
        const hidden = new Set(hiddenColumns ?? []);
        const keys = Object.keys(fd)
          .filter(k => !SKIP_KEYS_TABLE.has(k) && !k.endsWith("_id") && !DATE_KEY_RE_TABLE.test(k) && !hidden.has(k))
          .slice(0, 7);
        if (keys.length > 0) {
          const autoCols: TableColumnDef[] = keys.map(k => ({
            id: `auto-${k}`,
            label: formatFieldKey(k),
            source: k,
          }));
          if (!hidden.has("submittedAt")) {
            autoCols.push({ id: "auto-submittedAt", label: tr.admin.table.columns.date, source: "submittedAt" });
          }
          return autoCols;
        }
      }
    }
    if (formSteps && formSteps.length > 0) {
      const cols: TableColumnDef[] = [{ id: "c-email", label: tr.admin.table.columns.email, source: "email" }];
      for (const step of formSteps) {
        for (const field of step.fields) {
          if (field.type === "section_header") continue;
          const source = field.dbKey ?? field.id;
          if (source === "email") continue;
          cols.push({ id: `f-${source}`, label: field.label, source });
        }
      }
      cols.push({ id: "c-status", label: tr.admin.table.columns.status, source: "status" });
      cols.push({ id: "c-submitted", label: tr.admin.table.columns.submittedAt, source: "submittedAt" });
      return cols;
    }
    const configColumns = formConfig?.admin.tableColumns ?? DEFAULT_COLUMNS;
    const visibleColumns = configColumns.filter(c => !c.hidden);
    return visibleColumns.length > 0 ? visibleColumns : DEFAULT_COLUMNS;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExternalSource, formSteps, formConfig, hiddenColumns, paginated.length]);

  const allFields = (formSteps ?? []).flatMap(s => s.fields);

  function resolveFieldValue(source: string, sub: Submission): string {
    const fd = sub.formData as Record<string, unknown>;
    const raw = fd?.[source];
    if (raw == null || raw === "") return "—";
    const field = allFields.find(f => (f.dbKey ?? f.id) === source);
    if (field?.options) {
      const opt = field.options.find(o => o.value === String(raw));
      if (opt) return opt.label;
    }
    return String(raw);
  }

  function getEffectivePriority(sub: Submission) {
    if (sub.priority && sub.priority !== "none") {
      return { priority: sub.priority as SubmissionPriority, isOverride: true, label: "" };
    }
    const auto = calcAutoPriority(sub.dateEcheance, thresholds);
    return { ...auto, isOverride: false };
  }

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  }

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        paginatedIds.forEach(id => next.delete(id));
        setAllPagesSelected(false);
      } else {
        paginatedIds.forEach(id => next.add(id));
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleSaved(updated: Submission) {
    if (selected?.id === updated.id) setSelected(updated);
    if (isServerMode) {
      setServerRows(prev => prev.map(s => s.id === updated.id ? updated : s));
    }
    onUpdate?.(updated);
  }

  async function applyBulk() {
    if (!bulkStatus && !bulkPriority) { setBulkError(tr.admin.table.bulk.errorSelectFirst); return; }
    setBulkSaving(true);
    setBulkError("");
    try {
      const updates: Record<string, string> = {};
      if (bulkStatus) updates.status = bulkStatus;
      if (bulkPriority) updates.priority = bulkPriority;
      const res = await fetch("/api/admin/submissions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds], updates }),
      });
      const data = await res.json();
      if (!res.ok) { setBulkError(data.error ?? tr.admin.table.bulk.errorGeneric); return; }
      if (isServerMode) {
        refetch();
      } else {
        const updatedMap = new Map([...selectedIds].map(id => [id, updates]));
        clientSubmissions?.forEach(sub => {
          const upd = updatedMap.get(sub.id);
          if (upd) onUpdate?.({ ...sub, ...upd });
        });
      }
      setSelectedIds(new Set());
      setAllPagesSelected(false);
      setBulkStatus("");
      setBulkPriority("");
    } catch {
      setBulkError(tr.admin.table.bulk.networkError);
    } finally {
      setBulkSaving(false);
    }
  }

  async function applyBulkDelete() {
    setBulkSaving(true);
    setBulkError("");
    try {
      const idsToDelete = [...selectedIds];
      const res = await fetch("/api/admin/submissions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete, action: "delete" }),
      });
      const data = await res.json();
      if (!res.ok) { setBulkError(data.error ?? tr.admin.table.bulk.errorGeneric); setConfirmDelete(false); return; }
      if (isServerMode) {
        refetch();
      } else {
        onDelete?.(idsToDelete);
      }
      setSelectedIds(new Set());
      setAllPagesSelected(false);
      setConfirmDelete(false);
      setBulkStatus("");
      setBulkPriority("");
    } catch {
      setBulkError(tr.admin.table.bulk.networkError);
      setConfirmDelete(false);
    } finally {
      setBulkSaving(false);
    }
  }

  function renderCell(col: TableColumnDef, sub: Submission) {
    const { priority: effectivePriority, isOverride, label: priorityLabel } = getEffectivePriority(sub);

    switch (col.source) {
      case "email":
        return <span className="text-foreground truncate max-w-[180px] block">{sub.email}</span>;

      case "status": {
        const statusValue = sub.status ?? "pending";
        if (customStatuses && customStatuses.length > 0) {
          const custom = customStatuses.find(s => s.value === statusValue);
          if (custom) {
            return (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: custom.color }} />
                {custom.label}
              </span>
            );
          }
          return <span className="text-muted-foreground">{statusValue}</span>;
        }
        return <span className="text-muted-foreground">{STATUS_LABELS[statusValue] ?? statusValue}</span>;
      }

      case "priority": {
        const p = effectivePriority;
        const colors = p === "red" ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
          : p === "orange" ? "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
          : p === "yellow" ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
          : p === "green"  ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
          : "bg-muted text-muted-foreground";
        return (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${colors}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_COLORS[p]}`} />
            {isOverride ? tr.admin.detail.priorityManual : (priorityLabel || tr.priority.none)}
          </span>
        );
      }

      case "dateEcheance":
        if (!sub.dateEcheance) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {sub.dateEcheance}
            {!isOverride && priorityLabel && (
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                effectivePriority === "red"    ? "bg-red-50 text-red-700" :
                effectivePriority === "orange" ? "bg-orange-50 text-orange-700" :
                effectivePriority === "yellow" ? "bg-yellow-50 text-yellow-700" :
                                                 "bg-green-50 text-green-700"
              }`}>{priorityLabel}</span>
            )}
          </span>
        );

      case "submittedAt":
        return <span className="text-muted-foreground whitespace-nowrap">{formatDate(sub.submittedAt)}</span>;

      default:
        return <span className="text-muted-foreground">{resolveFieldValue(col.source, sub)}</span>;
    }
  }

  const isEmpty = paginated.length === 0;

  return (
    <>
      <div className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">{tr.admin.table.allSubmissions}</h2>

        {isEmpty && !loading ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-muted-foreground text-sm">{tr.admin.table.empty}</p>
            {totalRows === 0 && !isServerMode && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{tr.admin.table.sharePrompt}</p>
                <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                  {typeof window !== "undefined" ? window.location.origin : ""}
                </code>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  {canBulk && (
                    <th className="pb-3 pr-3 w-5">
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-border cursor-pointer"
                        title={tr.admin.table.selectPage}
                      />
                    </th>
                  )}
                  <th className="pb-3 w-5" />
                  {columns.map(col => (
                    <SortableHeader key={col.id} col={col} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {canBulk && <td className="py-3 pr-3"><div className="w-4 h-4 bg-muted rounded animate-pulse" /></td>}
                        <td className="py-3 pr-2"><div className="w-2.5 h-2.5 rounded-full bg-muted animate-pulse" /></td>
                        {columns.map(col => (
                          <td key={col.id} className="py-3 pr-4">
                            <div className="h-4 bg-muted rounded animate-pulse" style={{ width: col.source === "email" ? "140px" : "80px" }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : paginated.map(sub => {
                      const { priority: effectivePriority, isOverride, label: priorityLabel } = getEffectivePriority(sub);
                      const isChecked = selectedIds.has(sub.id);
                      return (
                        <tr
                          key={sub.id}
                          onClick={() => setSelected(sub)}
                          className={`border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors cursor-pointer ${isChecked ? "bg-muted/20" : ""}`}
                        >
                          {canBulk && (
                            <td className="py-3 pr-3" onClick={e => { e.stopPropagation(); toggleSelect(sub.id); }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                readOnly
                                className="rounded border-border cursor-pointer pointer-events-none"
                              />
                            </td>
                          )}
                          <td className="py-3 pr-2">
                            <span
                              className={`inline-block w-2.5 h-2.5 rounded-full ${PRIORITY_COLORS[effectivePriority]}`}
                              title={isOverride ? tr.admin.detail.priorityManual : (priorityLabel || tr.admin.detail.noDeadline)}
                            />
                          </td>
                          {columns.map(col => (
                            <td key={col.id} className="py-3 pr-4">{renderCell(col, sub)}</td>
                          ))}
                        </tr>
                      );
                    })
                }
              </tbody>
            </table>
          </div>
        )}

        {(totalRows > 0 || loading) && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              {isServerMode
                ? (totalRows === 1 ? tr.admin.table.pagination.total_one.replace("{n}", String(totalRows)) : tr.admin.table.pagination.total_other.replace("{n}", String(totalRows)))
                : tr.admin.table.pagination.showing.replace("{from}", String(Math.min((page - 1) * CLIENT_PAGE_SIZE + 1, totalRows))).replace("{to}", String(Math.min(page * CLIENT_PAGE_SIZE, totalRows))).replace("{total}", String(totalRows))}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}>{tr.admin.table.pagination.previous}</Button>
                <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={page}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) setPage(Math.max(1, Math.min(totalPages, v)));
                  }}
                  className="w-14 h-7 rounded-md border border-input bg-background px-2 text-sm text-center focus:outline-none focus:ring-[3px] focus:ring-ring/50"
                  title={tr.admin.table.goToPage}
                />
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}>{tr.admin.table.pagination.next}</Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      {canBulk && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 z-40 flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl shadow-xl px-4 py-3 max-w-full md:max-w-max">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size === 1
              ? tr.admin.table.bulk.selected_one.replace("{n}", "1")
              : tr.admin.table.bulk.selected_other.replace("{n}", String(selectedIds.size))}
          </span>

          {allPageSelected && !allPagesSelected && totalRows > (isServerMode ? SERVER_PAGE_SIZE : CLIENT_PAGE_SIZE) && (
            <button onClick={() => {
              setAllPagesSelected(true);
            }} className="text-xs text-primary underline cursor-pointer">
              {tr.admin.table.bulk.selectAll.replace("{n}", String(totalRows))}
            </button>
          )}
          {allPagesSelected && (
            <span className="text-xs text-primary font-medium">
              {tr.admin.table.bulk.allSelected.replace("{n}", String(totalRows))}{" "}
              <button onClick={() => { setAllPagesSelected(false); setSelectedIds(new Set()); }} className="underline cursor-pointer">{tr.admin.table.bulk.deselect}</button>
            </span>
          )}

          <div className="w-px h-5 bg-border" />

          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground">
                {tr.admin.table.bulk.deleteConfirm.replace("{n}", String(selectedIds.size)).replace("{s}", selectedIds.size > 1 ? "s" : "")}
              </span>
              <button
                onClick={applyBulkDelete}
                disabled={bulkSaving}
                className="h-8 px-3 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {bulkSaving ? "…" : tr.admin.table.bulk.confirm}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={bulkSaving}
                className="h-8 px-3 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                {tr.admin.table.bulk.cancel}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value as SubmissionStatus | "")}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
              >
                <option value="">{tr.admin.table.bulk.statusPlaceholder}</option>
                {(customStatuses && customStatuses.length > 0 ? customStatuses : STATUS_OPTIONS).map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={bulkPriority}
                onChange={e => setBulkPriority(e.target.value as SubmissionPriority | "")}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
              >
                <option value="">{tr.admin.table.bulk.priorityPlaceholder}</option>
                {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button
                onClick={applyBulk}
                disabled={bulkSaving}
                className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {bulkSaving ? "…" : tr.admin.table.bulk.apply}
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="h-8 px-3 rounded-md bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900 cursor-pointer transition-colors"
              >
                {tr.admin.table.bulk.delete}
              </button>
            </div>
          )}

          {bulkError && <span className="text-xs text-red-600">{bulkError}</span>}
          <button
            onClick={() => { setSelectedIds(new Set()); setAllPagesSelected(false); setBulkStatus(""); setBulkPriority(""); setBulkError(""); setConfirmDelete(false); }}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            {tr.admin.table.bulk.deselectAll}
          </button>
        </div>
      )}

      {selected && (
        <SubmissionDetail submission={selected} onClose={() => setSelected(null)} onSaved={handleSaved} formConfig={formConfig} formSteps={formSteps} />
      )}
    </>
  );
}
