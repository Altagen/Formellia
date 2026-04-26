import type { SubmissionPriority } from "@/types";

export interface PriorityThresholds {
  redMaxDays: number;    // 0 to N days → red
  orangeMaxDays: number; // N+1 to M days → orange
  yellowMaxDays: number; // M+1 to P days → yellow
  // > yellowMaxDays → green
}

export const DEFAULT_THRESHOLDS: PriorityThresholds = {
  redMaxDays: 7,
  orangeMaxDays: 14,
  yellowMaxDays: 30,
};

export interface AutoPriorityResult {
  priority: SubmissionPriority;
  daysLeft: number | null;
  label: string;
}

/**
 * Calculates priority automatically from a deadline date (YYYY-MM-DD) vs today.
 * Thresholds are configurable; falls back to DEFAULT_THRESHOLDS.
 *
 * overdue (< 0)          → red    "En retard de X j"
 * 0 – redMaxDays         → red    "J-X"
 * redMaxDays+1 – orange  → orange "J-X"
 * orange+1 – yellow      → yellow "J-X"
 * > yellowMaxDays        → green  "J-X"
 * no deadline            → none   ""
 */
export function calcAutoPriority(
  dueDate: string | null | undefined,
  thresholds: PriorityThresholds = DEFAULT_THRESHOLDS,
): AutoPriorityResult {
  if (!dueDate) {
    return { priority: "none", daysLeft: null, label: "" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(dueDate);
  deadline.setHours(0, 0, 0, 0);

  const msLeft = deadline.getTime() - today.getTime();
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return { priority: "red", daysLeft, label: `En retard de ${Math.abs(daysLeft)} j` };
  }
  if (daysLeft <= thresholds.redMaxDays) {
    return { priority: "red", daysLeft, label: `J-${daysLeft}` };
  }
  if (daysLeft <= thresholds.orangeMaxDays) {
    return { priority: "orange", daysLeft, label: `J-${daysLeft}` };
  }
  if (daysLeft <= thresholds.yellowMaxDays) {
    return { priority: "yellow", daysLeft, label: `J-${daysLeft}` };
  }
  return { priority: "green", daysLeft, label: `J-${daysLeft}` };
}
