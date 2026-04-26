import { describe, it, expect } from "vitest";
import { calcAutoPriority, DEFAULT_THRESHOLDS } from "@/lib/utils/priority";

// Helper: ISO date string N days from today (local calendar date, not UTC)
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("calcAutoPriority", () => {
  it("returns none when no deadline", () => {
    expect(calcAutoPriority(null)).toEqual({ priority: "none", daysLeft: null, label: "" });
    expect(calcAutoPriority(undefined)).toEqual({ priority: "none", daysLeft: null, label: "" });
    expect(calcAutoPriority("")).toEqual({ priority: "none", daysLeft: null, label: "" });
  });

  it("returns red for overdue date", () => {
    const result = calcAutoPriority(daysFromNow(-5));
    expect(result.priority).toBe("red");
    expect(result.daysLeft).toBeLessThan(0);
    expect(result.label).toMatch(/retard/);
  });

  it("returns red when deadline is today (0 days)", () => {
    const result = calcAutoPriority(daysFromNow(0));
    expect(result.priority).toBe("red");
    expect(result.daysLeft).toBe(0);
  });

  it("returns red within redMaxDays threshold", () => {
    const result = calcAutoPriority(daysFromNow(DEFAULT_THRESHOLDS.redMaxDays));
    expect(result.priority).toBe("red");
  });

  it("returns orange between red and orange thresholds", () => {
    const result = calcAutoPriority(daysFromNow(DEFAULT_THRESHOLDS.redMaxDays + 1));
    expect(result.priority).toBe("orange");
  });

  it("returns yellow between orange and yellow thresholds", () => {
    const result = calcAutoPriority(daysFromNow(DEFAULT_THRESHOLDS.orangeMaxDays + 1));
    expect(result.priority).toBe("yellow");
  });

  it("returns green beyond yellow threshold", () => {
    const result = calcAutoPriority(daysFromNow(DEFAULT_THRESHOLDS.yellowMaxDays + 1));
    expect(result.priority).toBe("green");
    expect(result.label).toMatch(/^J-/);
  });

  it("respects custom thresholds", () => {
    const custom = { redMaxDays: 2, orangeMaxDays: 5, yellowMaxDays: 10 };
    expect(calcAutoPriority(daysFromNow(1), custom).priority).toBe("red");
    expect(calcAutoPriority(daysFromNow(3), custom).priority).toBe("orange");
    expect(calcAutoPriority(daysFromNow(7), custom).priority).toBe("yellow");
    expect(calcAutoPriority(daysFromNow(11), custom).priority).toBe("green");
  });

  it("label format is 'J-N' for future dates", () => {
    const n = 15;
    const result = calcAutoPriority(daysFromNow(n));
    expect(result.label).toBe(`J-${n}`);
    expect(result.daysLeft).toBe(n);
  });
});
