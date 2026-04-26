"use client";

import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useTranslations } from "@/lib/context/LocaleContext";

interface EmailStats {
  total: number;
  disposable: number;
  disposablePercent: number;
}

interface EmailQualityWidgetProps {
  formId?: string;
  dataSourceId?: string;
  title?: string;
}

export function EmailQualityWidget({ formId, dataSourceId, title }: EmailQualityWidgetProps) {
  const tr = useTranslations();
  const c = tr.admin.chart;

  const [data, setData] = useState<EmailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const url = dataSourceId
      ? `/api/admin/datasets/${dataSourceId}/email-stats`
      : `/api/admin/forms/${formId}/email-stats`;
    fetch(url)
      .then(r => r.json())
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [formId, dataSourceId]);

  const valid = (data?.total ?? 0) - (data?.disposable ?? 0);
  const chartData = [
    { name: c.emailTotal.replace("Total", "") || c.emailTotal, label: c.emailTotal, value: valid, fill: "#22c55e" },
    { name: c.emailDisposable, label: c.emailDisposable, value: data?.disposable ?? 0, fill: "#ef4444" },
  ].filter(d => d.value > 0);

  return (
    <div className="bg-card rounded-xl border border-border p-5 h-full flex flex-col gap-3">
      <p className="text-sm font-semibold text-foreground">{title ?? c.emailQualityTitle}</p>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">{c.loading}</div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">{c.fetchError}</div>
      ) : !data || data.total === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">{c.noSubmissions}</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-muted/40 rounded-lg p-2">
              <p className="text-lg font-bold text-foreground">{data.total}</p>
              <p className="text-xs text-muted-foreground">{c.emailTotal}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2">
              <p className="text-lg font-bold text-red-600">{data.disposable}</p>
              <p className="text-xs text-muted-foreground">{c.emailDisposable}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-2">
              <p className="text-lg font-bold text-foreground">{data.disposablePercent}%</p>
              <p className="text-xs text-muted-foreground">{c.emailDisposablePct}</p>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="flex-1 min-h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius="50%"
                    outerRadius="75%"
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
