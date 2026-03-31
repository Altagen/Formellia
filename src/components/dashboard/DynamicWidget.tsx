"use client";

import { usePrioritySettings } from "@/lib/context/PrioritySettingsContext";
import { calcAutoPriority } from "@/lib/utils/priority";
import { useState } from "react";
import { useTranslations } from "@/lib/context/LocaleContext";
import { DynamicChart } from "./DynamicChart";
import { TrafficChartWidget } from "./widgets/TrafficChartWidget";
import { EmailQualityWidget } from "./widgets/EmailQualityWidget";
import { FilterPillsWidget } from "./widgets/FilterPillsWidget";
import { UrgencyDistributionWidget } from "./widgets/UrgencyDistributionWidget";
import { FunnelChartWidget } from "./widgets/FunnelChartWidget";
import { DeadlineDistributionWidget } from "./widgets/DeadlineDistributionWidget";
import type { WidgetDef, StatsCardDef, StatsCardQuery, StatsQueryDef, StatsQueryFilter, StatsTableDef, StatsTableColumn, FormConfig, StepDef } from "@/types/config";
import type { Submission } from "@/lib/db/schema";
import type { SubmissionPriority } from "@/types/config";

// ─────────────────────────────────────────────────────────
// Stats computation
// ─────────────────────────────────────────────────────────

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Structured query helpers ─────────────────────────────

function getFieldValue(field: string, sub: Submission): unknown {
  switch (field) {
    case "email":       return sub.email;
    case "status":      return sub.status;
    case "priority":    return sub.priority;
    case "submittedAt": return sub.submittedAt;
    case "dateEcheance":return sub.dateEcheance;
    default:            return (sub.formData as Record<string, unknown>)?.[field];
  }
}

function applyFilterCondition(f: StatsQueryFilter, sub: Submission): boolean {
  const raw = getFieldValue(f.field, sub);
  const val = f.value;

  if (["gt", "lt", "gte", "lte"].includes(f.op)) {
    const n = Number(raw), nv = Number(val);
    if (!isNaN(n) && !isNaN(nv)) {
      if (f.op === "gt")  return n > nv;
      if (f.op === "lt")  return n < nv;
      if (f.op === "gte") return n >= nv;
      if (f.op === "lte") return n <= nv;
    }
  }

  const s  = String(raw  ?? "").toLowerCase();
  const sv = val.toLowerCase();
  switch (f.op) {
    case "eq":       return s === sv;
    case "neq":      return s !== sv;
    case "contains": return s.includes(sv);
    case "gt":       return s > sv;
    case "lt":       return s < sv;
    case "gte":      return s >= sv;
    case "lte":      return s <= sv;
    default:         return true;
  }
}

function applyScopeFilter(scope: StatsQueryDef["scope"], submissions: Submission[]): Submission[] {
  if (scope === "all") return submissions;
  const now = new Date();
  if (scope === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return submissions.filter(s => new Date(s.submittedAt) >= start);
  }
  if (scope === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return submissions.filter(s => new Date(s.submittedAt) >= start);
  }
  if (scope === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return submissions.filter(s => new Date(s.submittedAt) >= start);
  }
  return submissions;
}

function computeStructuredQuery(q: StatsQueryDef, submissions: Submission[]): number {
  let records = applyScopeFilter(q.scope, submissions);

  if (q.filters.length > 0) {
    records = records.filter(sub => {
      const results = q.filters.map(f => applyFilterCondition(f, sub));
      return q.filterLogic === "and" ? results.every(Boolean) : results.some(Boolean);
    });
  }

  switch (q.fn) {
    case "count": return records.length;
    case "sum": {
      if (!q.field) return 0;
      const total = records.reduce((acc, sub) => {
        const v = Number(getFieldValue(q.field!, sub));
        return acc + (isNaN(v) ? 0 : v);
      }, 0);
      return Math.round(total * 100) / 100;
    }
    case "avg": {
      if (!q.field || records.length === 0) return 0;
      const sum = records.reduce((acc, sub) => {
        const v = Number(getFieldValue(q.field!, sub));
        return acc + (isNaN(v) ? 0 : v);
      }, 0);
      return Math.round((sum / records.length) * 100) / 100;
    }
    case "min": {
      if (!q.field || records.length === 0) return 0;
      const vals = records.map(sub => Number(getFieldValue(q.field!, sub))).filter(v => !isNaN(v));
      return vals.length > 0 ? Math.round(Math.min(...vals) * 100) / 100 : 0;
    }
    case "max": {
      if (!q.field || records.length === 0) return 0;
      const vals = records.map(sub => Number(getFieldValue(q.field!, sub))).filter(v => !isNaN(v));
      return vals.length > 0 ? Math.round(Math.max(...vals) * 100) / 100 : 0;
    }
    default: return 0;
  }
}

// ── Main dispatcher ──────────────────────────────────────

function computeStatValue(
  query: StatsCardQuery,
  submissions: Submission[],
  thresholds: ReturnType<typeof usePrioritySettings>
): number {
  // Structured query
  if (typeof query === "object") return computeStructuredQuery(query, submissions);

  // Legacy string queries
  const todayStr = toYMD(new Date());
  const now = new Date();

  switch (query) {
    case "count_total":
      return submissions.length;
    case "count_today": {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return submissions.filter((s) => new Date(s.submittedAt) >= startOfDay).length;
    }
    case "count_week": {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      return submissions.filter((s) => new Date(s.submittedAt) >= startOfWeek).length;
    }
    case "count_overdue":
      return submissions.filter(
        (s) => s.dateEcheance && s.dateEcheance < todayStr && s.status !== "done"
      ).length;
    case "count_urgent":
      return submissions.filter((s) => {
        const p =
          s.priority && s.priority !== "none"
            ? (s.priority as SubmissionPriority)
            : calcAutoPriority(s.dateEcheance, thresholds).priority;
        return p === "red" && s.status !== "done";
      }).length;
    case "count_done":
      return submissions.filter((s) => s.status === "done").length;
    default:
      return 0;
  }
}

// ─────────────────────────────────────────────────────────
// StatsTable computation
// ─────────────────────────────────────────────────────────

function computeStatsTable(
  config: StatsTableDef,
  submissions: Submission[],
): { group: string; values: Record<string, number | string> }[] {
  let records = applyScopeFilter(config.scope ?? "all", submissions);

  if (config.filters && config.filters.length > 0) {
    records = records.filter(sub => {
      const results = config.filters!.map(f => applyFilterCondition(f, sub));
      return (config.filterLogic ?? "and") === "and" ? results.every(Boolean) : results.some(Boolean);
    });
  }

  const groups = new Map<string, Submission[]>();
  for (const sub of records) {
    const gv = String(getFieldValue(config.groupBy, sub) ?? "");
    if (!groups.has(gv)) groups.set(gv, []);
    groups.get(gv)!.push(sub);
  }

  const rows = [...groups.entries()].map(([group, subs]) => {
    const values: Record<string, number | string> = {};
    for (const col of config.columns) {
      if (col.fn === "first") {
        const v = col.field ? getFieldValue(col.field, subs[0]) : undefined;
        values[col.id] = v != null ? String(v) : "—";
      } else {
        const q: StatsQueryDef = { fn: col.fn, field: col.field, filters: [], filterLogic: "and", scope: "all" };
        values[col.id] = computeStructuredQuery(q, subs);
      }
    }
    return { group, values };
  });

  if (config.sortColumnId) {
    const sid = config.sortColumnId;
    rows.sort((a, b) => {
      const av = a.values[sid] ?? 0;
      const bv = b.values[sid] ?? 0;
      if (typeof av === "string" || typeof bv === "string") {
        const cmp = String(av).localeCompare(String(bv), "fr", { sensitivity: "base" });
        return config.sortDir === "asc" ? cmp : -cmp;
      }
      return config.sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }

  return config.limit && config.limit > 0 ? rows.slice(0, config.limit) : rows;
}

function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function fmtKey(key: string): string {
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ─────────────────────────────────────────────────────────
// StatCard sub-component
// ─────────────────────────────────────────────────────────

const ACCENT_STYLES: Record<string, { bg: string; text: string; value: string }> = {
  blue:   { bg: "bg-blue-500/15",   text: "text-blue-600 dark:text-blue-400",   value: "text-foreground" },
  red:    { bg: "bg-red-500/15",    text: "text-red-600 dark:text-red-400",    value: "text-red-600 dark:text-red-400" },
  orange: { bg: "bg-orange-500/15", text: "text-orange-600 dark:text-orange-400", value: "text-orange-600 dark:text-orange-400" },
  green:  { bg: "bg-green-500/15",  text: "text-green-600 dark:text-green-400",  value: "text-foreground" },
  purple: { bg: "bg-purple-500/15", text: "text-purple-600 dark:text-purple-400", value: "text-foreground" },
  gray:   { bg: "bg-muted",         text: "text-muted-foreground", value: "text-foreground" },
};

// Lucide-style icon rendered by name via dynamic import fallback (emoji otherwise)
function IconByName({ name, className }: { name: string; className?: string }) {
  // Simple SVG icons for the most common stat card icons
  const icons: Record<string, React.ReactNode> = {
    "file-text": (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    "calendar": (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    "clock": (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    "alert-triangle": (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    "zap": (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    "check-circle": (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  return (icons[name] ?? <span className="text-lg">{name}</span>) as React.ReactElement;
}

const PREFIX_SYMBOLS = ["$", "£", "¥", "₩", "₹", "₿", "¢"];

function formatStatValue(value: number, format?: StatsCardDef["format"], currencySymbol?: string): string {
  if (format === "currency") {
    const sym = currencySymbol ?? "€";
    const formatted = value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return PREFIX_SYMBOLS.includes(sym) ? `${sym}${formatted}` : `${formatted} ${sym}`;
  }
  return Number.isInteger(value) ? String(value) : value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function StatCard({
  config,
  value,
}: {
  config: StatsCardDef;
  value: number;
}) {
  const accent = config.accent ?? "blue";
  const styles = ACCENT_STYLES[accent] ?? ACCENT_STYLES.blue;

  return (
    <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${styles.bg} ${styles.text}`}>
        <IconByName name={config.icon} className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{config.title}</p>
        <p className={`text-xl font-bold ${value > 0 ? styles.value : "text-foreground"}`}>
          {formatStatValue(value, config.format, config.currencySymbol)}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Recent submissions widget
// ─────────────────────────────────────────────────────────

function RecentSubmissions({ title, submissions, limit = 5 }: { title: string; submissions: Submission[]; limit?: number }) {
  const tr = useTranslations();
  const recent = [...submissions]
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    .slice(0, limit);

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</p>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">{tr.admin.table.noRecentSubmissions}</p>
      ) : (
        <div className="space-y-2">
          {recent.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span className="text-foreground truncate mr-2">{s.email}</span>
              <span className="text-muted-foreground whitespace-nowrap text-xs">
                {new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "2-digit" }).format(new Date(s.submittedAt))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ChartWidget — chart with interactive date range selector
// ─────────────────────────────────────────────────────────

function ChartWidget({ widget, submissions, formConfig, formSteps, onSegmentClick }: {
  widget: Extract<WidgetDef, { type: "chart" }>;
  submissions: Submission[];
  formConfig?: FormConfig;
  formSteps?: StepDef[];
  onSegmentClick?: (value: string, groupBy: string) => void;
}) {
  const tr = useTranslations();
  const w = tr.admin.config.widgets;
  const DATE_RANGES = [
    { value: "1d",     label: w.periodToday },
    { value: "7d",     label: "7j" },
    { value: "30d",    label: "30j" },
    { value: "90d",    label: "90j" },
    { value: "year",   label: w.periodYear },
    { value: "custom", label: w.periodCustom },
  ] as const;

  type RangeValue = typeof DATE_RANGES[number]["value"];
  const storedRange = widget.chartConfig.dateRange;
  const initialRange = !storedRange || storedRange === "all" ? "7d" : storedRange;
  const [range, setRange] = useState<RangeValue>(initialRange as RangeValue);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Only show range selector for time-based charts
  const showRangeSelector = widget.chartConfig.groupBy === "date";

  // Compute the effective override to pass to DynamicChart
  const effectiveOverride = !showRangeSelector
    ? undefined
    : range === "custom" && customFrom && customTo
      ? { from: customFrom, to: customTo }
      : range === "custom"
        ? undefined // not yet configured
        : range;

  return (
    <div className="bg-card rounded-xl border border-border p-5 h-full">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <p className="text-sm font-semibold text-foreground">{widget.title}</p>
        {showRangeSelector && (
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5 shrink-0">
            {DATE_RANGES.map(r => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  range === r.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {showRangeSelector && range === "custom" && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-muted-foreground">{w.periodCustomFrom}</span>
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="border border-input rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">{w.periodCustomTo}</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="border border-input rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}
      <DynamicChart
        chart={widget.chartConfig}
        submissions={submissions}
        formConfig={formConfig}
        formSteps={formSteps}
        dateRangeOverride={effectiveOverride}
        onSegmentClick={onSegmentClick}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// StatsTableWidget
// ─────────────────────────────────────────────────────────

function StatsTableWidget({ widget, submissions }: {
  widget: Extract<WidgetDef, { type: "stats_table" }>;
  submissions: Submission[];
}) {
  const tr = useTranslations();
  const rows = computeStatsTable(widget.tableConfig, submissions);
  const cols = widget.tableConfig.columns;

  return (
    <div className="bg-card rounded-xl border border-border p-5 h-full flex flex-col">
      {widget.title && (
        <p className="text-sm font-semibold text-foreground mb-3 shrink-0">{widget.title}</p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{tr.admin.chart.noDataShort}</p>
      ) : (
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs text-muted-foreground font-medium pb-2 pr-6">
                  {widget.tableConfig.groupByLabel || fmtKey(widget.tableConfig.groupBy)}
                </th>
                {cols.map(col => (
                  <th key={col.id} className={`text-xs text-muted-foreground font-medium pb-2 pl-4 whitespace-nowrap ${col.fn === "first" ? "text-left" : "text-right"}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="py-2 pr-6 text-foreground font-medium max-w-[180px] truncate">
                    {row.group || <span className="text-muted-foreground">—</span>}
                  </td>
                  {cols.map(col => {
                    const v = row.values[col.id];
                    const isText = col.fn === "first";
                    return (
                      <td key={col.id} className={`py-2 pl-4 text-foreground ${isText ? "text-left" : "text-right tabular-nums"}`}>
                        {isText ? (v ?? "—") : fmtNum((v as number) ?? 0)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// WidgetRequiresFormInstance — shown when the page is not scoped to a form
// ─────────────────────────────────────────────────────────

function WidgetRequiresFormInstance({ title }: { title: string }) {
  const tr = useTranslations();
  return (
    <div className="bg-card rounded-xl border border-amber-200 dark:border-amber-800 p-5 flex flex-col gap-2">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-amber-600 dark:text-amber-400">
        {tr.admin.chart.requiresFormInstance}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// DynamicWidget
// ─────────────────────────────────────────────────────────

interface DynamicWidgetProps {
  widget: WidgetDef;
  submissions: Submission[];
  formConfig?: FormConfig;
  formSteps?: StepDef[];
  formInstanceId?: string;
  dataSourceId?: string;
  activeSegmentFilter?: { field: string; value: string } | null;
  onSegmentClick?: (value: string, groupBy: string) => void;
}

export function DynamicWidget({ widget, submissions, formConfig, formSteps, formInstanceId, dataSourceId, activeSegmentFilter, onSegmentClick }: DynamicWidgetProps) {
  const thresholds = usePrioritySettings();

  if (widget.type === "stats_card") {
    const value = computeStatValue(widget.statsConfig.query, submissions, thresholds);
    return <StatCard config={widget.statsConfig} value={value} />;
  }

  if (widget.type === "chart") {
    return <ChartWidget widget={widget} submissions={submissions} formConfig={formConfig} formSteps={formSteps} onSegmentClick={onSegmentClick} />;
  }

  if (widget.type === "stats_table") {
    return <StatsTableWidget widget={widget} submissions={submissions} />;
  }

  if (widget.type === "recent") {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <RecentSubmissions title={widget.title} submissions={submissions} limit={widget.limit} />
      </div>
    );
  }

  if (widget.type === "info_card") {
    return (
      <div className={`rounded-xl border p-5 ${widget.accent ? `border-${widget.accent}-200 bg-${widget.accent}-50` : "border-border bg-muted/50"}`}>
        <p className="text-sm font-semibold text-foreground mb-1">{widget.title}</p>
        <p className="text-xs text-muted-foreground">{widget.content}</p>
      </div>
    );
  }

  if (widget.type === "traffic_chart") {
    if (!formInstanceId) return <WidgetRequiresFormInstance title={widget.title ?? "Trafic"} />;
    return <TrafficChartWidget formId={formInstanceId} title={widget.title} />;
  }

  if (widget.type === "email_quality") {
    if (!formInstanceId && !dataSourceId) return <WidgetRequiresFormInstance title={widget.title ?? "Email quality"} />;
    return <EmailQualityWidget formId={formInstanceId} dataSourceId={dataSourceId} title={widget.title} />;
  }

  if (widget.type === "urgency_distribution") {
    if (!formInstanceId) return <WidgetRequiresFormInstance title={widget.title ?? "Distribution urgences"} />;
    return <UrgencyDistributionWidget formId={formInstanceId} title={widget.title} />;
  }

  if (widget.type === "funnel_chart") {
    return (
      <FunnelChartWidget
        submissions={submissions}
        stepField={widget.stepField}
        maxStep={widget.maxStep}
        stepLabels={widget.stepLabels}
        title={widget.title}
      />
    );
  }

  if (widget.type === "deadline_distribution") {
    return (
      <DeadlineDistributionWidget
        title={widget.title}
        submissions={submissions}
        dateField={widget.dateField}
        buckets={widget.buckets}
      />
    );
  }

  if (widget.type === "filter_pills") {
    return (
      <FilterPillsWidget
        title={widget.title}
        field={widget.field}
        submissions={submissions}
        activeSegmentFilter={activeSegmentFilter}
        onSegmentClick={onSegmentClick}
      />
    );
  }

  return null;
}
