"use client";

import { useState, useEffect } from "react";
import type {
  AdminPage,
  AdminFeatures,
  WidgetDef,
  StepDef,
  TableColumnDef,
  ChartType,
  StatsQueryDef,
  StatsQueryFilter,
  StatsFilterOp,
  StatsTableDef,
  StatsTableColumn,
} from "@/types/config";
import type { ExternalDataset } from "@/types/datasets";
import type { FormInstance } from "@/types/formInstance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Trash2, ChevronDown, ChevronUp, ChevronRight, Star, X, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";

interface PagesTabProps {
  pages: AdminPage[];
  defaultPage: string | undefined;
  tableColumns: TableColumnDef[];
  formSteps: StepDef[];
  formInstances?: FormInstance[];
  features?: AdminFeatures;
  onChangePages: (pages: AdminPage[]) => void;
  onChangeDefault: (slug: string | undefined) => void;
  onChangeColumns: (cols: TableColumnDef[]) => void;
  onChangeFeatures: (f: AdminFeatures) => void;
}

const WIDGET_TYPE_ICONS: Record<WidgetDef["type"], string> = {
  stats_card:            "📊",
  chart:                 "📈",
  stats_table:           "🗃️",
  recent:                "🕐",
  info_card:             "ℹ️",
  submissions_table:     "📋",
  traffic_chart:         "🚦",
  email_quality:         "📧",
  urgency_distribution:        "⏱️",
  funnel_chart:                "🔽",
  deadline_distribution:       "📅",
  filter_pills:                "🏷️",
};

const EMPTY_QUERY: StatsQueryDef = { fn: "count", filters: [], filterLogic: "and", scope: "all" };

function legacyToStructured(q: string): StatsQueryDef {
  switch (q) {
    case "count_total":   return { fn: "count", filters: [], filterLogic: "and", scope: "all" };
    case "count_today":   return { fn: "count", filters: [], filterLogic: "and", scope: "today" };
    case "count_week":    return { fn: "count", filters: [], filterLogic: "and", scope: "week" };
    case "count_done":    return { fn: "count", filters: [{ field: "status", op: "eq", value: "done" }], filterLogic: "and", scope: "all" };
    case "count_overdue": return { fn: "count", filters: [{ field: "status", op: "neq", value: "done" }], filterLogic: "and", scope: "all" };
    default:              return EMPTY_QUERY;
  }
}

const ACCENT_OPTIONS = ["blue", "red", "orange", "green", "purple", "gray"] as const;

function formatFieldKey(key: string): string {
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40) || "page";
}

export function PagesTab({ pages, defaultPage, tableColumns, formSteps, formInstances = [], features, onChangePages, onChangeDefault, onChangeColumns, onChangeFeatures }: PagesTabProps) {
  const tr = useTranslations();
  const p = tr.admin.config.pages;
  const w = tr.admin.config.widgets;

  const WIDGET_TYPE_LABELS: Record<WidgetDef["type"], string> = {
    stats_card:            w.typeStat,
    chart:                 w.typeChart,
    stats_table:           w.typeStatsTable,
    recent:                w.typeRecent,
    info_card:             w.typeInfo,
    submissions_table:     w.typeTable,
    traffic_chart:         w.typeTrafficChart,
    email_quality:         w.typeEmailQuality,
    urgency_distribution:        w.typeUrgencyDistribution,
    funnel_chart:                w.typeFunnelChart,
    deadline_distribution:       w.typeDeadlineDistribution,
    filter_pills:                w.typeFilterPills,
  };

  const CHART_TYPES: { value: ChartType; label: string }[] = [
    { value: "bar",  label: w.chartBar },
    { value: "line", label: w.chartLine },
    { value: "area", label: w.chartArea },
    { value: "pie",  label: w.chartPie },
  ];

  const DATE_RANGES = [
    { value: "7d",  label: w.period7 },
    { value: "14d", label: w.period14 },
    { value: "30d", label: w.period30 },
    { value: "90d", label: w.period90 },
    { value: "all", label: w.periodAll },
  ];

  const NATIVE_BUILTIN_FIELDS = [
    { value: "status",       label: tr.admin.config.columns.builtinStatus },
    { value: "priority",     label: tr.admin.config.columns.builtinPriority },
    { value: "email",        label: tr.admin.config.columns.builtinEmail },
    { value: "submittedAt",  label: tr.admin.config.columns.builtinSubmittedAt },
    { value: "dueDate", label: tr.admin.config.columns.builtinDeadline },
  ];

  function dedupFields<T extends { value: string }>(fields: T[]): T[] {
    const seen = new Set<string>();
    return fields.filter(f => seen.has(f.value) ? false : (seen.add(f.value), true));
  }

  function newStatsWidget(): WidgetDef {
    return { type: "stats_card", id: `w-${Date.now()}`, statsConfig: { id: `s-${Date.now()}`, title: w.defaultStatsTitle, icon: "file-text", query: "count_total", accent: "blue" } };
  }
  function newChartWidget(): WidgetDef {
    return { type: "chart", id: `w-${Date.now()}`, title: w.typeChart, span: 2, chartConfig: { id: `c-${Date.now()}`, title: w.typeChart, type: "area", groupBy: "date", dateRange: "30d" } };
  }
  function newRecentWidget(): WidgetDef {
    return { type: "recent", id: `w-${Date.now()}`, title: w.typeRecent, limit: 5 };
  }
  function newInfoWidget(): WidgetDef {
    return { type: "info_card", id: `w-${Date.now()}`, title: w.typeInfo, content: "" };
  }
  function newTableWidget(): WidgetDef {
    return { type: "submissions_table", id: `w-${Date.now()}`, title: w.typeTable };
  }
  function newStatsTableWidget(): WidgetDef {
    return {
      type: "stats_table",
      id: `w-${Date.now()}`,
      title: w.typeStatsTable,
      span: 2,
      tableConfig: {
        groupBy: "status",
        columns: [{ id: `col-${Date.now()}`, label: w.defaultCountLabel, fn: "count" }],
        sortDir: "desc",
        limit: 20,
        scope: "all",
        filters: [],
        filterLogic: "and",
      },
    };
  }

  function newTrafficChartWidget(): WidgetDef {
    return { type: "traffic_chart", id: `w-${Date.now()}`, title: w.typeTrafficChart, span: 2 };
  }
  function newEmailQualityWidget(): WidgetDef {
    return { type: "email_quality", id: `w-${Date.now()}`, title: w.typeEmailQuality };
  }
  function newUrgencyDistributionWidget(): WidgetDef {
    return { type: "urgency_distribution", id: `w-${Date.now()}`, title: w.typeUrgencyDistribution, span: 1 };
  }
  function newFunnelChartWidget(): WidgetDef {
    return { type: "funnel_chart", id: `w-${Date.now()}`, title: w.typeFunnelChart, span: 2, stepField: "step_reached" };
  }
  function newDeadlineDistributionWidget(): WidgetDef {
    return { type: "deadline_distribution", id: `w-${Date.now()}`, title: w.typeDeadlineDistribution, span: 1 };
  }
  function newFilterPillsWidget(): WidgetDef {
    return { type: "filter_pills", id: `w-${Date.now()}`, title: w.typeFilterPills, span: 1, field: "status" };
  }

  function getWidgetTitle(widget: WidgetDef): string {
    if (widget.type === "stats_card") return widget.statsConfig.title;
    if ("title" in widget && widget.title) return widget.title;
    return WIDGET_TYPE_LABELS[widget.type];
  }

  const [expandedPageId, setExpandedPageId] = useState<string | null>(pages[0]?.id ?? null);
  const [expandedWidgetId, setExpandedWidgetId] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<ExternalDataset[]>([]);
  // Cache of dataset field keys by dataSourceId
  const [dataSourceFields, setDataSourceFields] = useState<Record<string, string[]>>({});
  // Cache of unique values per field per dataSourceId
  const [dataSourceFieldValues, setDataSourceFieldValues] = useState<Record<string, Record<string, string[]>>>({});

  useEffect(() => {
    fetch("/api/admin/datasets")
      .then(r => r.ok ? r.json() : [])
      .then(setDatasets)
      .catch(() => {});
  }, []);

  // Fetch field names + all distinct values for a dataset when first needed.
  // Uses /field-values which runs a SQL DISTINCT across ALL records — no sampling cap.
  const expandedPageDsId = pages.find(pg => pg.id === expandedPageId)?.dataSourceId;
  useEffect(() => {
    const dsId = expandedPageDsId;
    if (!dsId || dataSourceFields[dsId]) return;
    fetch(`/api/admin/datasets/${dsId}/field-values`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { fields: string[]; values: Record<string, string[]> } | null) => {
        if (!data || data.fields.length === 0) return;
        setDataSourceFields(prev => ({ ...prev, [dsId]: data.fields }));
        setDataSourceFieldValues(prev => ({ ...prev, [dsId]: data.values }));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedPageId, expandedPageDsId]);

  const allFields = formSteps.flatMap(s => s.fields).filter(f => f.type !== "section_header");

  // Native field values for filter dropdowns (status/priority constants + form select/radio options)
  const nativeFieldValues: Record<string, string[]> = {
    status:   ["pending", "in_progress", "done", "waiting_user"],
    priority: ["none", "yellow", "orange", "red", "green"],
    ...Object.fromEntries(
      allFields
        .filter(f => (f.type === "select" || f.type === "radio") && f.options)
        .map(f => [f.dbKey ?? f.id, f.options!.map(o => o.value)])
    ),
  };
  const groupByOptions = [
    { value: "date",     label: w.groupDate },
    { value: "status",   label: w.groupStatus },
    { value: "priority", label: w.groupPriority },
    ...allFields.map(f => ({ value: f.dbKey ?? f.id, label: f.label })),
  ];

  function addPage() {
    if (pages.length >= 10) return;
    const id = `p-${Date.now()}`;
    const newPage: AdminPage = { id, title: "New page", slug: `page-${Date.now()}`, icon: "layout-dashboard", widgets: [] };
    onChangePages([...pages, newPage]);
    setExpandedPageId(id);
    setExpandedWidgetId(null);
  }

  function updatePage(id: string, patch: Partial<AdminPage>) {
    onChangePages(pages.map(pg => pg.id === id ? { ...pg, ...patch } : pg));
  }

  function deletePage(id: string) {
    const remaining = pages.filter(pg => pg.id !== id);
    onChangePages(remaining);
    if (defaultPage === pages.find(pg => pg.id === id)?.slug) {
      onChangeDefault(remaining[0]?.slug);
    }
    if (expandedPageId === id) {
      setExpandedPageId(remaining[0]?.id ?? null);
      setExpandedWidgetId(null);
    }
  }

  function movePage(id: string, dir: "up" | "down") {
    const i = pages.findIndex(pg => pg.id === id);
    if (dir === "up" && i > 0) {
      const copy = [...pages]; [copy[i-1], copy[i]] = [copy[i], copy[i-1]]; onChangePages(copy);
    } else if (dir === "down" && i < pages.length - 1) {
      const copy = [...pages]; [copy[i], copy[i+1]] = [copy[i+1], copy[i]]; onChangePages(copy);
    }
  }

  function addWidget(pageId: string, type: WidgetDef["type"]) {
    const factories: Record<WidgetDef["type"], () => WidgetDef> = {
      chart:                newChartWidget,
      stats_card:           newStatsWidget,
      stats_table:          newStatsTableWidget,
      recent:               newRecentWidget,
      info_card:            newInfoWidget,
      submissions_table:    newTableWidget,
      traffic_chart:        newTrafficChartWidget,
      email_quality:        newEmailQualityWidget,
      urgency_distribution:    newUrgencyDistributionWidget,
      funnel_chart:            newFunnelChartWidget,
      deadline_distribution:   newDeadlineDistributionWidget,
      filter_pills:            newFilterPillsWidget,
    };
    const widget = factories[type]();
    updatePage(pageId, { widgets: [...(pages.find(pg => pg.id === pageId)?.widgets ?? []), widget] });
    setExpandedWidgetId(widget.id);
  }

  function updateWidget(pageId: string, widgetId: string, patch: Partial<WidgetDef>) {
    const page = pages.find(pg => pg.id === pageId);
    if (!page) return;
    updatePage(pageId, {
      widgets: page.widgets.map(widget => widget.id === widgetId ? { ...widget, ...patch } as WidgetDef : widget),
    });
  }

  function removeWidget(pageId: string, widgetId: string) {
    const page = pages.find(pg => pg.id === pageId);
    if (!page) return;
    updatePage(pageId, { widgets: page.widgets.filter(widget => widget.id !== widgetId) });
    if (expandedWidgetId === widgetId) setExpandedWidgetId(null);
  }

  function moveWidget(pageId: string, widgetId: string, dir: "up" | "down") {
    const page = pages.find(pg => pg.id === pageId);
    if (!page) return;
    const i = page.widgets.findIndex(widget => widget.id === widgetId);
    const copy = [...page.widgets];
    if (dir === "up" && i > 0) { [copy[i-1], copy[i]] = [copy[i], copy[i-1]]; }
    else if (dir === "down" && i < copy.length - 1) { [copy[i], copy[i+1]] = [copy[i+1], copy[i]]; }
    updatePage(pageId, { widgets: copy });
  }

  function toggleWidgetSpan(pageId: string, widgetId: string) {
    const page = pages.find(pg => pg.id === pageId);
    if (!page) return;
    const widget = page.widgets.find(widget => widget.id === widgetId);
    if (!widget || widget.type === "stats_card" || widget.type === "submissions_table") return;
    const current = "span" in widget ? (widget.span ?? 1) : 1;
    updateWidget(pageId, widgetId, { span: current === 1 ? 2 : 1 } as Partial<WidgetDef>);
  }

  return (
    <div className="space-y-4">

      {/* ── Optional features ── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">{p.optionalFeatures}</h2>
        <p className="text-xs text-muted-foreground mb-4">
          {p.optionalFeaturesDesc}
        </p>
        <div className="space-y-3">
          {([
            {
              key: "globalView" as const,
              label: p.globalViewLabel,
              desc: p.globalViewDesc,
            },
            {
              key: "auditLog" as const,
              label: p.auditLogLabel,
              desc: p.auditLogDesc,
            },
          ] as const).map(({ key, label, desc }) => {
            const enabled = features?.[key] ?? false;
            return (
              <div key={key} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-foreground font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => onChangeFeatures({ ...features, [key]: !enabled })}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring/50 mt-0.5 ${
                    enabled ? "bg-blue-600" : "bg-muted"
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${enabled ? "translate-x-4" : "translate-x-0"}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{p.dashboardPages}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {p.dashboardPagesDesc}
            {pages.length >= 10 && <span className="text-destructive ml-1">{p.maxPages}</span>}
          </p>
        </div>
        <Button type="button" size="sm" onClick={addPage} disabled={pages.length >= 10} className="gap-1.5 shrink-0">
          <Plus className="w-4 h-4" />
          {p.addPage}
        </Button>
      </div>

{pages.length === 0 && (
        <div className="text-center py-10 border-2 border-dashed rounded-xl text-sm text-muted-foreground">
          {p.noPagesYet}
        </div>
      )}

      <div className="space-y-2">
        {pages.map((page, i) => {
          const isPageExpanded = expandedPageId === page.id;
          const isDefault = defaultPage === page.slug;
          const dsFields = page.dataSourceId ? (dataSourceFields[page.dataSourceId] ?? []) : [];
          const isExternal = !!page.dataSourceId && dsFields.length > 0;
          const dsFieldValues = isExternal ? (dataSourceFieldValues[page.dataSourceId!] ?? {}) : {};
          // Build groupBy options: dataset fields when external, form fields otherwise
          const builtinKeys = new Set(["date", "status"]);
          const pageGroupByOptions = isExternal
            ? [
                { value: "date",   label: "Date" },
                { value: "status", label: w.groupStatus },
                ...dsFields.filter(k => !builtinKeys.has(k)).map(k => ({ value: k, label: formatFieldKey(k) })),
              ]
            : groupByOptions;

          return (
            <div key={page.id} className={cn("rounded-xl border transition-all", isPageExpanded ? "border-primary/50 ring-1 ring-primary/20" : "border-border")}>
              {/* Page header */}
              <div className={cn("flex items-center gap-2 px-3 py-2.5 rounded-t-xl transition-colors", isPageExpanded && "bg-primary/[0.04]")}>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button type="button" onClick={() => movePage(page.id, "up")} disabled={i === 0}
                    className={cn("w-6 h-6 flex items-center justify-center rounded hover:text-foreground hover:bg-accent disabled:opacity-20 transition-colors", isPageExpanded ? "text-primary/60" : "text-muted-foreground")}>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => movePage(page.id, "down")} disabled={i === pages.length - 1}
                    className={cn("w-6 h-6 flex items-center justify-center rounded hover:text-foreground hover:bg-accent disabled:opacity-20 transition-colors", isPageExpanded ? "text-primary/60" : "text-muted-foreground")}>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button type="button" onClick={() => { setExpandedPageId(isPageExpanded ? null : page.id); setExpandedWidgetId(null); }} className="flex-1 min-w-0 text-left">
                  <p className={cn("text-sm font-medium truncate", isPageExpanded ? "text-primary" : "text-foreground")}>{page.title}</p>
                  <p className="text-xs text-muted-foreground font-mono">/admin/{page.slug} · {page.widgets.length} widget{page.widgets.length !== 1 ? "s" : ""}</p>
                </button>

                {isDefault && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium shrink-0">{p.defaultLabel}</span>
                )}
                {!isDefault && (
                  <button type="button" onClick={() => onChangeDefault(page.slug)} title={p.setDefault}
                    className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-amber-500 hover:bg-accent transition-colors shrink-0">
                    <Star className="w-3.5 h-3.5" />
                  </button>
                )}
                <button type="button" onClick={() => deletePage(page.id)} disabled={pages.length <= 1}
                  className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-20 transition-colors shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Expanded page editor */}
              {isPageExpanded && (
                <div className="border-t border-border/60 px-4 py-4 space-y-4 bg-muted/20 rounded-b-xl">
                  {/* Title + slug */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">{p.titleLabel}</label>
                      <Input value={page.title} onChange={e => updatePage(page.id, { title: e.target.value, slug: slugify(e.target.value) })} className="text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">{p.slugLabel}</label>
                      <Input value={page.slug} onChange={e => updatePage(page.id, { slug: slugify(e.target.value) })} className="text-sm font-mono" />
                    </div>
                  </div>

                  {/* Icon + Auto-refresh */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">{p.iconLabel}</label>
                      <Input value={page.icon ?? ""} onChange={e => updatePage(page.id, { icon: e.target.value || undefined })} placeholder="layout-dashboard, inbox, bar-chart-2…" className="text-sm font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">{p.autoRefresh}</label>
                      <select
                        value={page.refreshInterval ?? 0}
                        onChange={e => updatePage(page.id, { refreshInterval: parseInt(e.target.value, 10) || undefined })}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
                      >
                        <option value={0}>{p.refreshDisabled}</option>
                        <option value={30}>{p.refreshEvery30s}</option>
                        <option value={60}>{p.refreshEvery1m}</option>
                        <option value={300}>{p.refreshEvery5m}</option>
                      </select>
                    </div>
                  </div>

                  {/* Data source selector (3 options: all native, external dataset, form instance) */}
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                    <label className="text-xs font-medium text-muted-foreground shrink-0">{p.sourceLabel}</label>
                    <select
                      value={
                        page.formInstanceId
                          ? `form:${page.formInstanceId}`
                          : page.dataSourceId ?? ""
                      }
                      onChange={e => {
                        const v = e.target.value;
                        if (v === "") {
                          updatePage(page.id, { dataSourceId: undefined, formInstanceId: undefined });
                        } else if (v.startsWith("form:")) {
                          updatePage(page.id, { dataSourceId: undefined, formInstanceId: v.slice(5) });
                        } else {
                          updatePage(page.id, { dataSourceId: v, formInstanceId: undefined });
                        }
                      }}
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
                    >
                      <option value="">{p.allSubmissions}</option>
                      {formInstances.length > 0 && (
                        <optgroup label={p.byForm}>
                          {formInstances.map(inst => (
                            <option key={inst.id} value={`form:${inst.id}`}>
                              {inst.name} ({inst.slug === "/" ? "/" : `/${inst.slug}`})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {datasets.length > 0 && (
                        <optgroup label={p.externalSources}>
                          {datasets.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    {page.formInstanceId && (
                      <span className="text-xs text-muted-foreground">
                        {p.filterFormOnly}
                      </span>
                    )}
                    {page.dataSourceId && !page.formInstanceId && (
                      <span className="text-xs text-muted-foreground">
                        {p.filterExternalOnly}
                      </span>
                    )}
                  </div>

                  {/* Interactive filter toggle */}
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={page.interactiveFilter ?? false}
                      onChange={e => updatePage(page.id, { interactiveFilter: e.target.checked })}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                    <div>
                      <span className="text-xs font-medium text-foreground">{p.interactiveFilterLabel}</span>
                      <span className="text-xs text-muted-foreground ml-1.5">{p.interactiveFilterDesc}</span>
                    </div>
                  </label>

                  {/* Widgets list */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">{p.widgetsOnPage}</p>

                    {page.widgets.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">{p.noWidgets}</p>
                    ) : (
                      <div className="space-y-1.5 mb-3">
                        {page.widgets.map((widget, wi) => {
                          const isWidgetExpanded = expandedWidgetId === widget.id;
                          const span = "span" in widget ? (widget.span ?? 1) : undefined;
                          const hasSpanToggle = widget.type !== "stats_card" && widget.type !== "submissions_table";

                          return (
                            <div key={widget.id} className={cn("rounded-lg border overflow-hidden transition-all", isWidgetExpanded ? "border-primary/40 ring-1 ring-primary/15" : "border-border")}>
                              {/* Widget header row */}
                              <div className={cn("flex items-center gap-2 px-3 py-2 transition-colors", isWidgetExpanded ? "bg-primary/[0.04]" : "bg-card")}>
                                {/* Reorder */}
                                <div className="flex flex-col gap-0 shrink-0">
                                  <button type="button" onClick={() => moveWidget(page.id, widget.id, "up")} disabled={wi === 0}
                                    className={cn("w-5 h-4 flex items-center justify-center hover:text-foreground disabled:opacity-20 transition-colors", isWidgetExpanded ? "text-primary/60" : "text-muted-foreground")}>
                                    <ChevronUp className="w-3 h-3" />
                                  </button>
                                  <button type="button" onClick={() => moveWidget(page.id, widget.id, "down")} disabled={wi === page.widgets.length - 1}
                                    className={cn("w-5 h-4 flex items-center justify-center hover:text-foreground disabled:opacity-20 transition-colors", isWidgetExpanded ? "text-primary/60" : "text-muted-foreground")}>
                                    <ChevronDown className="w-3 h-3" />
                                  </button>
                                </div>

                                {/* Expand toggle */}
                                <button type="button" onClick={() => setExpandedWidgetId(isWidgetExpanded ? null : widget.id)}
                                  className="flex items-center gap-2 flex-1 min-w-0 text-left group">
                                  <ChevronRight className={cn("w-3.5 h-3.5 shrink-0 transition-transform", isWidgetExpanded ? "text-primary rotate-90" : "text-muted-foreground")} />
                                  <span className="text-sm shrink-0">{WIDGET_TYPE_ICONS[widget.type]}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">{WIDGET_TYPE_LABELS[widget.type]}</span>
                                  <span className="text-sm font-medium text-foreground truncate">{getWidgetTitle(widget)}</span>
                                </button>

                                {/* Span toggle */}
                                {hasSpanToggle && (
                                  <button type="button" onClick={() => toggleWidgetSpan(page.id, widget.id)}
                                    className="px-1.5 py-0.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                                    title={span === 2 ? p.spanToggleShrink : p.spanToggleExpand}>
                                    {span === 2 ? "×2" : "×1"}
                                  </button>
                                )}

                                {/* Delete */}
                                <button type="button" onClick={() => removeWidget(page.id, widget.id)}
                                  className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>

                              {/* Widget inline config */}
                              {isWidgetExpanded && (
                                <div className="border-t border-border/50 px-3 py-3 bg-muted/10 space-y-3">
                                  {widget.type === "chart" && (
                                    <ChartEditor
                                      widget={widget}
                                      groupByOptions={pageGroupByOptions}
                                      chartTypes={CHART_TYPES}
                                      dateRanges={DATE_RANGES}
                                      p={p}
                                      onChange={patch => updateWidget(page.id, widget.id, patch as Partial<WidgetDef>)}
                                    />
                                  )}
                                  {widget.type === "stats_card" && (
                                    <StatsCardEditor
                                      widget={widget}
                                      availableFields={dedupFields(isExternal
                                        ? dsFields.map(k => ({ value: k, label: formatFieldKey(k) }))
                                        : [...NATIVE_BUILTIN_FIELDS, ...formSteps.flatMap(s => s.fields).filter(f => f.type !== "section_header").map(f => ({ value: f.dbKey ?? f.id, label: f.label }))]
                                      )}
                                      fieldValues={isExternal ? dsFieldValues : nativeFieldValues}
                                      p={p}
                                      onChange={patch => updateWidget(page.id, widget.id, patch as Partial<WidgetDef>)}
                                    />
                                  )}
                                  {widget.type === "stats_table" && (
                                    <StatsTableEditor
                                      widget={widget}
                                      availableFields={dedupFields(isExternal
                                        ? dsFields.map(k => ({ value: k, label: formatFieldKey(k) }))
                                        : [...NATIVE_BUILTIN_FIELDS, ...formSteps.flatMap(s => s.fields).filter(f => f.type !== "section_header").map(f => ({ value: f.dbKey ?? f.id, label: f.label }))]
                                      )}
                                      fieldValues={isExternal ? dsFieldValues : nativeFieldValues}
                                      p={p}
                                      onChange={patch => updateWidget(page.id, widget.id, patch as Partial<WidgetDef>)}
                                    />
                                  )}
                                  {widget.type === "recent" && (
                                    <RecentEditor
                                      widget={widget}
                                      p={p}
                                      onChange={patch => updateWidget(page.id, widget.id, patch as Partial<WidgetDef>)}
                                    />
                                  )}
                                  {widget.type === "info_card" && (
                                    <InfoCardEditor
                                      widget={widget}
                                      p={p}
                                      onChange={patch => updateWidget(page.id, widget.id, patch as Partial<WidgetDef>)}
                                    />
                                  )}
                                  {widget.type === "submissions_table" && (
                                    <SubmissionsTableEditor
                                      widget={widget}
                                      formSteps={formSteps}
                                      tableColumns={tableColumns}
                                      onChangeColumns={onChangeColumns}
                                      dataSourceFields={dsFields.length > 0 ? dsFields : undefined}
                                      p={p}
                                      onChange={patch => updateWidget(page.id, widget.id, patch as Partial<WidgetDef>)}
                                    />
                                  )}
                                  {widget.type === "filter_pills" && (
                                    <div className="space-y-3">
                                      <div>
                                        <label className="block text-xs text-muted-foreground mb-1.5">{w.filterPillsFieldLabel}</label>
                                        <select
                                          value={widget.field}
                                          onChange={e => updateWidget(page.id, widget.id, { field: e.target.value } as Partial<WidgetDef>)}
                                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
                                        >
                                          {(isExternal
                                            ? dsFields.map(k => ({ value: k, label: formatFieldKey(k) }))
                                            : dedupFields([...NATIVE_BUILTIN_FIELDS, ...formSteps.flatMap(s => s.fields).filter(f => f.type !== "section_header").map(f => ({ value: f.dbKey ?? f.id, label: f.label }))])
                                          ).map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add widget buttons */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {(["stats_card", "stats_table", "chart", "submissions_table", "recent", "info_card", "filter_pills"] as WidgetDef["type"][]).map(type => (
                        <button key={type} type="button" onClick={() => addWidget(page.id, type)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-ring transition-colors">
                          <Plus className="w-3 h-3" />
                          {WIDGET_TYPE_LABELS[type]}
                        </button>
                      ))}
                    </div>
                    {/* Analytics widgets — only useful when page is scoped to a form instance */}
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs text-muted-foreground self-center">{w.analyticsGroup} :</span>
                      {(["traffic_chart", "email_quality", "urgency_distribution", "funnel_chart"] as WidgetDef["type"][]).map(type => (
                        <button key={type} type="button" onClick={() => addWidget(page.id, type)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-blue-300 dark:border-blue-800 text-xs text-blue-600 dark:text-blue-400 hover:border-blue-500 transition-colors">
                          <Plus className="w-3 h-3" />
                          {WIDGET_TYPE_LABELS[type]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Sub-editors ─────────────────────────────────────────── */

type PagesTranslations = ReturnType<typeof useTranslations>["admin"]["config"]["pages"];

const BUILTIN_LABELS: Record<string, string> = {
  email:        "Email",
  status:       "Status",
  priority:     "Priority",
  dueDate: "Deadline",
  submittedAt:  "Submitted at",
};

function SubmissionsTableEditor({
  widget,
  formSteps,
  tableColumns,
  onChangeColumns,
  dataSourceFields,
  p,
  onChange,
}: {
  widget: Extract<WidgetDef, { type: "submissions_table" }>;
  formSteps: StepDef[];
  tableColumns: TableColumnDef[];
  onChangeColumns: (cols: TableColumnDef[]) => void;
  dataSourceFields?: string[];
  p: PagesTranslations;
  onChange: (patch: Partial<Extract<WidgetDef, { type: "submissions_table" }>>) => void;
}) {
  const isExternal = !!dataSourceFields && dataSourceFields.length > 0;

  // Reserved builtins — form fields with these IDs are NOT added again to avoid duplicates.
  const BUILTIN_SOURCES = new Set(["email", "status", "priority", "dueDate", "submittedAt"]);

  // Unique form fields (excluding section_header and builtin-shadowed IDs).
  const formFieldColumns = formSteps
    .flatMap(s => s.fields)
    .filter(f => f.type !== "section_header" && !BUILTIN_SOURCES.has(f.dbKey ?? f.id))
    .map(f => ({ source: f.dbKey ?? f.id, label: f.label }));

  // For external sources: derive available fields from dataset keys.
  // For native: builtins (excl. submittedAt) + unique form fields.
  const availableFields = isExternal
    ? dataSourceFields
        .filter(k => k !== "submittedAt")
        .map(k => ({ source: k, label: formatFieldKey(k) }))
    : [
        { source: "email",        label: BUILTIN_LABELS.email },
        { source: "status",       label: BUILTIN_LABELS.status },
        { source: "priority",     label: BUILTIN_LABELS.priority },
        { source: "dueDate", label: BUILTIN_LABELS.dueDate },
        ...formFieldColumns,
      ];

  // Full column list for the table columns section (includes submittedAt, deduped).
  const allNativeColumns = isExternal
    ? (dataSourceFields ?? []).map(k => ({ key: k, label: formatFieldKey(k) }))
    : [
        { key: "submittedAt",  label: BUILTIN_LABELS.submittedAt },
        { key: "email",        label: BUILTIN_LABELS.email },
        { key: "status",       label: BUILTIN_LABELS.status },
        { key: "priority",     label: BUILTIN_LABELS.priority },
        { key: "dueDate", label: BUILTIN_LABELS.dueDate },
        ...formFieldColumns.map(f => ({ key: f.source, label: f.label })),
      ];

  // Default = all available columns active (fully config-driven, no hardcoded "email")
  const currentFields = widget.searchFields ?? availableFields.map(f => f.source);

  function toggleField(source: string) {
    const next = currentFields.includes(source)
      ? currentFields.filter(f => f !== source)
      : [...currentFields, source];
    onChange({ searchFields: next.length > 0 ? next : [] });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">{p.tableTitleLabel}</label>
        <Input
          value={widget.title ?? ""}
          onChange={e => onChange({ title: e.target.value || undefined })}
          placeholder="List"
          className="text-sm"
        />
      </div>

      <div className="pt-2 border-t border-border/50">
        <p className="text-xs font-semibold text-foreground mb-1">{p.searchFieldsTitle}</p>
        <p className="text-xs text-muted-foreground mb-3">
          {p.searchFieldsDesc}
        </p>
        {availableFields.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">{p.noVisibleColumns}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availableFields.map(field => {
              const active = currentFields.includes(field.source);
              return (
                <button
                  key={field.source}
                  type="button"
                  onClick={() => toggleField(field.source)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
                    active
                      ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                      : "bg-background border-border text-muted-foreground hover:border-blue-400 hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-950/30"
                  )}
                >
                  {active && (
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {field.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-border/50">
        <p className="text-xs font-semibold text-foreground mb-1">{p.tableColumnsTitle}</p>
        <p className="text-xs text-muted-foreground mb-3">
          {isExternal
            ? p.tableColumnsExternal
            : p.tableColumnsNative}
        </p>
        <div className="space-y-1">
          {allNativeColumns.map(({ key, label }) => {
            const hidden = isExternal
              ? (widget.hiddenColumns ?? []).includes(key)
              : !!tableColumns.find(c => c.source === key)?.hidden;
            return (
              <div
                key={key}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg border transition-all",
                  hidden ? "opacity-50 bg-muted/20 border-border/50" : "bg-card border-border"
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isExternal) {
                      const current = widget.hiddenColumns ?? [];
                      onChange({ hiddenColumns: hidden ? current.filter(k => k !== key) : [...current, key] });
                    } else {
                      // Update or insert the column entry in tableColumns
                      const exists = tableColumns.some(c => c.source === key);
                      if (exists) {
                        onChangeColumns(tableColumns.map(c => c.source === key ? { ...c, hidden: !hidden } : c));
                      } else {
                        onChangeColumns([...tableColumns, { id: key, source: key, label, hidden: true }]);
                      }
                    }
                  }}
                  title={hidden ? p.showColumn : p.hideColumn}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                >
                  {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <p className={cn("text-sm flex-1 truncate", hidden ? "line-through text-muted-foreground" : "text-foreground")}>
                  {label}
                </p>
                <span className="text-xs text-muted-foreground font-mono shrink-0">{key}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChartEditor({
  widget,
  groupByOptions,
  chartTypes,
  dateRanges,
  p,
  onChange,
}: {
  widget: Extract<WidgetDef, { type: "chart" }>;
  groupByOptions: { value: string; label: string }[];
  chartTypes: { value: ChartType; label: string }[];
  dateRanges: { value: string; label: string }[];
  p: PagesTranslations;
  onChange: (patch: Partial<Extract<WidgetDef, { type: "chart" }>>) => void;
}) {
  function updateChart(patch: Partial<typeof widget.chartConfig>) {
    onChange({ chartConfig: { ...widget.chartConfig, ...patch } });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{p.chartTitleLabel}</label>
        <Input value={widget.title} onChange={e => onChange({ title: e.target.value })} className="text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{p.chartType}</label>
          <select value={widget.chartConfig.type} onChange={e => updateChart({ type: e.target.value as ChartType })}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
            {chartTypes.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{p.groupBy}</label>
          <select value={widget.chartConfig.groupBy} onChange={e => updateChart({ groupBy: e.target.value })}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
            {groupByOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{p.periodLabel}</label>
          <select value={widget.chartConfig.dateRange ?? "30d"} onChange={e => updateChart({ dateRange: e.target.value as "7d" | "14d" | "30d" | "90d" | "all" })}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
            {dateRanges.map(dr => <option key={dr.value} value={dr.value}>{dr.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{p.color}</label>
          <div className="flex items-center gap-2">
            <input type="color" value={widget.chartConfig.color ?? "#2563eb"} onChange={e => updateChart({ color: e.target.value })}
              className="w-9 h-9 rounded border border-input cursor-pointer p-0.5" />
            <Input value={widget.chartConfig.color ?? ""} onChange={e => updateChart({ color: e.target.value || undefined })}
              placeholder="#2563eb" className="text-sm font-mono flex-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

const OP_LABELS: Record<StatsFilterOp, string> = {
  eq: "=", neq: "≠", gt: ">", lt: "<", gte: "≥", lte: "≤", contains: "contient",
};

const SCOPE_LABELS: Record<StatsQueryDef["scope"], string> = {
  all: "All", today: "Today", week: "This week", month: "This month",
};

const FN_LABELS: Record<StatsQueryDef["fn"], string> = {
  count: "Count", sum: "Sum", avg: "Average", min: "Minimum", max: "Maximum",
};

const TABLE_FN_LABELS: Record<StatsTableColumn["fn"], string> = {
  count: "Count", sum: "Sum", avg: "Average", min: "Minimum", max: "Maximum",
  first: "Value",
};

function StatsTableEditor({
  widget,
  availableFields,
  fieldValues,
  p,
  onChange,
}: {
  widget: Extract<WidgetDef, { type: "stats_table" }>;
  availableFields: { value: string; label: string }[];
  fieldValues: Record<string, string[]>;
  p: PagesTranslations;
  onChange: (patch: Partial<Extract<WidgetDef, { type: "stats_table" }>>) => void;
}) {
  const cfg = widget.tableConfig;

  function updateConfig(patch: Partial<StatsTableDef>) {
    onChange({ tableConfig: { ...cfg, ...patch } });
  }
  function addColumn() {
    const col: StatsTableColumn = { id: `col-${Date.now()}`, label: "Nb", fn: "count" };
    updateConfig({ columns: [...cfg.columns, col] });
  }
  function removeColumn(id: string) {
    updateConfig({ columns: cfg.columns.filter(c => c.id !== id) });
    if (cfg.sortColumnId === id) updateConfig({ sortColumnId: undefined });
  }
  function updateColumn(id: string, patch: Partial<StatsTableColumn>) {
    updateConfig({ columns: cfg.columns.map(c => c.id === id ? { ...c, ...patch } : c) });
  }
  function addFilter() {
    const field = availableFields[0]?.value ?? "";
    updateConfig({ filters: [...(cfg.filters ?? []), { field, op: "eq", value: "" }] });
  }
  function removeFilter(i: number) {
    updateConfig({ filters: (cfg.filters ?? []).filter((_, j) => j !== i) });
  }
  function updateFilter(i: number, patch: Partial<StatsQueryFilter>) {
    updateConfig({ filters: (cfg.filters ?? []).map((f, j) => j === i ? { ...f, ...patch } : f) });
  }
  const filters = cfg.filters ?? [];

  return (
    <div className="space-y-3">
      {/* Title */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{p.titleWidgetLabel}</label>
        <Input value={widget.title ?? ""} onChange={e => onChange({ title: e.target.value || undefined })} className="text-sm" />
      </div>

      {/* Group by */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{p.groupBy}</label>
          <select value={cfg.groupBy} onChange={e => updateConfig({ groupBy: e.target.value })}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
            {availableFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            {p.groupByAlias} <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <Input
            value={cfg.groupByLabel ?? ""}
            onChange={e => updateConfig({ groupByLabel: e.target.value || undefined })}
            placeholder={availableFields.find(f => f.value === cfg.groupBy)?.label ?? ""}
            className="text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{p.periodLabel}</label>
          <select value={cfg.scope ?? "all"} onChange={e => updateConfig({ scope: e.target.value as StatsTableDef["scope"] })}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
            {(Object.entries(SCOPE_LABELS) as [StatsQueryDef["scope"], string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Metric columns */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">{p.columns}</label>
        </div>
        {cfg.columns.map(col => (
          <div key={col.id} className="flex items-center gap-1.5">
            <Input value={col.label} onChange={e => updateColumn(col.id, { label: e.target.value })}
              placeholder="Label" className="h-8 text-xs w-24 shrink-0" />
            <select value={col.fn} onChange={e => updateColumn(col.id, { fn: e.target.value as StatsTableColumn["fn"], field: e.target.value === "count" ? undefined : col.field })}
              className="h-8 text-xs rounded-md border border-input bg-background px-1.5 w-24 shrink-0 focus:outline-none focus:ring-[3px] focus:ring-ring/50">
              {(Object.entries(TABLE_FN_LABELS) as [StatsTableColumn["fn"], string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            {col.fn !== "count" && (
              <select value={col.field ?? ""} onChange={e => updateColumn(col.id, { field: e.target.value || undefined })}
                className="h-8 text-xs rounded-md border border-input bg-background px-1.5 flex-1 min-w-0 focus:outline-none focus:ring-[3px] focus:ring-ring/50">
                <option value="">{p.chooseColumn}</option>
                {availableFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            )}
            {col.fn === "count" && <span className="flex-1" />}
            <button type="button" onClick={() => removeColumn(col.id)}
              className="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button type="button" onClick={addColumn}
          className="text-xs text-blue-600 hover:text-blue-700 transition-colors">
          {p.addColumnLabel}
        </button>
      </div>

      {/* Sort + limit */}
      {cfg.columns.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{p.sortByLabel}</label>
            <select value={cfg.sortColumnId ?? ""} onChange={e => updateConfig({ sortColumnId: e.target.value || undefined })}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
              <option value="">{p.sortNone}</option>
              {cfg.columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{p.sortOrder}</label>
            <select value={cfg.sortDir ?? "desc"} onChange={e => updateConfig({ sortDir: e.target.value as "asc" | "desc" })}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
              <option value="desc">{p.sortDesc}</option>
              <option value="asc">{p.sortAsc}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{p.topNRows}</label>
            <input type="number" min={1} max={500} value={cfg.limit ?? ""}
              onChange={e => updateConfig({ limit: parseInt(e.target.value) || undefined })}
              placeholder={p.allRows}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50" />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-2 pt-1 border-t border-border/50">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">{p.filtersLabel}</label>
          {filters.length >= 2 && (
            <select value={cfg.filterLogic ?? "and"} onChange={e => updateConfig({ filterLogic: e.target.value as "and" | "or" })}
              className="h-7 text-xs rounded-md border border-input bg-background px-2 focus:outline-none">
              <option value="and">{p.filtersAll}</option>
              <option value="or">{p.filtersAny}</option>
            </select>
          )}
        </div>
        {filters.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select value={f.field} onChange={e => updateFilter(i, { field: e.target.value })}
              className="h-8 text-xs rounded-md border border-input bg-background px-1.5 flex-1 min-w-0 focus:outline-none focus:ring-[3px] focus:ring-ring/50">
              {availableFields.map(af => <option key={af.value} value={af.value}>{af.label}</option>)}
            </select>
            <select value={f.op} onChange={e => updateFilter(i, { op: e.target.value as StatsFilterOp })}
              className="h-8 text-xs rounded-md border border-input bg-background px-1 w-20 shrink-0 focus:outline-none focus:ring-[3px] focus:ring-ring/50">
              {(Object.entries(OP_LABELS) as [StatsFilterOp, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            {getFilterValueInput(f, fieldValues, patch => updateFilter(i, patch))}
            <button type="button" onClick={() => removeFilter(i)}
              className="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button type="button" onClick={addFilter}
          className="text-xs text-blue-600 hover:text-blue-700 transition-colors">
          {p.addFilter}
        </button>
      </div>
    </div>
  );
}

const DATE_FIELD_RE = /date|_at$|^at$/i;
const MAX_DROPDOWN_VALUES = 50;

function getFilterValueInput(
  f: StatsQueryFilter,
  fieldValues: Record<string, string[]>,
  onUpdate: (patch: Partial<StatsQueryFilter>) => void,
): React.ReactNode {
  const vals = fieldValues[f.field];
  if (vals && vals.length > 0 && vals.length <= MAX_DROPDOWN_VALUES) {
    return (
      <select
        value={f.value}
        onChange={e => onUpdate({ value: e.target.value })}
        className="h-8 text-xs rounded-md border border-input bg-background px-1.5 flex-1 min-w-0 focus:outline-none focus:ring-[3px] focus:ring-ring/50"
      >
        <option value="">— value —</option>
        {vals.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  }
  if (DATE_FIELD_RE.test(f.field)) {
    return (
      <input
        type="date"
        value={f.value}
        onChange={e => onUpdate({ value: e.target.value })}
        className="h-8 text-xs rounded-md border border-input bg-background px-1.5 flex-1 min-w-0 focus:outline-none focus:ring-[3px] focus:ring-ring/50"
      />
    );
  }
  return (
    <Input value={f.value} onChange={e => onUpdate({ value: e.target.value })}
      placeholder="value" className="h-8 text-xs flex-1 min-w-0" />
  );
}

function StatsCardEditor({
  widget,
  availableFields,
  fieldValues,
  p,
  onChange,
}: {
  widget: Extract<WidgetDef, { type: "stats_card" }>;
  availableFields: { value: string; label: string }[];
  fieldValues: Record<string, string[]>;
  p: PagesTranslations;
  onChange: (patch: Partial<Extract<WidgetDef, { type: "stats_card" }>>) => void;
}) {
  const stats = widget.statsConfig;
  const query: StatsQueryDef = typeof stats.query === "object" ? stats.query : legacyToStructured(stats.query as string);

  function updateStats(patch: Partial<typeof stats>) {
    onChange({ statsConfig: { ...stats, ...patch } });
  }
  function updateQuery(patch: Partial<StatsQueryDef>) {
    updateStats({ query: { ...query, ...patch } });
  }
  function addFilter() {
    const field = availableFields[0]?.value ?? "";
    updateQuery({ filters: [...query.filters, { field, op: "eq", value: "" }] });
  }
  function removeFilter(i: number) {
    updateQuery({ filters: query.filters.filter((_, j) => j !== i) });
  }
  function updateFilter(i: number, patch: Partial<StatsQueryFilter>) {
    updateQuery({ filters: query.filters.map((f, j) => j === i ? { ...f, ...patch } : f) });
  }

  return (
    <div className="space-y-3">
      {/* Title */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{p.titleWidgetLabel}</label>
        <Input value={stats.title} onChange={e => updateStats({ title: e.target.value })} className="text-sm" />
      </div>

      {/* Function + field */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{p.functionLabel}</label>
          <select value={query.fn} onChange={e => updateQuery({ fn: e.target.value as StatsQueryDef["fn"] })}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
            {(Object.entries(FN_LABELS) as [StatsQueryDef["fn"], string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        {query.fn !== "count" && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{p.fieldLabel}</label>
            <select value={query.field ?? ""} onChange={e => updateQuery({ field: e.target.value || undefined })}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
              <option value="">{p.chooseField}</option>
              {availableFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Period */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{p.periodLabel}</label>
        <select value={query.scope} onChange={e => updateQuery({ scope: e.target.value as StatsQueryDef["scope"] })}
          className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
          {(Object.entries(SCOPE_LABELS) as [StatsQueryDef["scope"], string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">{p.filtersLabel}</label>
          {query.filters.length >= 2 && (
            <select value={query.filterLogic} onChange={e => updateQuery({ filterLogic: e.target.value as "and" | "or" })}
              className="h-7 text-xs rounded-md border border-input bg-background px-2 focus:outline-none">
              <option value="and">{p.filtersAll}</option>
              <option value="or">{p.filtersAny}</option>
            </select>
          )}
        </div>
        {query.filters.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select value={f.field} onChange={e => updateFilter(i, { field: e.target.value })}
              className="h-8 text-xs rounded-md border border-input bg-background px-1.5 flex-1 min-w-0 focus:outline-none focus:ring-[3px] focus:ring-ring/50">
              {availableFields.map(af => <option key={af.value} value={af.value}>{af.label}</option>)}
            </select>
            <select value={f.op} onChange={e => updateFilter(i, { op: e.target.value as StatsFilterOp })}
              className="h-8 text-xs rounded-md border border-input bg-background px-1 w-20 shrink-0 focus:outline-none focus:ring-[3px] focus:ring-ring/50">
              {(Object.entries(OP_LABELS) as [StatsFilterOp, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            {getFilterValueInput(f, fieldValues, patch => updateFilter(i, patch))}
            <button type="button" onClick={() => removeFilter(i)}
              className="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button type="button" onClick={addFilter}
          className="text-xs text-blue-600 hover:text-blue-700 transition-colors">
          {p.addFilter}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/50">
        {/* Format */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{p.formatLabel}</label>
          <select value={stats.format ?? "number"} onChange={e => updateStats({ format: e.target.value as "number" | "currency" })}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
            <option value="number">{p.formatNumber}</option>
            <option value="currency">{p.formatCurrency}</option>
          </select>
        </div>
        {/* Currency symbol — only shown when format = currency */}
        {stats.format === "currency" && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{p.currencySymbolLabel}</label>
            <select value={stats.currencySymbol ?? "€"} onChange={e => updateStats({ currencySymbol: e.target.value })}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
              <option value="€">€ EUR</option>
              <option value="$">$ USD</option>
              <option value="£">£ GBP</option>
              <option value="CHF">CHF</option>
              <option value="¥">¥ JPY</option>
              <option value="CAD $">CAD $</option>
              <option value="AUD $">AUD $</option>
              <option value="kr">kr SEK</option>
              <option value="₹">₹ INR</option>
              <option value="₩">₩ KRW</option>
            </select>
          </div>
        )}
        {/* Accent */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{p.accentLabel}</label>
          <select value={widget.statsConfig.accent ?? "blue"} onChange={e => updateStats({ accent: e.target.value as typeof widget.statsConfig.accent })}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
            {ACCENT_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{p.iconLabel}</label>
        <Input value={widget.statsConfig.icon} onChange={e => updateStats({ icon: e.target.value })}
          placeholder="hash, clock, alert-circle…" className="text-sm font-mono w-48" />
      </div>
    </div>
  );
}

function RecentEditor({
  widget,
  p,
  onChange,
}: {
  widget: Extract<WidgetDef, { type: "recent" }>;
  p: PagesTranslations;
  onChange: (patch: Partial<Extract<WidgetDef, { type: "recent" }>>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{p.titleWidgetLabel}</label>
        <Input value={widget.title} onChange={e => onChange({ title: e.target.value })} className="text-sm" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{p.recentCount}</label>
        <input type="number" min={1} max={50} value={widget.limit ?? 5}
          onChange={e => onChange({ limit: parseInt(e.target.value) || 5 })}
          className="w-24 h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50" />
      </div>
    </div>
  );
}

function InfoCardEditor({
  widget,
  p,
  onChange,
}: {
  widget: Extract<WidgetDef, { type: "info_card" }>;
  p: PagesTranslations;
  onChange: (patch: Partial<Extract<WidgetDef, { type: "info_card" }>>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{p.titleWidgetLabel}</label>
        <Input value={widget.title} onChange={e => onChange({ title: e.target.value })} className="text-sm" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{p.contentLabel}</label>
        <textarea value={widget.content} onChange={e => onChange({ content: e.target.value })} rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50 resize-none" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{p.accentLabel}</label>
        <select value={widget.accent ?? ""} onChange={e => onChange({ accent: e.target.value || undefined })}
          className="w-32 h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
          <option value="">{p.accentNone}</option>
          {ACCENT_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
    </div>
  );
}
