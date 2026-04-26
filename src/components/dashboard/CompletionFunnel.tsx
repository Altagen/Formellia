import { db } from "@/lib/db";
import { formAnalytics } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { getTranslations } from "@/i18n";

interface FunnelStep {
  step: number;
  views: number;
  abandons: number;
  completions: number;
  rate: number; // % relative to step 1
}

async function getFunnelData(formSlug: string): Promise<FunnelStep[]> {
  const rows = await db
    .select({
      step: formAnalytics.step,
      action: formAnalytics.action,
      count: count(),
    })
    .from(formAnalytics)
    .where(eq(formAnalytics.formSlug, formSlug))
    .groupBy(formAnalytics.step, formAnalytics.action);

  if (rows.length === 0) return [];

  // Group by step
  const byStep: Record<number, { views: number; abandons: number; completions: number }> = {};
  for (const row of rows) {
    if (!byStep[row.step]) byStep[row.step] = { views: 0, abandons: 0, completions: 0 };
    if (row.action === "view") byStep[row.step].views += row.count;
    if (row.action === "abandon") byStep[row.step].abandons += row.count;
    if (row.action === "complete") byStep[row.step].completions += row.count;
  }

  const steps = Object.keys(byStep).map(Number).sort((a, b) => a - b);
  const step1Views = byStep[steps[0]]?.views ?? 1;

  return steps.map(step => ({
    step,
    ...byStep[step],
    rate: step1Views > 0 ? Math.round((byStep[step].views / step1Views) * 100) : 0,
  }));
}

interface CompletionFunnelProps {
  formSlug: string;
  title?: string;
  locale?: string;
}

export async function CompletionFunnel({ formSlug, title, locale }: CompletionFunnelProps) {
  const tr = getTranslations(locale);
  const ch = tr.admin.chart;
  const steps = await getFunnelData(formSlug);

  if (steps.length === 0) return null;

  const maxViews = steps[0]?.views ?? 1;
  const displayTitle = title ?? ch.funnelTitle;

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">{displayTitle}</h3>
      <div className="space-y-3">
        {steps.map((s, i) => {
          const barWidth = maxViews > 0 ? (s.views / maxViews) * 100 : 0;
          const dropOff = i > 0 ? steps[i - 1].views - s.views : 0;
          return (
            <div key={s.step}>
              {dropOff > 0 && (
                <div className="flex items-center gap-2 py-1">
                  <div className="w-24 shrink-0" />
                  <span className="text-xs text-red-500 dark:text-red-400">
                    ↑ -{dropOff} ({steps[i - 1].views > 0 ? Math.round((dropOff / steps[i - 1].views) * 100) : 0}% abandon)
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24 shrink-0 text-right">{ch.funnelStep.replace("{n}", String(s.step))}</span>
                <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                  <div
                    className="h-full bg-primary/80 rounded-full flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${Math.max(barWidth, 4)}%` }}
                  >
                    <span className="text-xs font-medium text-primary-foreground whitespace-nowrap">
                      {s.rate}%
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground w-16 shrink-0">{ch.funnelViews.replace("{n}", String(s.views))}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-border/50 flex gap-6 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{steps[steps.length - 1]?.completions ?? 0}</span> {ch.funnelCompletions}
        </span>
        <span>
          {ch.funnelGlobalRate}{" "}
          <span className="font-semibold text-foreground">
            {steps[0]?.views > 0
              ? Math.round(((steps[steps.length - 1]?.completions ?? 0) / steps[0].views) * 100)
              : 0}%
          </span>
        </span>
      </div>
    </div>
  );
}
