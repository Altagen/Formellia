"use client";

import { evaluateVisibleWhen } from "@/lib/config/visibleWhen";
import { evaluateFormula } from "@/lib/config/formula";
import type { FieldDef } from "@/types/config";
import { TextField } from "./fields/TextField";
import { SelectField } from "./fields/SelectField";
import { RadioField } from "./fields/RadioField";
import { ComputedField } from "./fields/ComputedField";
import { AlertField } from "./fields/AlertField";
import { RepeaterField } from "./fields/RepeaterField";

interface DynamicFieldProps {
  field: FieldDef;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  allValues: Record<string, string>;
  optionalText?: string;
  addRowLabel?: string;
  removeRowLabel?: string;
}

export function DynamicField({
  field,
  value,
  onChange,
  error,
  allValues,
  optionalText = "(optionnel)",
  addRowLabel,
  removeRowLabel,
}: DynamicFieldProps) {
  // Visibility check applies to ALL types (including section_header, alert, computed)
  if (field.visibleWhen && !evaluateVisibleWhen(field.visibleWhen, allValues)) {
    return null;
  }

  // Section headers are purely visual — no input, no value submitted
  if (field.type === "section_header") {
    return (
      <div id={`section-${field.id}`} className="pt-3 mt-1 scroll-mt-20">
        <h3 className="text-lg font-semibold text-foreground">
          {field.label}
        </h3>
      </div>
    );
  }

  // Alert: conditional message box — no input, not submitted
  if (field.type === "alert") {
    return <AlertField field={field} />;
  }

  // Computed: formula-driven read-only field
  if (field.type === "computed") {
    const computed = field.formula ? evaluateFormula(field.formula, allValues) : "";
    return <ComputedField field={field} value={computed} />;
  }

  // Repeater: dynamic table
  if (field.type === "repeater") {
    return (
      <RepeaterField
        field={field}
        value={value}
        onChange={onChange}
        error={error}
        addRowLabel={addRowLabel}
        removeRowLabel={removeRowLabel}
      />
    );
  }

  const displayLabel =
    field.required !== false ? field.label : field.label;

  switch (field.type) {
    case "text":
    case "email":
    case "tel":
    case "number":
    case "date":
      return (
        <TextField
          name={field.id}
          label={displayLabel}
          type={field.type}
          value={value}
          onChange={onChange}
          error={error}
          placeholder={field.placeholder}
        />
      );

    case "textarea":
      return (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={field.id}
            className="text-sm font-medium text-foreground"
          >
            {displayLabel}
            {!field.required && (
              <span className="font-normal text-muted-foreground ml-1">
                {field.helpText ? `(${field.helpText})` : optionalText}
              </span>
            )}
          </label>
          <textarea
            id={field.id}
            name={field.id}
            rows={4}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-[var(--brand-primary)] resize-none"
          />
          {field.helpText && !error && field.required !== false && (
            <p className="text-xs text-muted-foreground">
              {field.helpText}
            </p>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      );

    case "select":
      return (
        <SelectField
          name={field.id}
          label={displayLabel}
          value={value}
          onChange={onChange}
          options={field.options ?? []}
          error={error}
        />
      );

    case "radio":
      return (
        <RadioField
          name={field.id}
          label={field.label}
          value={value}
          onChange={onChange}
          options={field.options ?? []}
          error={error}
        />
      );

    case "checkbox":
      return (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              id={field.id}
              type="checkbox"
              checked={value === "true"}
              onChange={(e) => onChange(e.target.checked ? "true" : "false")}
              className="w-4 h-4 rounded focus:ring-2 focus:ring-[var(--brand-primary)] text-[var(--brand-primary)]"
            />
            <span className="text-sm font-medium text-foreground">
              {displayLabel}
            </span>
          </label>
          {field.helpText && !error && (
            <p className="text-xs text-muted-foreground ml-6">
              {field.helpText}
            </p>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      );

    default:
      return null;
  }
}
