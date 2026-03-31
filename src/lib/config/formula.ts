import type { FormulaExpr } from "@/types/config";

/**
 * Evaluates a FormulaExpr against the current form values.
 * Safe DSL — no eval(). Returns a string value (empty string if inputs are invalid).
 */
export function evaluateFormula(
  expr: FormulaExpr,
  values: Record<string, string>,
): string {
  switch (expr.op) {
    case "date_diff": {
      const a = new Date(values[expr.from] ?? "");
      const b = new Date(values[expr.to] ?? "");
      if (isNaN(a.getTime()) || isNaN(b.getTime())) return "";
      const diffMs = b.getTime() - a.getTime();
      if (expr.unit === "months") return String(Math.round(diffMs / (30.44 * 86_400_000)));
      if (expr.unit === "years")  return String(Math.round(diffMs / (365.25 * 86_400_000)));
      return String(Math.round(diffMs / 86_400_000)); // days (default)
    }

    case "date_add": {
      const base = new Date(values[expr.base] ?? "");
      if (isNaN(base.getTime())) return "";
      const n = typeof expr.days === "number"
        ? expr.days
        : parseInt(values[String(expr.days)] ?? String(expr.days), 10);
      base.setDate(base.getDate() + (isNaN(n) ? 0 : n));
      return base.toISOString().slice(0, 10); // YYYY-MM-DD
    }

    case "sum":
      return String(
        expr.fields.reduce((acc, id) => acc + (parseFloat(values[id] ?? "0") || 0), 0),
      );

    case "field":
      return values[expr.id] ?? "";

    case "literal":
      return expr.value;
  }
}

/**
 * Evaluates all computed fields in a step and injects their values into `values`.
 * Mutates the provided `values` object in-place for performance.
 */
export function injectComputedValues(
  fields: import("@/types/config").FieldDef[],
  values: Record<string, string>,
): void {
  for (const field of fields) {
    if (field.type === "computed" && field.formula) {
      values[field.id] = evaluateFormula(field.formula, values);
    }
  }
}
