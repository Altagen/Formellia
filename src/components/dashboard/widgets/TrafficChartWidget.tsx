"use client";

import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { useTranslations } from "@/lib/context/LocaleContext";

interface TrafficTotals { views: number; started: number; submitted: number }
interface TrafficData {
  timeline: { date: string; views: number }[];
  totals: TrafficTotals;
  bySource: Record<string, number>;
}

interface TrafficChartWidgetProps {
  formId: string;
  title?: string;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export function TrafficChartWidget({ formId, title }: TrafficChartWidgetProps) {
  const tr = useTranslations();
  const c = tr.admin.chart;

  const PERIODS = [
    { label: "24h",  from: () => daysAgo(1),  gran: "hour" },
    { label: "7j",   from: () => daysAgo(7),  gran: "day" },
    { label: "30j",  from: () => daysAgo(30), gran: "day" },
  ] as const;

  const [periodIdx, setPeriodIdx] = useState(1);
  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const period = PERIODS[periodIdx];

  useEffect(() => {
    setLoading(true);
    setError(false);
    const from = period.from().toISOString();
    const to   = new Date().toISOString();
    fetch(`/api/admin/forms/${formId}/traffic?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&granularity=${period.gran}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [formId, periodIdx, period]);

  const totals = data?.totals ?? { views: 0, started: 0, submitted: 0 };
  const bySource = data?.bySource ?? {};
  const totalViews = totals.views || 1;

  const SOURCE_LABELS: Record<string, string> = {
    direct:   c.sourcesDirect,
    social:   c.sourcesSocial,
    search:   c.sourcesSearch,
    referral: c.sourcesReferral,
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{title ?? c.trafficTitle}</p>
        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
          {PERIODS.map((p, i) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setPeriodIdx(i)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                periodIdx === i
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: c.trafficVisitors,  value: totals.views,     color: "text-blue-600" },
          { label: c.trafficStarted,   value: totals.started,   color: "text-orange-500" },
          { label: c.trafficSubmitted, value: totals.submitted, color: "text-green-600" },
        ].map(s => (
          <div key={s.label} className="bg-muted/40 rounded-lg p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-[180px]">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{c.loading}</div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{c.fetchError}</div>
        ) : (data?.timeline.length ?? 0) === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{c.noDataShort}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data!.timeline} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="views" name={c.trafficVisitors} stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Source breakdown */}
      <div className="border-t border-border pt-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">{c.trafficSources}</p>
        <div className="space-y-1.5">
          {(["direct", "social", "search", "referral"] as const).map(src => {
            const count = bySource[src] ?? 0;
            const pct = Math.round((count / totalViews) * 100);
            const colors: Record<string, string> = {
              direct: "bg-blue-500",
              social: "bg-purple-500",
              search: "bg-orange-500",
              referral: "bg-green-500",
            };
            return (
              <div key={src} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-16 shrink-0">{SOURCE_LABELS[src]}</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${colors[src]}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-muted-foreground w-8 text-right">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
