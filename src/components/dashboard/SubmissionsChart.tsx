"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const LABEL_MAP: Record<string, string> = {
  contentieux_fiscal: "Contentieux fiscal",
  recours_administratif: "Recours admin.",
  autre: "Autre",
};

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981"];

interface ChartData {
  requestType: string;
  count: number;
}

interface SubmissionsChartProps {
  data: ChartData[];
  embedded?: boolean; // when true, no card wrapper (used inside ChartTabs)
}

export function SubmissionsChart({ data, embedded = false }: SubmissionsChartProps) {
  const chartData = data.map((d) => ({
    name: LABEL_MAP[d.requestType] ?? d.requestType,
    count: d.count,
  }));

  const chart = (
    <>
      {!embedded && (
        <h3 className="text-sm font-semibold text-foreground mb-4">Distribution by type</h3>
      )}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid var(--color-border)", fontSize: 13 }}
            cursor={{ fill: "var(--color-muted)" }}
          />
          <Bar dataKey="count" name="Soumissions" radius={[4, 4, 0, 0]}>
            {chartData.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {chartData.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No data for this period.</p>
      )}
    </>
  );

  if (embedded) return chart;

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      {chart}
    </div>
  );
}
