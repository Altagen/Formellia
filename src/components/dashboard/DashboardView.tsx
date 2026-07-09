"use client";

import { useState, useEffect, useMemo } from "react";
import type { Submission } from "@/lib/db/schema";
import type { FormConfig, StepDef, WidgetDef } from "@/types/config";
import { WidgetsGrid } from "@/components/dashboard/WidgetsGrid";
import { DashboardFilters } from "@/components/dashboard/DashboardFilters";
import { useTranslations } from "@/lib/context/LocaleContext";

export interface ChartFilter {
  status?: string;
  priority?: string;
}

/** Generic segment filter set by clicking a chart — any field/value pair */
interface SegmentFilter {
  field: string;
  value: string;
}

interface DashboardViewProps {
  /** UUID of the form instance — undefined means all submissions */
  formInstanceId?: string;
  /** UUID of the external dataset — used by widgets that need server-side data (e.g. email_quality) */
  dataSourceId?: string;
  /** Pre-fetched submissions for external data sources (bypasses API for table) */
  initialSubmissions?: Submission[];
  config: FormConfig;
  formSteps: StepDef[];
  customStatuses?: { value: string; label: string; color: string }[];
  otherWidgets: WidgetDef[];
  tableWidget?: WidgetDef & { type: "submissions_table" };
  hasTable: boolean;
  isExternalSource?: boolean;
  interactiveFilter?: boolean;
  searchFields?: string[];
  hiddenColumns?: string[];
  currentUserEmail?: string;
}

export function DashboardView({
  formInstanceId,
  dataSourceId,
  initialSubmissions,
  config,
  formSteps,
  customStatuses,
  otherWidgets,
  tableWidget,
  hasTable,
  isExternalSource,
  interactiveFilter = false,
  searchFields,
  hiddenColumns,
  currentUserEmail,
}: DashboardViewProps) {
  const tr = useTranslations();
  const p = tr.admin.config.pages;

  // Submissions for chart widgets — fetched client-side for native forms
  const [chartSubmissions, setChartSubmissions] = useState<Submission[]>(initialSubmissions ?? []);
  // Chart-pushed filter (from segment click)
  const [chartFilter, setChartFilter] = useState<ChartFilter>({});
  // Interactive segment filter — any field/value from chart click
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter | null>(null);

  // Build status label→value map from translations (locale-aware)
  const statusValues = useMemo(() => {
    const map: Record<string, string> = {
      [tr.status.pending]: "pending",
      [tr.status.in_progress]: "in_progress",
      [tr.status.done]: "done",
      [tr.status.waiting_user]: "waiting_user",
    };
    if (customStatuses) {
      for (const s of customStatuses) map[s.label] = s.value;
    }
    return map;
  }, [customStatuses, tr]);

  const priorityValues = useMemo<Record<string, string>>(() => ({
    [tr.priority.undefined]: "none",
    [tr.priority.green]: "green",
    [tr.priority.yellow]: "yellow",
    [tr.priority.orange]: "orange",
    [tr.priority.red]: "red",
  }), [tr]);

  // Fetch chart data from API for native forms
  useEffect(() => {
    if (isExternalSource || initialSubmissions) return;
    const params = new URLSearchParams({ limit: "10000" });
    if (formInstanceId) params.set("formInstanceId", formInstanceId);
    fetch(`/api/admin/submissions?${params}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data.rows)) setChartSubmissions(data.rows); })
      .catch(() => {});
  }, [formInstanceId, isExternalSource, initialSubmissions]);

  // Apply segment filter on top of chart submissions
  const filteredSubmissions = useMemo(() => {
    if (!interactiveFilter || !segmentFilter) return chartSubmissions;
    const { field, value } = segmentFilter;
    return chartSubmissions.filter(sub => {
      const v = field === "email" ? sub.email
        : field === "status" ? sub.status
        : field === "priority" ? sub.priority
        : field === "submittedAt" ? sub.submittedAt?.toString()
        : (sub.formData as Record<string, unknown>)?.[field];
      return String(v ?? "") === value;
    });
  }, [chartSubmissions, segmentFilter, interactiveFilter]);

  function handleSegmentClick(value: string, groupBy: string) {
    if (!value || !groupBy) return;

    // Interactive filter mode — toggle segment filter for any field
    if (interactiveFilter) {
      setSegmentFilter(prev =>
        prev?.field === groupBy && prev?.value === value ? null : { field: groupBy, value }
      );
      return;
    }

    // Legacy: only status/priority feed the table filter
    if (groupBy === "status") {
      const raw = statusValues[value] ?? value;
      setChartFilter(prev => prev.status === raw ? { ...prev, status: undefined } : { ...prev, status: raw });
    } else if (groupBy === "priority") {
      const raw = priorityValues[value] ?? value;
      setChartFilter(prev => prev.priority === raw ? { ...prev, priority: undefined } : { ...prev, priority: raw });
    }
  }

  return (
    <>
      {/* Active segment filter badge */}
      {interactiveFilter && segmentFilter && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 w-fit text-sm">
          <span className="text-muted-foreground text-xs">{p.interactiveFilterActive}</span>
          <span className="font-medium text-primary">{segmentFilter.field} = {segmentFilter.value}</span>
          <button type="button" onClick={() => setSegmentFilter(null)}
            className="ml-1 text-primary/60 hover:text-primary transition-colors">
            ✕
          </button>
        </div>
      )}

      {otherWidgets.length > 0 && (
        <WidgetsGrid
          widgets={otherWidgets}
          submissions={filteredSubmissions}
          formConfig={config}
          formSteps={formSteps}
          formInstanceId={formInstanceId}
          dataSourceId={dataSourceId}
          activeSegmentFilter={segmentFilter}
          onSegmentClick={handleSegmentClick}
        />
      )}

      {otherWidgets.length === 0 && !hasTable && (
        <div className="text-center py-16 text-muted-foreground text-sm border-2 border-dashed rounded-xl">
          {tr.admin.chart.noWidgets}<br />
          {tr.admin.chart.noWidgetsHint}
        </div>
      )}

      {hasTable && (
        <DashboardFilters
          formInstanceId={formInstanceId}
          submissions={initialSubmissions}
          formConfig={config}
          formSteps={formSteps}
          searchFields={tableWidget?.type === "submissions_table" ? tableWidget.searchFields : searchFields}
          hiddenColumns={tableWidget?.type === "submissions_table" ? tableWidget.hiddenColumns : hiddenColumns}
          isExternalSource={isExternalSource}
          customStatuses={customStatuses}
          currentUserEmail={currentUserEmail}
          chartFilter={chartFilter}
        />
      )}
    </>
  );
}
