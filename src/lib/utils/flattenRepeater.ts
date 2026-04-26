import type { FieldDef, StepDef } from "@/types/config";
import type { Submission } from "@/lib/db/schema";

type Row = Record<string, unknown>;

/**
 * Expands each submission into one synthetic row per repeater item. The
 * repeater item's columns are merged into the parent formData; the repeater
 * field itself is removed. Submissions with no items are dropped.
 */
export function flattenRepeaterRows(rows: Submission[], fieldId: string): Submission[] {
  const out: Submission[] = [];

  for (const row of rows) {
    const fd = (row.formData ?? {}) as Record<string, unknown>;
    const raw = fd[fieldId];

    let items: Row[] = [];
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) items = parsed as Row[];
      } catch { /* skip — unparseable */ }
    } else if (Array.isArray(raw)) {
      items = raw as Row[];
    }

    if (items.length === 0) continue;

    const { [fieldId]: _drop, ...parentFormData } = fd;
    void _drop;

    items.forEach((item, idx) => {
      out.push({
        ...row,
        id: `${row.id}#${idx}`,
        formData: { ...parentFormData, ...item },
      });
    });
  }

  return out;
}

/**
 * Replaces a repeater field with synthetic fields derived from its columns,
 * so callers iterating over `formSteps` (e.g. the submissions table) discover
 * the flattened columns instead of the original repeater container.
 */
export function expandStepsForRepeater(steps: StepDef[], fieldId: string): StepDef[] {
  return steps.map(step => {
    const idx = step.fields.findIndex(f => (f.dbKey ?? f.id) === fieldId);
    if (idx === -1) return step;

    const repeater = step.fields[idx];
    const synth: FieldDef[] = (repeater.repeaterColumns ?? []).map(col => ({
      id: col.id,
      type: col.type,
      label: col.label,
      required: col.required,
      placeholder: col.placeholder,
      options: col.options,
      validation: col.validation,
    }));

    return {
      ...step,
      fields: [...step.fields.slice(0, idx), ...synth, ...step.fields.slice(idx + 1)],
    };
  });
}
