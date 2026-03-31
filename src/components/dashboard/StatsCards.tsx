"use client";

import { useTranslations } from "@/lib/context/LocaleContext";

interface StatsCardsProps {
  total: number;
  thisWeek: number;
  today: number;
  overdue: number;
  urgent: number;
  done: number;
}

function StatCard({
  label,
  value,
  icon,
  accent = "blue",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: "blue" | "red" | "orange" | "green" | "purple" | "gray";
}) {
  const bg = {
    blue:   "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    red:    "bg-red-500/15 text-red-600 dark:text-red-400",
    orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    green:  "bg-green-500/15 text-green-600 dark:text-green-400",
    purple: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    gray:   "bg-muted text-muted-foreground",
  }[accent];

  const borderAccent = {
    blue: "border-l-blue-500",
    red: "border-l-red-500",
    orange: "border-l-orange-500",
    green: "border-l-green-500",
    purple: "border-l-purple-500",
    gray: "border-l-border",
  }[accent];

  const valueColor = {
    blue: "text-foreground",
    red: value > 0 ? "text-red-600 dark:text-red-400" : "text-foreground",
    orange: value > 0 ? "text-orange-600 dark:text-orange-400" : "text-foreground",
    green: "text-foreground",
    purple: "text-foreground",
    gray: "text-foreground",
  }[accent];

  return (
    <div className={`bg-card rounded-xl border border-border border-l-4 ${borderAccent} p-4 flex items-center gap-3 shadow-sm`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
      </div>
    </div>
  );
}

export function StatsCards({ total, thisWeek, today, overdue, urgent, done }: StatsCardsProps) {
  const tr = useTranslations();
  const sc = tr.admin.statsCards;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard
        label={sc.total}
        value={total}
        accent="blue"
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        }
      />
      <StatCard
        label={sc.thisWeek}
        value={thisWeek}
        accent="purple"
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
      />
      <StatCard
        label={sc.today}
        value={today}
        accent="gray"
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
      <StatCard
        label={sc.overdue}
        value={overdue}
        accent="red"
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        }
      />
      <StatCard
        label={sc.urgent}
        value={urgent}
        accent="orange"
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
      />
      <StatCard
        label={sc.done}
        value={done}
        accent="green"
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
    </div>
  );
}
