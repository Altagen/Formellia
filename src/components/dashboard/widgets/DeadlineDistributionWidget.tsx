"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { Submission } from "@/lib/db/schema";

interface Bucket {
  label: string;
  maxDays: number;
  color: string;
}

const DEFAULT_BUCKETS: Bucket[] = [
  { label: "En retard",   maxDays: 0,        color: "#7f1d1d" },
  { label: "< 7 jours",  maxDays: 7,        color: "#ef4444" },
  { label: "7–30 jours", maxDays: 30,       color: "#f97316" },
  { label: "1–3 mois",   maxDays: 90,       color: "#3b82f6" },
  { label: "> 3 mois",   maxDays: Infinity, color: "#22c55e" },
];

interface DeadlineDistributionWidgetProps {
  title?: string;
  submissions: Submission[];
  /** Defaults to "dateEcheance". Accepts any system field or formData key. */
  dateField?: string;
  /** Override default buckets. maxDays is the upper exclusive bound in days from today. */
  buckets?: { label: string; maxDays: number; color?: string }[];
}

function getFieldDate(sub: Submission, field: string): Date | null {
  let raw: unknown;
  switch (field) {
    case "dateEcheance":  raw = sub.dateEcheance;  break;
    case "submittedAt":   raw = sub.submittedAt;   break;
    case "dateReception": raw = sub.dateReception; break;
    default: raw = (sub.formData as Record<string, unknown>)?.[field]; break;
  }
  if (raw == null || raw === "") return null;
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
}

export function DeadlineDistributionWidget({
  title = "Deadline distribution",
  submissions,
  dateField = "dateEcheance",
  buckets: customBuckets,
}: DeadlineDistributionWidgetProps) {
  const buckets: Bucket[] = customBuckets
    ? customBuckets.map((b, i) => ({ ...b, color: b.color ?? DEFAULT_BUCKETS[i]?.color ?? "#64748b" }))
    : DEFAULT_BUCKETS;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Count per bucket
  const counts: Record<string, number> = {};
  let noDate = 0;

  for (const sub of submissions) {
    const d = getFieldDate(sub, dateField);
    if (!d) { noDate++; continue; }

    const days = Math.floor((d.getTime() - today.getTime()) / 86_400_000);

    // Find the right bucket.
    // A bucket with maxDays <= 0 is an "overdue" bucket (catches days < 0).
    // For positive days: skip overdue buckets, match first bucket where days < maxDays.
    // If no bucket matches (e.g. custom buckets without an overdue bucket and days < 0),
    // fall into the last bucket as a catch-all.
    let assigned = false;
    if (days < 0) {
      const overdueBucket = buckets.find(b => b.maxDays <= 0);
      if (overdueBucket) {
        counts[overdueBucket.label] = (counts[overdueBucket.label] ?? 0) + 1;
        assigned = true;
      }
      // If no overdue bucket, fall through to the regular loop below
    }
    if (!assigned) {
      for (const b of buckets) {
        if (b.maxDays <= 0) continue;
        if (days < b.maxDays) {
          counts[b.label] = (counts[b.label] ?? 0) + 1;
          assigned = true;
          break;
        }
      }
    }
    // Last bucket catches everything else (maxDays: Infinity or unmatched overdue)
    if (!assigned) {
      const last = buckets[buckets.length - 1];
      if (last) counts[last.label] = (counts[last.label] ?? 0) + 1;
    }
  }

  const chartData = buckets.map(b => ({
    name: b.label,
    value: counts[b.label] ?? 0,
    color: b.color,
  }));

  const total = submissions.length;
  const withDate = total - noDate;
  const overdue = counts[buckets.find(b => b.maxDays <= 0)?.label ?? ""] ?? 0;
  const pctOverdue = withDate > 0 ? Math.round((overdue / withDate) * 100) : 0;

  return (
    <div className="bg-card rounded-xl border border-border p-5 h-full flex flex-col gap-3">
      <p className="text-sm font-semibold text-foreground">{title}</p>

      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          No data
        </div>
      ) : (
        <>
          {/* KPI line */}
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-red-600">{pctOverdue}%</span>
            <span className="text-xs text-muted-foreground">overdue · {withDate} items with a deadline</span>
          </div>

          {/* Bar chart */}
          <div className="flex-1 min-h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={80}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v) => [`${v} dossier${Number(v) > 1 ? "s" : ""}`, ""]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Legend with counts */}
          <div className="space-y-1 border-t border-border pt-2">
            {chartData.map(b => (
              <div key={b.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
                  <span className="text-muted-foreground">{b.name}</span>
                </div>
                <span className="font-medium text-foreground">{b.value}</span>
              </div>
            ))}
            {noDate > 0 && (
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0 bg-gray-400" />
                  <span className="text-muted-foreground">Sans date</span>
                </div>
                <span className="font-medium text-foreground">{noDate}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
