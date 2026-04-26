"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Submission } from "@/lib/db/schema";
import { calcAutoPriority } from "@/lib/utils/priority";
import { usePrioritySettings } from "@/lib/context/PrioritySettingsContext";
import type { SubmissionPriority } from "@/types";
import { useTranslations } from "@/lib/context/LocaleContext";

interface Props {
  submissions: Submission[];
}

const PRIORITY_COLORS: Record<SubmissionPriority, string> = {
  none: "#d1d5db",
  green: "#10b981",
  yellow: "#fbbf24",
  orange: "#f97316",
  red: "#ef4444",
};

const PRIORITY_ORDER: SubmissionPriority[] = ["red", "orange", "yellow", "green", "none"];

export default function PriorityChart({ submissions }: Props) {
  const thresholds = usePrioritySettings();
  const tr = useTranslations();

  const PRIORITY_LABELS: Record<SubmissionPriority, string> = {
    none: tr.priority.none_filter,
    green: tr.priority.green,
    yellow: tr.priority.yellow,
    orange: tr.priority.orange,
    red: tr.priority.red,
  };

  function getEffective(sub: Submission): SubmissionPriority {
    if (sub.priority && sub.priority !== "none") return sub.priority as SubmissionPriority;
    return calcAutoPriority(sub.dueDate, thresholds).priority;
  }

  const countByPriority = new Map<SubmissionPriority, number>();
  for (const sub of submissions) {
    const p = getEffective(sub);
    countByPriority.set(p, (countByPriority.get(p) ?? 0) + 1);
  }

  const data = PRIORITY_ORDER.map((priority) => ({
    priority,
    label: PRIORITY_LABELS[priority],
    count: countByPriority.get(priority) ?? 0,
    color: PRIORITY_COLORS[priority],
  }));

  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">{tr.admin.chart.byPriority}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <XAxis type="number" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(value) => [value, tr.admin.chart.submissions]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border)" }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((entry) => (
              <Cell key={entry.priority} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
