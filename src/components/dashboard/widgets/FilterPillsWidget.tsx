"use client";

import { useMemo } from "react";
import type { Submission } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

interface FilterPillsWidgetProps {
  title?: string;
  field: string;
  submissions: Submission[];
  activeSegmentFilter?: { field: string; value: string } | null;
  onSegmentClick?: (value: string, groupBy: string) => void;
}

export function FilterPillsWidget({
  title,
  field,
  submissions,
  activeSegmentFilter,
  onSegmentClick,
}: FilterPillsWidgetProps) {
  const values = useMemo(() => {
    const set = new Set<string>();
    for (const sub of submissions) {
      const v = field === "email" ? sub.email
        : field === "status" ? sub.status
        : field === "priority" ? sub.priority
        : (sub.formData as Record<string, unknown>)?.[field];
      if (v != null && v !== "") set.add(String(v));
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [submissions, field]);

  const activeValue = activeSegmentFilter?.field === field ? activeSegmentFilter.value : null;

  return (
    <div className="bg-card rounded-xl border border-border p-4 h-full flex flex-col gap-3">
      {title && <p className="text-sm font-semibold text-foreground">{title}</p>}

      {values.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {values.map(v => {
            const isActive = v === activeValue;
            return (
              <button
                key={v}
                type="button"
                onClick={() => onSegmentClick?.(v, field)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                )}
              >
                {v}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
