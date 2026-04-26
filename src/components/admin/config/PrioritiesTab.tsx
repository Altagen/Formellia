"use client";

import { Input } from "@/components/ui/input";
import { useTranslations } from "@/lib/context/LocaleContext";

interface PriorityThresholds {
  redMaxDays: number;
  orangeMaxDays: number;
  yellowMaxDays: number;
}

interface PrioritiesTabProps {
  thresholds: PriorityThresholds | undefined;
  onChange: (t: PriorityThresholds) => void;
}

const DEFAULT: PriorityThresholds = { redMaxDays: 7, orangeMaxDays: 14, yellowMaxDays: 30 };

const LEVEL_STYLES = [
  {
    key: "redMaxDays" as const,
    dot: "bg-red-500",
    border: "border-red-200 dark:border-red-900",
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-400",
  },
  {
    key: "orangeMaxDays" as const,
    dot: "bg-orange-500",
    border: "border-orange-200 dark:border-orange-900",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    text: "text-orange-700 dark:text-orange-400",
  },
  {
    key: "yellowMaxDays" as const,
    dot: "bg-yellow-400",
    border: "border-yellow-200 dark:border-yellow-900",
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    text: "text-yellow-700 dark:text-yellow-400",
  },
] as const;

export function PrioritiesTab({ thresholds, onChange }: PrioritiesTabProps) {
  const tr = useTranslations();
  const p = tr.admin.priority;
  const cp = tr.admin.config.priorities;
  const values = thresholds ?? DEFAULT;

  function update(key: keyof PriorityThresholds, raw: number) {
    const next = { ...values };
    // Clamp to keep ordering: red < orange < yellow
    if (key === "redMaxDays") {
      next.redMaxDays = Math.max(1, Math.min(raw, values.orangeMaxDays - 1));
    } else if (key === "orangeMaxDays") {
      next.orangeMaxDays = Math.max(values.redMaxDays + 1, Math.min(raw, values.yellowMaxDays - 1));
    } else {
      next.yellowMaxDays = Math.max(values.orangeMaxDays + 1, Math.min(raw, 365));
    }
    onChange(next);
  }

  const isValid =
    values.redMaxDays > 0 &&
    values.redMaxDays < values.orangeMaxDays &&
    values.orangeMaxDays < values.yellowMaxDays;

  const LEVELS = [
    {
      ...LEVEL_STYLES[0],
      label: p.redLabel.split(" —")[0],
      hint: `${p.overduePrefix} ${values.redMaxDays} ${values.redMaxDays > 1 ? p.daysRemaining_other : p.daysRemaining_one}`,
      levelLabel: p.redLabel,
    },
    {
      ...LEVEL_STYLES[1],
      label: p.orangeLabel.split(" —")[0],
      hint: `${values.redMaxDays + 1} ${p.rangeTo} ${values.orangeMaxDays} ${p.daysRemaining_other}`,
      levelLabel: p.orangeLabel,
    },
    {
      ...LEVEL_STYLES[2],
      label: p.yellowLabel.split(" —")[0],
      hint: `${values.orangeMaxDays + 1} ${p.rangeTo} ${values.yellowMaxDays} ${p.daysRemaining_other}`,
      levelLabel: p.yellowLabel,
    },
  ];

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-1">{cp.title}</h2>
        <p className="text-xs text-muted-foreground">{cp.description}</p>
      </div>

      {/* Visual preview */}
      <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{p.preview}</p>
        {LEVELS.map((l) => (
          <div key={l.key} className="flex items-center gap-2 text-sm">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${l.dot}`} />
            <span className="text-muted-foreground">{l.hint}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-green-500" />
          <span className="text-muted-foreground">
            {p.moreThan} {values.yellowMaxDays} {p.daysRemaining_other}
          </span>
        </div>
      </div>

      {/* Threshold inputs */}
      <div className="space-y-3">
        {LEVELS.map((l) => {
          const val = values[l.key];
          const min = l.key === "redMaxDays" ? 1 : l.key === "orangeMaxDays" ? values.redMaxDays + 1 : values.orangeMaxDays + 1;
          const max = l.key === "redMaxDays" ? values.orangeMaxDays - 1 : l.key === "orangeMaxDays" ? values.yellowMaxDays - 1 : 365;

          return (
            <div key={l.key} className={`rounded-lg border p-4 ${l.bg} ${l.border}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${l.dot}`} />
                <span className={`text-sm font-medium ${l.text}`}>{l.levelLabel}</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={val}
                    min={min}
                    max={max}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!isNaN(n)) update(l.key, n);
                    }}
                    className={`w-20 text-sm font-semibold text-center ${l.text}`}
                  />
                  <span className={`text-sm ${l.text}`}>{p.days}</span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={Math.min(max, 365)}
                  value={val}
                  onChange={(e) => update(l.key, parseInt(e.target.value, 10))}
                  className="flex-1 min-w-[100px] cursor-pointer"
                />
              </div>
            </div>
          );
        })}
      </div>

      {!isValid && (
        <p className="text-xs text-destructive">{p.invalidThresholds}</p>
      )}

    </div>
  );
}
