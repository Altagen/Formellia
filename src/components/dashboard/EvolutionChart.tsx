"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Submission } from "@/lib/db/schema";
import { useTranslations } from "@/lib/context/LocaleContext";

type Range = "7d" | "14d" | "30d" | "90d" | "custom";

interface Props {
  submissions: Submission[];
}

function toYMD(date: Date): string {
  // Use local date parts to avoid UTC offset shifting the day
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDDMM(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

// N-1 so that today is always included: "7 derniers jours" = J-6 → J
const RANGE_DAYS: Record<Exclude<Range, "custom">, number> = {
  "7d": 6,
  "14d": 13,
  "30d": 29,
  "90d": 89,
};

const RANGE_LABELS_FIXED: Record<Exclude<Range, "custom">, string> = {
  "7d": "7J",
  "14d": "14J",
  "30d": "30J",
  "90d": "3M",
};

export default function EvolutionChart({ submissions }: Props) {
  const tr = useTranslations();
  const RANGE_LABELS: Record<Range, string> = { ...RANGE_LABELS_FIXED, custom: tr.admin.chart.custom };
  const [range, setRange] = useState<Range>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let startDate: Date;
  let endDate: Date;

  if (range === "custom") {
    startDate = customFrom ? new Date(customFrom) : addDays(today, -30);
    endDate = customTo ? new Date(customTo) : today;
  } else {
    startDate = addDays(today, -RANGE_DAYS[range]);
    endDate = today;
  }

  // Generate all dates between start and end inclusive
  const dates: string[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    dates.push(toYMD(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  // Count submissions per date
  const countByDate = new Map<string, number>();
  for (const sub of submissions) {
    const ymd = toYMD(new Date(sub.submittedAt));
    countByDate.set(ymd, (countByDate.get(ymd) ?? 0) + 1);
  }

  const data = dates.map((ymd) => ({
    date: ymd,
    label: formatDDMM(ymd),
    count: countByDate.get(ymd) ?? 0,
  }));

  // Tick interval: avoid label crowding
  let tickInterval: number;
  if (dates.length > 60) {
    tickInterval = 6; // show every 7th (index % 6 === 0)
  } else if (dates.length > 14) {
    tickInterval = 1; // every 2nd
  } else {
    tickInterval = 0; // every 1st (recharts default)
  }

  const RANGES: Range[] = ["7d", "14d", "30d", "90d", "custom"];

  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-foreground">
          {tr.admin.chart.evolution}
        </h3>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                range === r
                  ? "bg-blue-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {range === "custom" && (
        <div className="flex flex-wrap gap-3 mb-4 items-center text-xs text-muted-foreground">
          <label className="flex items-center gap-1">
            {tr.admin.chart.from}
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="ml-1 border border-border rounded px-2 py-1 text-xs bg-background"
            />
          </label>
          <label className="flex items-center gap-1">
            {tr.admin.chart.to}
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="ml-1 border border-border rounded px-2 py-1 text-xs bg-background"
            />
          </label>
        </div>
      )}

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            interval={tickInterval}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(value) => [value, tr.admin.chart.submissions]}
            labelFormatter={(_label, payload) => {
              if (payload && payload.length > 0) {
                return String(payload[0].payload.date);
              }
              return String(_label);
            }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--color-border)",
            }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#blueGrad)"
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 4, fill: "#3b82f6" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
