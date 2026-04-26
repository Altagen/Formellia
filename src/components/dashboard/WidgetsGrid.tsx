"use client";

import type { WidgetDef, FormConfig, StepDef } from "@/types/config";
import type { Submission } from "@/lib/db/schema";
import { DynamicWidget } from "./DynamicWidget";

interface WidgetsGridProps {
  widgets: WidgetDef[];
  submissions: Submission[];
  formConfig?: FormConfig;
  formSteps?: StepDef[];
  formInstanceId?: string;
  dataSourceId?: string;
  activeSegmentFilter?: { field: string; value: string } | null;
  onSegmentClick?: (value: string, groupBy: string) => void;
}

/**
 * Renders a responsive widget grid.
 *
 * Layout rules:
 *   stats_card          → always 1 col out of 2 on mobile, 1/3 on sm, 1/6 on lg
 *   chart span:2        → full width on all breakpoints
 *   chart span:1        → full width on mobile, half on sm+
 *   recent / info_card  → full width on mobile, half on sm+
 *
 * Widgets are rendered in declared order.
 * stats_cards are automatically grouped into a dedicated row.
 */
export function WidgetsGrid({ widgets, submissions, formConfig, formSteps, formInstanceId, dataSourceId, activeSegmentFilter, onSegmentClick }: WidgetsGridProps) {
  // Filter out submissions_table — handled separately by the page
  const renderable = widgets.filter(w => w.type !== "submissions_table");
  if (renderable.length === 0) return null;

  // Split into stats cards (grouped) and other widgets (in order)
  const statsCards = renderable.filter(w => w.type === "stats_card");
  const others     = renderable.filter(w => w.type !== "stats_card");

  return (
    <div className="space-y-4">
      {/* Stats cards row — uniform small cards */}
      {statsCards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {statsCards.map(widget => (
            <DynamicWidget
              key={widget.id}
              widget={widget}
              submissions={submissions}
              formConfig={formConfig}
              formSteps={formSteps}
              formInstanceId={formInstanceId}
              dataSourceId={dataSourceId}
              activeSegmentFilter={activeSegmentFilter}
              onSegmentClick={onSegmentClick}
            />
          ))}
        </div>
      )}

      {/* Other widgets — each rendered with its own width */}
      {others.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {others.map(widget => {
            const span = "span" in widget ? (widget.span ?? 1) : 1;
            return (
              <div
                key={widget.id}
                className={span === 2 ? "sm:col-span-2" : "col-span-1"}
              >
                <DynamicWidget
                  widget={widget}
                  submissions={submissions}
                  formConfig={formConfig}
                  formSteps={formSteps}
                  formInstanceId={formInstanceId}
                  dataSourceId={dataSourceId}
                  activeSegmentFilter={activeSegmentFilter}
                  onSegmentClick={onSegmentClick}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
