import type { VisibleWhen, VisibleWhenMulti } from "@/types/config";

/**
 * Evaluates a single VisibleWhen condition against a flat map of field values.
 */
function evaluateSingle(condition: VisibleWhen, values: Record<string, string>): boolean {
  const fieldValue = values[condition.field] ?? "";

  switch (condition.operator) {
    case "eq":
      return fieldValue === String(condition.value);
    case "neq":
      return fieldValue !== String(condition.value);
    case "in":
      return Array.isArray(condition.value)
        ? condition.value.includes(fieldValue)
        : fieldValue === String(condition.value);
    case "notIn":
      return Array.isArray(condition.value)
        ? !condition.value.includes(fieldValue)
        : fieldValue !== String(condition.value);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = parseFloat(fieldValue);
      const b = parseFloat(String(condition.value));
      if (isNaN(a) || isNaN(b)) return false;
      if (condition.operator === "gt")  return a > b;
      if (condition.operator === "gte") return a >= b;
      if (condition.operator === "lt")  return a < b;
      return a <= b; // lte
    }
    default:
      return true;
  }
}

function isSingleCondition(c: VisibleWhenMulti): c is VisibleWhen {
  return "field" in c;
}

/**
 * Evaluates a visibleWhen rule against a flat map of field values.
 * Supports single condition (legacy), AND (all), and OR (any) modes.
 * Used on BOTH client (DynamicField) and server (Zod validation) to guarantee
 * identical behaviour.
 */
export function evaluateVisibleWhen(
  condition: VisibleWhenMulti,
  values: Record<string, string>
): boolean {
  if (isSingleCondition(condition)) {
    return evaluateSingle(condition, values);
  }
  if ("all" in condition) {
    return condition.all.every(c => evaluateSingle(c, values));
  }
  if ("any" in condition) {
    return condition.any.some(c => evaluateSingle(c, values));
  }
  return true;
}
