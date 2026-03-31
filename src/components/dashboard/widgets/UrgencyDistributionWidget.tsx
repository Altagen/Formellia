"use client";

import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useTranslations } from "@/lib/context/LocaleContext";

interface UrgencyData {
  total: number;
  withDeadline: number;
  withoutDeadline: number;
  buckets: { overdue: number; red: number; orange: number; yellow: number; green: number };
}

interface UrgencyDistributionWidgetProps {
  formId: string;
  title?: string;
}

export function UrgencyDistributionWidget({ formId, title }: UrgencyDistributionWidgetProps) {
  const tr = useTranslations();
  const c = tr.admin.chart;

  const BUCKET_CONFIG = [
    { key: "overdue" as const, label: c.urgencyOverdue,      fill: "#7f1d1d" },
    { key: "red"     as const, label: c.urgencyBucketRed,    fill: "#ef4444" },
    { key: "orange"  as const, label: c.urgencyBucketOrange, fill: "#f97316" },
    { key: "yellow"  as const, label: c.urgencyBucketYellow, fill: "#eab308" },
    { key: "green"   as const, label: c.urgencyBucketGreen,  fill: "#22c55e" },
  ];

  const [data, setData] = useState<UrgencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/forms/${formId}/urgency-distribution`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [formId]);

  const buckets = data?.buckets ?? { overdue: 0, red: 0, orange: 0, yellow: 0, green: 0 };

  const chartData: { name: string; value: number; fill: string }[] = BUCKET_CONFIG
    .map(b => ({ name: b.label, value: buckets[b.key], fill: b.fill }))
    .filter(d => d.value > 0);

  if ((data?.withoutDeadline ?? 0) > 0) {
    chartData.push({ name: c.urgencyNoDeadline, value: data!.withoutDeadline, fill: "#9ca3af" });
  }

  const urgent = (buckets.overdue ?? 0) + (buckets.red ?? 0);
  const pctUrgent = (data?.withDeadline ?? 0) > 0
    ? Math.round((urgent / data!.withDeadline) * 100)
    : 0;

  return (
    <div className="bg-card rounded-xl border border-border p-5 h-full flex flex-col gap-3">
      <p className="text-sm font-semibold text-foreground">{title ?? c.urgencyTitle}</p>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">{c.loading}</div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">{c.fetchError}</div>
      ) : !data || data.total === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">{c.noSubmissions}</div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-red-600">{pctUrgent}%</span>
            <span className="text-xs text-muted-foreground">{c.urgencyPctLabel}</span>
          </div>

          <div className="flex-1 min-h-[160px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius="45%"
                    outerRadius="70%"
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [v, ""]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {c.noDataShort}
              </div>
            )}
          </div>

          <div className="space-y-1 border-t border-border pt-2">
            {BUCKET_CONFIG.map(b => (
              <div key={b.key} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: b.fill }} />
                  <span className="text-muted-foreground">{b.label}</span>
                </div>
                <span className="font-medium text-foreground">{buckets[b.key] ?? 0}</span>
              </div>
            ))}
            {(data?.withoutDeadline ?? 0) > 0 && (
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block bg-gray-400" />
                  <span className="text-muted-foreground">{c.urgencyNoDeadline}</span>
                </div>
                <span className="font-medium text-foreground">{data!.withoutDeadline}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
