"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  AreaChart, Area,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { usePrioritySettings } from "@/lib/context/PrioritySettingsContext";
import { calcAutoPriority } from "@/lib/utils/priority";
import { useTranslations } from "@/lib/context/LocaleContext";
import type { ChartDef, FormConfig, StepDef } from "@/types/config";
import type { Submission } from "@/lib/db/schema";

const PIE_COLORS = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#dc2626", "#64748b", "#0891b2"];

type ChartPoint = { name: string; value: number; prev?: number };

function toYMD(d: Date): string {
  // Use local date components to match getDateRangeBounds which sets hours in local time.
  // toISOString() returns UTC, which can be off by 1 day for users in UTC+ timezones.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDateRangeBounds(dateRange?: string): { start: Date; end: Date } | null {
  if (!dateRange) return null;
  if (dateRange === "all") return null; // legacy — kept for stored configs
  if (dateRange === "year") {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  const days = parseInt(dateRange); // "7d" → 7, "30d" → 30
  if (isNaN(days)) return null;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getDateRangeBoundsFromOverride(
  override: string | { from: string; to: string } | undefined
): { start: Date; end: Date } | null {
  if (!override) return null;
  if (typeof override === "object") {
    const start = new Date(override.from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(override.to);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  return getDateRangeBounds(override);
}

function getPreviousPeriodBounds(bounds: { start: Date; end: Date }): { start: Date; end: Date } {
  const duration = bounds.end.getTime() - bounds.start.getTime();
  return {
    start: new Date(bounds.start.getTime() - duration),
    end: new Date(bounds.end.getTime() - duration),
  };
}

/** Extract a date from a submission — uses dateField if provided, else submittedAt */
function getDateValue(sub: Submission, dateField?: string): Date {
  if (!dateField) return new Date(sub.submittedAt);
  const v = getSubFieldValue(dateField, sub);
  if (v != null && v !== "") {
    const d = new Date(String(v));
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(sub.submittedAt);
}

function applyDateRange(submissions: Submission[], bounds: { start: Date; end: Date } | null, dateField?: string): Submission[] {
  if (!bounds) return submissions;
  return submissions.filter((s) => {
    const d = getDateValue(s, dateField);
    return d >= bounds.start && d <= bounds.end;
  });
}

/** Read a value from a submission — top-level fields first, then formData */
function getSubFieldValue(field: string, sub: Submission): unknown {
  switch (field) {
    case "email":       return sub.email;
    case "status":      return sub.status;
    case "priority":    return sub.priority;
    case "submittedAt": return sub.submittedAt;
    case "dueDate":return sub.dueDate;
    default:            return (sub.formData as Record<string, unknown>)?.[field];
  }
}

/** Accumulate a numeric field per bucket key, respecting fn (sum | avg) */
function accumulate(
  counts: Record<string, number>,
  tallies: Record<string, number>,
  key: string,
  sub: Submission,
  agg: { fn: "sum" | "avg"; field: string } | undefined
) {
  if (agg) {
    const v = Number(getSubFieldValue(agg.field, sub));
    counts[key] = (counts[key] ?? 0) + (isNaN(v) ? 0 : v);
    tallies[key] = (tallies[key] ?? 0) + 1;
  } else {
    counts[key] = (counts[key] ?? 0) + 1;
  }
}

function resolveAggValue(
  counts: Record<string, number>,
  tallies: Record<string, number>,
  key: string,
  agg: { fn: "sum" | "avg"; field: string } | undefined
): number {
  const raw = counts[key] ?? 0;
  if (agg?.fn === "avg") return tallies[key] ? Math.round((raw / tallies[key]) * 100) / 100 : 0;
  return Math.round(raw * 100) / 100;
}

function computeData(
  chart: ChartDef,
  submissions: Submission[],
  thresholds: ReturnType<typeof usePrioritySettings>,
  formConfig?: FormConfig,
  formSteps?: StepDef[],
  dateRangeBoundsOverride?: { start: Date; end: Date } | null,
  statusLabels?: Record<string, string>,
  priorityLabels?: Record<string, string>
): ChartPoint[] {
  const { groupBy, dateRange } = chart;
  const agg = chart.aggregate;

  // ── Date grouping ──────────────────────────────────────
  if (groupBy === "date") {
    const bounds = dateRangeBoundsOverride !== undefined
      ? dateRangeBoundsOverride
      : getDateRangeBounds(dateRange);
    const inRange = bounds
      ? submissions.filter((s) => {
          const d = getDateValue(s, chart.dateField);
          return d >= bounds.start && d <= bounds.end;
        })
      : submissions;

    // Single-day mode: group by hour (00:00 → current hour for today, full 24h for past days)
    if (bounds && toYMD(bounds.start) === toYMD(bounds.end)) {
      const hourlyCounts: Record<string, number> = {};
      const hourlyTallies: Record<string, number> = {};
      for (const s of inRange) {
        const h = String(getDateValue(s, chart.dateField).getHours());
        accumulate(hourlyCounts, hourlyTallies, h, s, agg);
      }
      const now = new Date();
      const isToday = toYMD(bounds.start) === toYMD(now);
      const maxHour = isToday ? now.getHours() : 23;
      const result: ChartPoint[] = [];
      for (let h = 0; h <= maxHour; h++) {
        const k = String(h);
        result.push({ name: `${String(h).padStart(2, "0")}:00`, value: resolveAggValue(hourlyCounts, hourlyTallies, k, agg) });
      }
      return result;
    }

    // No bounds → legacy "all" with no date filter: group by month, no fill
    if (!bounds) {
      const counts: Record<string, number> = {};
      const tallies: Record<string, number> = {};
      for (const s of inRange) {
        const key = toYMD(getDateValue(s, chart.dateField)).slice(0, 7);
        accumulate(counts, tallies, key, s, agg);
      }
      return Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name]) => ({ name, value: resolveAggValue(counts, tallies, name, agg) }));
    }

    // Multi-month mode (> 60 days): group by month and fill every month in range
    const spanDays = Math.round((bounds.end.getTime() - bounds.start.getTime()) / 86_400_000);
    if (spanDays > 60) {
      const counts: Record<string, number> = {};
      const tallies: Record<string, number> = {};
      for (const s of inRange) {
        const d = getDateValue(s, chart.dateField);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        accumulate(counts, tallies, key, s, agg);
      }
      // Fill every month from start to end
      const result: ChartPoint[] = [];
      const cur = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), 1);
      const endMonth = new Date(bounds.end.getFullYear(), bounds.end.getMonth(), 1);
      while (cur <= endMonth) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
        result.push({ name: key, value: resolveAggValue(counts, tallies, key, agg) });
        cur.setMonth(cur.getMonth() + 1);
      }
      return result;
    }

    // Daily mode: fill every day in range with 0 if no submissions
    const counts: Record<string, number> = {};
    const tallies: Record<string, number> = {};
    for (const s of inRange) {
      const key = toYMD(getDateValue(s, chart.dateField));
      accumulate(counts, tallies, key, s, agg);
    }
    const result: ChartPoint[] = [];
    const cur = new Date(bounds.start);
    while (cur <= bounds.end) {
      const d = toYMD(cur);
      result.push({ name: d, value: resolveAggValue(counts, tallies, d, agg) });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }

  // ── Status grouping ────────────────────────────────────
  if (groupBy === "status") {
    const bounds = dateRangeBoundsOverride !== undefined
      ? dateRangeBoundsOverride
      : getDateRangeBounds(dateRange);
    const filtered = applyDateRange(submissions, bounds);
    const counts: Record<string, number> = {};
    for (const s of filtered) {
      const st = s.status ?? "pending";
      counts[st] = (counts[st] ?? 0) + 1;
    }
    return Object.entries(counts).map(([key, value]) => ({
      name: (statusLabels ?? {})[key] ?? key,
      value,
    }));
  }

  // ── Priority grouping ──────────────────────────────────
  if (groupBy === "priority") {
    const bounds = dateRangeBoundsOverride !== undefined
      ? dateRangeBoundsOverride
      : getDateRangeBounds(dateRange);
    const filtered = applyDateRange(submissions, bounds);
    const counts: Record<string, number> = {};
    for (const s of filtered) {
      const p =
        s.priority && s.priority !== "none"
          ? s.priority
          : calcAutoPriority(s.dueDate, thresholds).priority;
      counts[p] = (counts[p] ?? 0) + 1;
    }
    return Object.entries(counts).map(([key, value]) => ({
      name: (priorityLabels ?? {})[key] ?? key,
      value,
    }));
  }

  // ── Form field grouping (any key in formData JSONB) ────
  const bounds = dateRangeBoundsOverride !== undefined
    ? dateRangeBoundsOverride
    : getDateRangeBounds(dateRange);
  const filtered = applyDateRange(submissions, bounds);
  const counts: Record<string, number> = {};

  // Try to resolve option labels from form steps
  const optionsMap: Record<string, string> = {};
  const stepsForLookup = formSteps ?? [];
  if (stepsForLookup.length > 0) {
    const allFields = stepsForLookup.flatMap((s) => s.fields);
    const field = allFields.find((f) => (f.dbKey ?? f.id) === groupBy);
    if (field?.options) {
      for (const opt of field.options) {
        optionsMap[opt.value] = opt.label;
      }
    }
  }

  for (const s of filtered) {
    const fd = s.formData as Record<string, string>;
    const val = fd?.[groupBy] ?? "";
    if (!val) continue;
    const label = optionsMap[val] ?? val;
    counts[label] = (counts[label] ?? 0) + 1;
  }

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));
}

// ─────────────────────────────────────────────────────────

interface DynamicChartProps {
  chart: ChartDef;
  submissions: Submission[];
  formConfig?: FormConfig;
  formSteps?: StepDef[];
  /** Overrides chart.dateRange — used by interactive range selector in DynamicWidget.
   *  Accepts a preset string ("7d", "30d", etc.) or a custom { from, to } object with ISO date strings. */
  dateRangeOverride?: string | { from: string; to: string };
  /** Called when a bar or pie segment is clicked */
  onSegmentClick?: (value: string, groupBy: string) => void;
}

export function DynamicChart({ chart, submissions, formConfig, formSteps, dateRangeOverride, onSegmentClick }: DynamicChartProps) {
  const thresholds = usePrioritySettings();
  const tr = useTranslations();
  // Build localized label maps used by computeData
  const STATUS_LABELS: Record<string, string> = {
    pending: tr.status.pending,
    in_progress: tr.status.in_progress,
    done: tr.status.done,
    waiting_user: tr.status.waiting_user,
  };
  const PRIORITY_LABELS: Record<string, string> = {
    none: tr.priority.undefined,
    green: tr.priority.green,
    yellow: tr.priority.yellow,
    orange: tr.priority.orange,
    red: tr.priority.red,
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  // Resolve date range bounds
  const boundsOverride = getDateRangeBoundsFromOverride(dateRangeOverride);

  const data = computeData(chart, submissions, thresholds, formConfig, formSteps, boundsOverride, STATUS_LABELS, PRIORITY_LABELS);
  const color = chart.color ?? "#2563eb";
  const gradientId = `grad-${chart.id}`;
  const showComparison = chart.showComparison && (chart.type === "line" || chart.type === "area");

  // ── Comparison period data ─────────────────────────────
  let mergedData = data;
  let delta: number | null = null;

  if (showComparison) {
    const currentBounds = boundsOverride ?? getDateRangeBounds(chart.dateRange);
    if (currentBounds) {
      const prevBounds = getPreviousPeriodBounds(currentBounds);
      const prevData = computeData(chart, submissions, thresholds, formConfig, formSteps, prevBounds);

      // Align by index — current period drives the labels
      mergedData = data.map((point, i) => ({
        ...point,
        prev: prevData[i]?.value ?? 0,
      }));

      // Compute delta: percentage change in total submissions
      const currentTotal = data.reduce((acc, p) => acc + p.value, 0);
      const prevTotal = prevData.reduce((acc, p) => acc + p.value, 0);
      if (prevTotal > 0) {
        delta = ((currentTotal - prevTotal) / prevTotal) * 100;
      } else if (currentTotal > 0) {
        delta = 100;
      } else {
        delta = 0;
      }
    }
  }

  async function exportPng() {
    if (!containerRef.current || exporting) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(containerRef.current, { backgroundColor: "#ffffff", skipFonts: true, cacheBust: true });
      const a = document.createElement("a");
      a.download = `${chart.title ?? chart.id}.png`;
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        {tr.admin.chart.noData}
      </div>
    );
  }

  const exportButton = (
    <button
      onClick={exportPng}
      disabled={exporting}
      title={tr.admin.chart.exportPng}
      className="absolute top-0 right-0 z-10 text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded cursor-pointer"
    >
      {exporting ? "…" : "↓ PNG"}
    </button>
  );

  const deltaBadge = showComparison && delta !== null ? (
    <div className={`absolute top-0 right-12 text-xs font-semibold px-2 py-0.5 rounded-full ${delta >= 0 ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"}`}>
      {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
    </div>
  ) : null;

  // ── Area ──────────────────────────────────────────────
  if (chart.type === "area") {
    return (
      <div className="relative" ref={containerRef}>
        {deltaBadge}
        {exportButton}
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={mergedData}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border)" }} />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} name={tr.admin.chart.currentPeriod} />
            {showComparison && (
              <Area type="monotone" dataKey="prev" stroke={color} strokeWidth={1.5} fill="none" dot={false} strokeDasharray="5 5" name={tr.admin.chart.prevPeriod} strokeOpacity={0.5} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Line ──────────────────────────────────────────────
  if (chart.type === "line") {
    return (
      <div className="relative" ref={containerRef}>
        {deltaBadge}
        {exportButton}
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={mergedData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border)" }} />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} name={tr.admin.chart.currentPeriod} />
            {showComparison && (
              <Line type="monotone" dataKey="prev" stroke={color} strokeWidth={1.5} dot={false} strokeDasharray="5 5" name={tr.admin.chart.prevPeriod} strokeOpacity={0.5} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Bar ───────────────────────────────────────────────
  if (chart.type === "bar") {
    return (
      <div className="relative" ref={containerRef}>
        {exportButton}
        <ResponsiveContainer width="100%" height={Math.max(180, data.length * 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={110} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border)" }} />
            <Bar
              dataKey="value"
              fill={color}
              radius={[0, 4, 4, 0]}
              name={tr.admin.chart.submissions}
              onClick={(barData: { name?: string }) => { if (barData.name != null) onSegmentClick?.(barData.name, chart.groupBy); }}
              style={{ cursor: onSegmentClick ? "pointer" : "default" }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Pie ───────────────────────────────────────────────
  if (chart.type === "pie") {
    return (
      <div className="relative" ref={containerRef}>
        {exportButton}
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ name, percent }) =>
                (percent ?? 0) > 0.05 ? `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%` : ""
              }
              labelLine={false}
              onClick={(pieData: { name?: string }) => { if (pieData.name != null) onSegmentClick?.(pieData.name, chart.groupBy); }}
              style={{ cursor: onSegmentClick ? "pointer" : "default" }}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border)" }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
