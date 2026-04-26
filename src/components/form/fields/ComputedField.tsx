"use client";

import type { FieldDef } from "@/types/config";

interface ComputedFieldProps {
  field: FieldDef;
  value: string; // pre-evaluated by DynamicField
}

export function ComputedField({ field, value }: ComputedFieldProps) {
  const displayValue = value
    ? `${value}${field.computedUnit ? "\u00a0" + field.computedUnit : ""}`
    : "—";

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-foreground">{field.label}</span>
      <div className="flex items-center h-9 px-3 rounded-lg border border-input bg-muted/40 text-sm text-foreground font-mono select-none">
        {displayValue}
      </div>
      {field.helpText && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}
    </div>
  );
}
