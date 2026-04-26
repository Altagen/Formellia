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
import type { SubmissionStatus } from "@/types";
import { useTranslations } from "@/lib/context/LocaleContext";

interface Props {
  submissions: Submission[];
}

const STATUS_COLORS: Record<SubmissionStatus, string> = {
  pending: "#3b82f6",
  in_progress: "#8b5cf6",
  done: "#10b981",
  waiting_user: "#f59e0b",
};

const ALL_STATUSES: SubmissionStatus[] = [
  "pending",
  "in_progress",
  "done",
  "waiting_user",
];

export default function StatusChart({ submissions }: Props) {
  const tr = useTranslations();

  const STATUS_LABELS: Record<SubmissionStatus, string> = {
    pending: tr.status.pending,
    in_progress: tr.status.in_progress,
    done: tr.status.done,
    waiting_user: tr.status.waiting_user,
  };

  const countByStatus = new Map<SubmissionStatus, number>();
  for (const sub of submissions) {
    const s = sub.status as SubmissionStatus;
    countByStatus.set(s, (countByStatus.get(s) ?? 0) + 1);
  }

  const data = ALL_STATUSES.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: countByStatus.get(status) ?? 0,
    color: STATUS_COLORS[status],
  }));

  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">
        {tr.admin.chart.byStatus}
      </h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
        >
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={110}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value) => [value, tr.admin.chart.submissions]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--color-border)",
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((entry) => (
              <Cell key={entry.status} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
