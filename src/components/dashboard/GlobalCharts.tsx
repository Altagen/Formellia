"use client";

import { DynamicChart } from "./DynamicChart";
import type { Submission } from "@/lib/db/schema";
import type { ChartDef } from "@/types/config";
import { useTranslations } from "@/lib/context/LocaleContext";

export function GlobalCharts({ submissions }: { submissions: Submission[] }) {
  const tr = useTranslations();
  const CHARTS: ChartDef[] = [
    { id: "global-daily",    title: tr.admin.chart.daily,    type: "line", groupBy: "date",     dateRange: "30d", color: "#2563eb" },
    { id: "global-status",   title: tr.admin.chart.byStatus, type: "bar",  groupBy: "status",   color: "#7c3aed" },
    { id: "global-priority", title: tr.admin.chart.byPriority, type: "pie",  groupBy: "priority" },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {CHARTS.map(chart => (
        <div key={chart.id} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">{chart.title}</h2>
          </div>
          <div className="p-4">
            <DynamicChart chart={chart} submissions={submissions} />
          </div>
        </div>
      ))}
    </div>
  );
}
