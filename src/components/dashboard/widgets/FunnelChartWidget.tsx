"use client";

import type { Submission } from "@/lib/db/schema";
import { useTranslations } from "@/lib/context/LocaleContext";

interface FunnelChartWidgetProps {
  submissions: Submission[];
  stepField: string;
  maxStep?: number;
  stepLabels?: string[];
  title?: string;
}

export function FunnelChartWidget({
  submissions,
  stepField,
  maxStep,
  stepLabels,
  title,
}: FunnelChartWidgetProps) {
  const tr = useTranslations();
  const c = tr.admin.chart;

  const counts = new Map<number, number>();
  for (const sub of submissions) {
    const raw = (sub.formData as Record<string, unknown>)?.[stepField];
    const step = Number(raw);
    if (!isNaN(step) && step > 0) {
      counts.set(step, (counts.get(step) ?? 0) + 1);
    }
  }

  if (counts.size === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-5 flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">{title ?? c.funnelWidgetTitle}</p>
        <p className="text-sm text-muted-foreground text-center py-6">{c.noDataShort}</p>
      </div>
    );
  }

  const sortedSteps = [...counts.keys()].sort((a, b) => a - b);
  const detected = maxStep ?? sortedSteps[sortedSteps.length - 1];
  const steps = Array.from({ length: detected }, (_, i) => i + 1);
  const step1Count = counts.get(1) ?? counts.get(sortedSteps[0]) ?? 1;

  return (
    <div className="bg-card rounded-xl border border-border p-5 flex flex-col gap-3">
      <p className="text-sm font-semibold text-foreground">{title ?? c.funnelWidgetTitle}</p>

      <div className="space-y-2">
        {steps.map((step, idx) => {
          const count = counts.get(step) ?? 0;
          const pct = Math.round((count / step1Count) * 100);
          const prevCount = idx > 0 ? (counts.get(steps[idx - 1]) ?? 0) : count;
          const dropoff = prevCount > 0 ? Math.round(((prevCount - count) / prevCount) * 100) : 0;
          const label = stepLabels?.[idx] ?? c.funnelStepLabel.replace("{n}", String(step));

          return (
            <div key={step}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground truncate">{label}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {idx > 0 && dropoff > 0 && (
                    <span className="text-red-500">-{dropoff}%</span>
                  )}
                  <span className="font-medium text-foreground">{count}</span>
                  <span className="text-muted-foreground">({pct}%)</span>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
