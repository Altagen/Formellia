"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/context/LocaleContext";
import type {
  WidgetDef,
  StepDef,
  ChartType,
  StatsCardQuery,
} from "@/types/config";

interface WidgetBuilderTabProps {
  widgets: WidgetDef[];
  formSteps: StepDef[];
  onChange: (widgets: WidgetDef[]) => void;
}

const WIDGET_TYPE_ICONS: Record<WidgetDef["type"], string> = {
  chart:                "📊",
  stats_card:           "🔢",
  stats_table:          "🗃️",
  recent:               "📋",
  info_card:            "ℹ️",
  submissions_table:    "📑",
  traffic_chart:        "🚦",
  email_quality:        "📧",
  urgency_distribution:      "⏱️",
  funnel_chart:              "🔽",
  deadline_distribution:     "📅",
  filter_pills:              "🏷️",
};

const ACCENT_OPTIONS = ["blue", "red", "orange", "green", "purple", "gray"] as const;

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function WidgetBuilderTab({ widgets, formSteps, onChange }: WidgetBuilderTabProps) {
  const tr = useTranslations();
  const w = tr.admin.config.widgets;

  const WIDGET_TYPE_LABELS: Record<WidgetDef["type"], string> = {
    chart:                w.typeChart,
    stats_card:           w.typeStat,
    stats_table:          w.typeStatsTable,
    recent:               w.typeRecent,
    info_card:            w.typeInfo,
    submissions_table:    w.typeTable,
    traffic_chart:        w.typeTrafficChart,
    email_quality:        w.typeEmailQuality,
    urgency_distribution:      w.typeUrgencyDistribution,
    funnel_chart:              w.typeFunnelChart,
    deadline_distribution:     w.typeDeadlineDistribution,
    filter_pills:              w.typeFilterPills,
  };

  const [editingId, setEditingId] = useState<string | null>(null);

  const allFields = formSteps.flatMap((s) => s.fields).filter((f) => f.type !== "section_header");
  const groupByOptions = [
    { value: "date", label: w.groupDate },
    { value: "status", label: w.groupStatus },
    { value: "priority", label: w.groupPriority },
    ...allFields.map((f) => ({ value: f.dbKey ?? f.id, label: f.label })),
  ];

  function updateWidget(i: number, patch: Partial<WidgetDef>) {
    const updated = [...widgets];
    updated[i] = { ...updated[i], ...patch } as WidgetDef;
    onChange(updated);
  }

  function deleteWidget(i: number) {
    onChange(widgets.filter((_, idx) => idx !== i));
    setEditingId(null);
  }

  function addWidget(type: WidgetDef["type"]) {
    let widget: WidgetDef;
    if (type === "chart") {
      widget = {
        type: "chart",
        id: `chart_${Date.now()}`,
        title: w.typeChart,
        span: 2,
        chartConfig: {
          id: `chart_${Date.now()}`,
          title: w.typeChart,
          type: "bar",
          groupBy: "date",
          dateRange: "30d",
        },
      };
    } else if (type === "stats_card") {
      widget = {
        type: "stats_card",
        id: `stats_${Date.now()}`,
        statsConfig: {
          id: `stats_${Date.now()}`,
          title: w.typeStat,
          icon: "hash",
          query: "count_total",
          accent: "blue",
        },
      };
    } else if (type === "recent") {
      widget = {
        type: "recent",
        id: `recent_${Date.now()}`,
        title: w.typeRecent,
        limit: 5,
      };
    } else {
      widget = {
        type: "info_card",
        id: `info_${Date.now()}`,
        title: w.typeInfo,
        content: w.content,
      };
    }
    onChange([...widgets, widget]);
    setEditingId(widget.id);
  }

  function toggleSpan(i: number) {
    const widget = widgets[i];
    if (widget.type === "stats_card") return;
    const current = "span" in widget ? (widget.span ?? 1) : 1;
    updateWidget(i, { span: current === 1 ? 2 : 1 } as Partial<WidgetDef>);
  }

  return (
    <div className="space-y-6">
      {/* Widgets list */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{w.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{widgets.length} widget{widgets.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {widgets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{w.empty}</p>
        ) : (
          <div className="space-y-2">
            {widgets.map((widget, i) => {
              const title = widget.type === "stats_card" ? widget.statsConfig.title : widget.title;
              const isExpanded = editingId === widget.id;
              const span = "span" in widget ? (widget.span ?? 1) : undefined;

              return (
                <div key={widget.id} className="border border-border rounded-lg overflow-hidden">
                  {/* Header row */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted/50">
                    {/* Move */}
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <button type="button" onClick={() => i > 0 && onChange(move(widgets, i, i - 1))} disabled={i === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                      </button>
                      <button type="button" onClick={() => i < widgets.length - 1 && onChange(move(widgets, i, i + 1))} disabled={i === widgets.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>

                    <span className="text-base flex-shrink-0">{WIDGET_TYPE_ICONS[widget.type]}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{WIDGET_TYPE_LABELS[widget.type]}</span>
                    <span className="flex-1 text-sm font-medium text-foreground truncate">{title}</span>

                    {span !== undefined && (
                      <button
                        type="button"
                        onClick={() => toggleSpan(i)}
                        className="px-2 py-0.5 rounded border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                        title={span === 2 ? w.tooltipShrink : w.tooltipExpand}
                      >
                        {span === 2 ? w.span2 : w.span1}
                      </button>
                    )}

                    <button type="button" onClick={() => setEditingId(isExpanded ? null : widget.id)} className="px-2 py-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                      {isExpanded ? w.close : w.edit}
                    </button>

                    <button type="button" onClick={() => deleteWidget(i)} className="p-1 text-muted-foreground hover:text-red-500 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>

                  {/* Widget editor */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-3 border-t border-border space-y-3">
                      {widget.type === "chart" && (
                        <ChartEditor
                          widget={widget}
                          groupByOptions={groupByOptions}
                          onChange={(patch) => updateWidget(i, patch as Partial<WidgetDef>)}
                        />
                      )}
                      {widget.type === "stats_card" && (
                        <StatsCardEditor
                          widget={widget}
                          onChange={(patch) => updateWidget(i, patch as Partial<WidgetDef>)}
                        />
                      )}
                      {widget.type === "recent" && (
                        <RecentEditor
                          widget={widget}
                          onChange={(patch) => updateWidget(i, patch as Partial<WidgetDef>)}
                        />
                      )}
                      {widget.type === "info_card" && (
                        <InfoCardEditor
                          widget={widget}
                          onChange={(patch) => updateWidget(i, patch as Partial<WidgetDef>)}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add widget */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">{w.addWidget}</h2>
        <div className="flex flex-wrap gap-3">
          {(["chart", "stats_card", "recent", "info_card"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addWidget(type)}
              className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <span className="text-xl">{WIDGET_TYPE_ICONS[type]}</span>
              <span>{WIDGET_TYPE_LABELS[type]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-editors ── */

function ChartEditor({
  widget,
  groupByOptions,
  onChange,
}: {
  widget: Extract<WidgetDef, { type: "chart" }>;
  groupByOptions: { value: string; label: string }[];
  onChange: (patch: Partial<Extract<WidgetDef, { type: "chart" }>>) => void;
}) {
  const tr = useTranslations();
  const w = tr.admin.config.widgets;

  const CHART_TYPES: { value: ChartType; label: string }[] = [
    { value: "bar", label: w.chartBar },
    { value: "line", label: w.chartLine },
    { value: "area", label: w.chartArea },
    { value: "pie", label: w.chartPie },
  ];

  const DATE_RANGES = [
    { value: "7d", label: w.period7 },
    { value: "14d", label: w.period14 },
    { value: "30d", label: w.period30 },
    { value: "90d", label: w.period90 },
    { value: "all", label: w.periodAll },
  ];

  function updateChart(patch: Partial<typeof widget.chartConfig>) {
    onChange({ chartConfig: { ...widget.chartConfig, ...patch } });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{w.formTitle}</label>
        <input
          type="text"
          value={widget.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{w.chartType}</label>
          <select
            value={widget.chartConfig.type}
            onChange={(e) => updateChart({ type: e.target.value as ChartType })}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
          >
            {CHART_TYPES.map((ct) => (
              <option key={ct.value} value={ct.value}>{ct.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{w.groupBy}</label>
          <select
            value={widget.chartConfig.groupBy}
            onChange={(e) => updateChart({ groupBy: e.target.value })}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
          >
            {groupByOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{w.period}</label>
          <select
            value={widget.chartConfig.dateRange ?? "30d"}
            onChange={(e) => updateChart({ dateRange: e.target.value as "7d" | "14d" | "30d" | "90d" | "all" })}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
          >
            {DATE_RANGES.map((dr) => (
              <option key={dr.value} value={dr.value}>{dr.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{w.color}</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={widget.chartConfig.color ?? "#2563eb"}
              onChange={(e) => updateChart({ color: e.target.value })}
              className="w-10 h-9 rounded border border-border cursor-pointer"
            />
            <input
              type="text"
              value={widget.chartConfig.color ?? ""}
              onChange={(e) => updateChart({ color: e.target.value || undefined })}
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
              placeholder="#2563eb"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatsCardEditor({
  widget,
  onChange,
}: {
  widget: Extract<WidgetDef, { type: "stats_card" }>;
  onChange: (patch: Partial<Extract<WidgetDef, { type: "stats_card" }>>) => void;
}) {
  const tr = useTranslations();
  const w = tr.admin.config.widgets;

  const STATS_QUERIES: { value: StatsCardQuery; label: string }[] = [
    { value: "count_total", label: w.queryTotal },
    { value: "count_today", label: w.queryToday },
    { value: "count_week", label: w.queryWeek },
    { value: "count_overdue", label: w.queryOverdue },
    { value: "count_urgent", label: w.queryUrgent },
    { value: "count_done", label: w.queryDone },
  ];

  function updateStats(patch: Partial<typeof widget.statsConfig>) {
    onChange({ statsConfig: { ...widget.statsConfig, ...patch } });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{w.formTitle}</label>
        <input
          type="text"
          value={widget.statsConfig.title}
          onChange={(e) => updateStats({ title: e.target.value })}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{w.query}</label>
          <select
            value={typeof widget.statsConfig.query === "string" ? widget.statsConfig.query : "count_total"}
            onChange={(e) => updateStats({ query: e.target.value as StatsCardQuery })}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
          >
            {STATS_QUERIES.map((q) => (
              <option key={String(q.value)} value={String(q.value)}>{q.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{w.accent}</label>
          <select
            value={widget.statsConfig.accent ?? "blue"}
            onChange={(e) => updateStats({ accent: e.target.value as typeof widget.statsConfig.accent })}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
          >
            <option value="">{w.accentNone}</option>
            {ACCENT_OPTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{w.icon}</label>
        <input
          type="text"
          value={widget.statsConfig.icon}
          onChange={(e) => updateStats({ icon: e.target.value })}
          className="w-48 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
          placeholder={w.iconPlaceholder}
        />
      </div>
    </div>
  );
}

function RecentEditor({
  widget,
  onChange,
}: {
  widget: Extract<WidgetDef, { type: "recent" }>;
  onChange: (patch: Partial<Extract<WidgetDef, { type: "recent" }>>) => void;
}) {
  const tr = useTranslations();
  const w = tr.admin.config.widgets;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{w.formTitle}</label>
        <input
          type="text"
          value={widget.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{w.recentCount}</label>
        <input
          type="number"
          min={1}
          max={50}
          value={widget.limit ?? 5}
          onChange={(e) => onChange({ limit: parseInt(e.target.value) || 5 })}
          className="w-24 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
        />
      </div>
    </div>
  );
}

function InfoCardEditor({
  widget,
  onChange,
}: {
  widget: Extract<WidgetDef, { type: "info_card" }>;
  onChange: (patch: Partial<Extract<WidgetDef, { type: "info_card" }>>) => void;
}) {
  const tr = useTranslations();
  const w = tr.admin.config.widgets;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{w.formTitle}</label>
        <input
          type="text"
          value={widget.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{w.content}</label>
        <textarea
          value={widget.content}
          onChange={(e) => onChange({ content: e.target.value })}
          rows={3}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground resize-none"
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{w.accent}</label>
        <select
          value={widget.accent ?? ""}
          onChange={(e) => onChange({ accent: e.target.value || undefined })}
          className="w-32 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
        >
          <option value="">{w.accentNone}</option>
          {ACCENT_OPTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
