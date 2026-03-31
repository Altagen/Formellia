"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/context/LocaleContext";
import type { StepDef, FieldDef, FieldType, FieldOption, VisibleWhen, VisibleWhenMulti } from "@/types/config";

interface FormBuilderTabProps {
  steps: StepDef[];
  onChange: (steps: StepDef[]) => void;
}

const FIELD_TYPE_COLORS: Record<FieldType, string> = {
  text: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  email: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  tel: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  number: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  date: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  textarea: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
  select: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  radio: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
  checkbox: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  section_header: "bg-muted text-muted-foreground",
  computed: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
  alert: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  repeater: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
};

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function FormBuilderTab({ steps, onChange }: FormBuilderTabProps) {
  const tr = useTranslations();
  const fb = tr.admin.config.formBuilder;

  const FIELD_TYPE_LABELS: Record<FieldType, string> = {
    text: fb.fieldTypeText,
    email: fb.fieldTypeEmail,
    tel: fb.fieldTypeTel,
    number: fb.fieldTypeNumber,
    date: fb.fieldTypeDate,
    textarea: fb.fieldTypeTextarea,
    select: fb.fieldTypeSelect,
    radio: fb.fieldTypeRadio,
    checkbox: fb.fieldTypeCheckbox,
    section_header: fb.fieldTypeSection,
    computed: fb.fieldTypeComputed,
    alert: fb.fieldTypeAlert,
    repeater: fb.fieldTypeRepeater,
  };

  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set(steps.map((s) => s.id)));
  const [editingField, setEditingField] = useState<string | null>(null);

  const totalFields = steps.reduce((acc, s) => acc + s.fields.length, 0);

  function toggleStep(id: string) {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateStep(i: number, patch: Partial<StepDef>) {
    const updated = [...steps];
    updated[i] = { ...updated[i], ...patch };
    onChange(updated);
  }

  function deleteStep(i: number) {
    onChange(steps.filter((_, idx) => idx !== i));
  }

  function addStep() {
    if (steps.length >= 10) return;
    const step: StepDef = {
      id: `step_${Date.now()}`,
      title: fb.newStepTitle,
      fields: [{ id: `field_${Date.now()}`, type: "text", label: fb.newFieldLabel }],
    };
    onChange([...steps, step]);
    setExpandedSteps((prev) => new Set([...prev, step.id]));
  }

  function addField(stepIdx: number) {
    const step = steps[stepIdx];
    if (step.fields.length >= 20) return;
    const field: FieldDef = { id: `field_${Date.now()}`, type: "text", label: fb.newFieldLabel };
    const newFieldIdx = step.fields.length;
    updateStep(stepIdx, { fields: [...step.fields, field] });
    setEditingField(`${stepIdx}-${newFieldIdx}`);
  }

  function updateField(stepIdx: number, fieldIdx: number, patch: Partial<FieldDef>) {
    const step = steps[stepIdx];
    const fields = [...step.fields];
    fields[fieldIdx] = { ...fields[fieldIdx], ...patch };
    updateStep(stepIdx, { fields });
  }

  function deleteField(stepIdx: number, fieldIdx: number) {
    const step = steps[stepIdx];
    updateStep(stepIdx, { fields: step.fields.filter((_, i) => i !== fieldIdx) });
    setEditingField(null);
  }

  // Collect all fields from previous steps for visibleWhen
  function getPreviousFields(stepIdx: number): FieldDef[] {
    return steps.slice(0, stepIdx).flatMap((s) => s.fields).filter((f) => f.type !== "section_header");
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            {fb.stepsCount.replace("{steps}", String(steps.length)).replace("{fields}", String(totalFields))}
          </p>
        </div>
        <button
          type="button"
          onClick={addStep}
          disabled={steps.length >= 10}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {fb.addStep}
        </button>
      </div>

      {steps.length === 0 && (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <p className="text-sm text-muted-foreground mb-3">{fb.noSteps}</p>
          <button type="button" onClick={addStep} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            {fb.createFirstStep}
          </button>
        </div>
      )}

      {steps.map((step, stepIdx) => (
        <div key={step.id} className="bg-card rounded-xl border border-border overflow-hidden">
          {/* Step header */}
          <div className="flex items-center gap-3 px-5 py-4 bg-muted/50">
            {/* Reorder — filled triangles (▲▼) to distinguish from collapse chevron (outline ∨) */}
            <div className="flex flex-col gap-0.5 flex-shrink-0">
              <button type="button" onClick={() => stepIdx > 0 && onChange(move(steps, stepIdx, stepIdx - 1))} disabled={stepIdx === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25" title={fb.tooltipMoveUp}>
                <svg className="w-3 h-3" viewBox="0 0 10 10" fill="currentColor"><polygon points="5,1 9,9 1,9"/></svg>
              </button>
              <button type="button" onClick={() => stepIdx < steps.length - 1 && onChange(move(steps, stepIdx, stepIdx + 1))} disabled={stepIdx === steps.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25" title={fb.tooltipMoveDown}>
                <svg className="w-3 h-3" viewBox="0 0 10 10" fill="currentColor"><polygon points="5,9 9,1 1,1"/></svg>
              </button>
            </div>

            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center justify-center">
              {stepIdx + 1}
            </span>

            {/* Step title inline edit */}
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={step.title}
                onChange={(e) => updateStep(stepIdx, { title: e.target.value })}
                className="w-full bg-transparent text-sm font-semibold text-foreground focus:outline-none border-b border-transparent focus:border-blue-500 pb-0.5"
                placeholder={fb.stepTitlePlaceholder}
              />
              {expandedSteps.has(step.id) && (
                <input
                  type="text"
                  value={step.description ?? ""}
                  onChange={(e) => updateStep(stepIdx, { description: e.target.value || undefined })}
                  className="w-full bg-transparent text-xs text-muted-foreground focus:outline-none border-b border-transparent focus:border-blue-300 mt-0.5"
                  placeholder={fb.stepDescPlaceholder}
                />
              )}
            </div>

            <span className="text-xs text-muted-foreground flex-shrink-0">
              {step.fields.length}/20
            </span>

            <button
              type="button"
              onClick={() => toggleStep(step.id)}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              title={expandedSteps.has(step.id) ? fb.tooltipCollapse : fb.tooltipExpand}
            >
              <svg className={`w-4 h-4 transition-transform ${expandedSteps.has(step.id) ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => deleteStep(stepIdx)}
              disabled={steps.length <= 1}
              className="p-1.5 text-muted-foreground hover:text-red-500 disabled:opacity-30 transition-colors"
              title={fb.tooltipDeleteStep}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>

          {/* Fields list */}
          {expandedSteps.has(step.id) && (
            <div className="p-4 space-y-2">
              {step.fields.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">{fb.noFields}</p>
              )}

              {step.fields.map((field, fieldIdx) => {
                const editKey = `${stepIdx}-${fieldIdx}`;
                return (
                <FieldRow
                  key={editKey}
                  field={field}
                  fieldIdx={fieldIdx}
                  stepIdx={stepIdx}
                  totalFields={step.fields.length}
                  isEditing={editingField === editKey}
                  previousFields={getPreviousFields(stepIdx)}
                  fieldTypeLabels={FIELD_TYPE_LABELS}
                  fb={fb}
                  onToggleEdit={() => setEditingField(editingField === editKey ? null : editKey)}
                  onUpdate={(patch) => updateField(stepIdx, fieldIdx, patch)}
                  onDelete={() => deleteField(stepIdx, fieldIdx)}
                  onMoveUp={() => {
                    if (fieldIdx > 0) updateStep(stepIdx, { fields: move(step.fields, fieldIdx, fieldIdx - 1) });
                  }}
                  onMoveDown={() => {
                    if (fieldIdx < step.fields.length - 1) updateStep(stepIdx, { fields: move(step.fields, fieldIdx, fieldIdx + 1) });
                  }}
                />
                );
              })}

              <button
                type="button"
                onClick={() => addField(stepIdx)}
                disabled={step.fields.length >= 20}
                className="w-full mt-2 py-2 inline-flex items-center justify-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {fb.addField}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface FieldRowProps {
  field: FieldDef;
  fieldIdx: number;
  stepIdx: number;
  totalFields: number;
  isEditing: boolean;
  previousFields: FieldDef[];
  fieldTypeLabels: Record<FieldType, string>;
  fb: ReturnType<typeof useTranslations>["admin"]["config"]["formBuilder"];
  onToggleEdit: () => void;
  onUpdate: (patch: Partial<FieldDef>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function FieldRow({ field, fieldIdx, totalFields, isEditing, previousFields, fieldTypeLabels, fb, onToggleEdit, onUpdate, onDelete, onMoveUp, onMoveDown }: FieldRowProps) {
  const hasOptions = field.type === "select" || field.type === "radio";
  const hasVisibleWhen = !!field.visibleWhen;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button type="button" onClick={onMoveUp} disabled={fieldIdx === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25" title={fb.tooltipMoveUp}>
            <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor"><polygon points="5,1 9,9 1,9"/></svg>
          </button>
          <button type="button" onClick={onMoveDown} disabled={fieldIdx === totalFields - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25" title={fb.tooltipMoveDown}>
            <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor"><polygon points="5,9 9,1 1,1"/></svg>
          </button>
        </div>

        <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${FIELD_TYPE_COLORS[field.type]}`}>
          {fieldTypeLabels[field.type]}
        </span>

        <span className="flex-1 text-sm text-foreground truncate">{field.label}</span>

        {field.required && (
          <span className="text-red-500 text-xs flex-shrink-0" title={fb.required}>*</span>
        )}
        {hasVisibleWhen && (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 text-xs flex-shrink-0">
            {fb.conditional}
          </span>
        )}

        <button type="button" onClick={onToggleEdit} className="px-2 py-1 text-xs text-blue-600 hover:text-blue-700 font-medium flex-shrink-0"
          title={isEditing ? fb.tooltipCollapse : fb.tooltipExpand}>
          {isEditing ? fb.close : fb.edit}
        </button>

        <button type="button" onClick={onDelete} className="p-1 text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0"
          title={fb.tooltipDelete}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Expanded editor */}
      {isEditing && (
        <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Type */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{fb.type}</label>
              <select
                value={field.type}
                onChange={(e) => onUpdate({ type: e.target.value as FieldType })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
              >
                {(Object.keys(fieldTypeLabels) as FieldType[]).map((t) => (
                  <option key={t} value={t}>{fieldTypeLabels[t]}</option>
                ))}
              </select>
            </div>

            {/* ID */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{fb.id}</label>
              <input
                type="text"
                value={field.id}
                onChange={(e) => onUpdate({ id: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
              />
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{fb.label} *</label>
            <input
              type="text"
              value={field.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
            />
          </div>

          {field.type !== "section_header" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{fb.placeholder}</label>
                  <input
                    type="text"
                    value={field.placeholder ?? ""}
                    onChange={(e) => onUpdate({ placeholder: e.target.value || undefined })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{fb.defaultValue}</label>
                  <input
                    type="text"
                    value={field.defaultValue ?? ""}
                    onChange={(e) => onUpdate({ defaultValue: e.target.value || undefined })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">{fb.helpText}</label>
                <input
                  type="text"
                  value={field.helpText ?? ""}
                  onChange={(e) => onUpdate({ helpText: e.target.value || undefined })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                  placeholder={fb.helpTextHint}
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!field.required}
                    onChange={(e) => onUpdate({ required: e.target.checked })}
                    className="rounded border-border"
                  />
                  {fb.required}
                </label>
              </div>

              {/* dbKey */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{fb.dbKey}</label>
                <input
                  type="text"
                  value={field.dbKey ?? ""}
                  onChange={(e) => onUpdate({ dbKey: e.target.value || undefined })}
                  className="w-full max-w-xs border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                  placeholder={field.id}
                />
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  {fb.dbKeyWarning}
                </p>
              </div>

              {/* Options for select/radio */}
              {hasOptions && (
                <OptionsEditor
                  options={field.options ?? []}
                  addOptionLabel={fb.addOption}
                  onChange={(opts) => onUpdate({ options: opts })}
                />
              )}

              {/* Conditional visibility */}
              <VisibleWhenEditor
                visibleWhen={field.visibleWhen}
                previousFields={previousFields}
                fb={fb}
                onChange={(vw) => onUpdate({ visibleWhen: vw })}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OptionsEditor({
  options,
  addOptionLabel,
  onChange,
}: {
  options: FieldOption[];
  addOptionLabel: string;
  onChange: (opts: FieldOption[]) => void;
}) {
  const tr = useTranslations();
  const fb = tr.admin.config.formBuilder;

  function updateOption(i: number, patch: Partial<FieldOption>) {
    const updated = [...options];
    updated[i] = { ...updated[i], ...patch };
    onChange(updated);
  }

  function addOption() {
    onChange([...options, { value: `option_${options.length + 1}`, label: fb.newFieldLabel }]);
  }

  function deleteOption(i: number) {
    onChange(options.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-2">{fb.options}</label>
      <div className="space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={opt.value}
              onChange={(e) => updateOption(i, { value: e.target.value })}
              className="w-28 border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 bg-background text-foreground"
              placeholder={fb.valuePlaceholder}
            />
            <input
              type="text"
              value={opt.label}
              onChange={(e) => updateOption(i, { label: e.target.value })}
              className="flex-1 border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-background text-foreground"
              placeholder={fb.label}
            />
            <input
              type="text"
              value={opt.description ?? ""}
              onChange={(e) => updateOption(i, { description: e.target.value || undefined })}
              className="flex-1 border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-background text-foreground"
              placeholder={fb.helpTextHint}
            />
            <button type="button" onClick={() => deleteOption(i)} className="p-1 text-muted-foreground hover:text-red-500">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
        <button type="button" onClick={addOption} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
          {addOptionLabel}
        </button>
      </div>
    </div>
  );
}

type VisibleWhenMode = "none" | "single" | "all" | "any";

function getMode(vw: VisibleWhenMulti | undefined): VisibleWhenMode {
  if (!vw) return "none";
  if ("field" in vw) return "single";
  if ("all" in vw) return "all";
  if ("any" in vw) return "any";
  return "none";
}

function newSingleCondition(previousFields: FieldDef[]): VisibleWhen {
  return { field: previousFields[0]?.id ?? "", operator: "eq", value: "" };
}

function SingleConditionRow({
  condition,
  previousFields,
  fb,
  onChange,
  onRemove,
}: {
  condition: VisibleWhen;
  previousFields: FieldDef[];
  fb: ReturnType<typeof useTranslations>["admin"]["config"]["formBuilder"];
  onChange: (c: VisibleWhen) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value })}
        className="border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-background text-foreground"
      >
        <option value="">{fb.fieldSelectPlaceholder}</option>
        {previousFields.map((f) => (
          <option key={f.id} value={f.id}>{f.label}</option>
        ))}
      </select>

      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as VisibleWhen["operator"] })}
        className="border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-background text-foreground"
      >
        <option value="eq">{fb.operatorEquals}</option>
        <option value="neq">{fb.operatorNotEquals}</option>
        <option value="in">{fb.operatorIn}</option>
        <option value="notIn">{fb.operatorNotIn}</option>
      </select>

      <input
        type="text"
        value={Array.isArray(condition.value) ? condition.value.join(",") : condition.value}
        onChange={(e) => {
          const v = e.target.value;
          const isMulti = condition.operator === "in" || condition.operator === "notIn";
          onChange({ ...condition, value: isMulti ? v.split(",").map((x) => x.trim()) : v });
        }}
        className="border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-background text-foreground"
        placeholder={condition.operator === "in" || condition.operator === "notIn" ? fb.valuesPlaceholder : fb.valuePlaceholder}
      />

      {onRemove && (
        <button type="button" onClick={onRemove} className="p-1 text-muted-foreground hover:text-red-500" title={fb.tooltipDelete}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function VisibleWhenEditor({
  visibleWhen,
  previousFields,
  fb,
  onChange,
}: {
  visibleWhen: FieldDef["visibleWhen"];
  previousFields: FieldDef[];
  fb: ReturnType<typeof useTranslations>["admin"]["config"]["formBuilder"];
  onChange: (vw: FieldDef["visibleWhen"]) => void;
}) {
  const mode = getMode(visibleWhen);
  const enabled = mode !== "none";

  function handleModeChange(newMode: VisibleWhenMode) {
    if (newMode === "none") {
      onChange(undefined);
    } else if (newMode === "single") {
      onChange(newSingleCondition(previousFields));
    } else if (newMode === "all") {
      onChange({ all: [newSingleCondition(previousFields)] });
    } else if (newMode === "any") {
      onChange({ any: [newSingleCondition(previousFields)] });
    }
  }

  function toggle() {
    if (enabled) {
      onChange(undefined);
    } else {
      onChange(newSingleCondition(previousFields));
    }
  }

  // Multi-condition helpers
  function getConditions(): VisibleWhen[] {
    if (!visibleWhen) return [];
    if ("all" in visibleWhen) return visibleWhen.all;
    if ("any" in visibleWhen) return visibleWhen.any;
    return [];
  }

  function updateConditions(conditions: VisibleWhen[]) {
    if (mode === "all") onChange({ all: conditions });
    else if (mode === "any") onChange({ any: conditions });
  }

  function addCondition() {
    updateConditions([...getConditions(), newSingleCondition(previousFields)]);
  }

  function removeCondition(i: number) {
    const next = getConditions().filter((_, idx) => idx !== i);
    if (next.length === 0) {
      onChange(undefined);
    } else {
      updateConditions(next);
    }
  }

  function updateCondition(i: number, c: VisibleWhen) {
    const next = [...getConditions()];
    next[i] = c;
    updateConditions(next);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={toggle}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            enabled ? "bg-blue-600" : "bg-muted"
          }`}
        >
          <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${enabled ? "translate-x-4" : "translate-x-0"}`} />
        </button>
        <label className="text-xs text-muted-foreground">{fb.conditional}</label>
      </div>

      {enabled && (
        <div className="space-y-2">
          {/* Mode selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{fb.conditionMode}</span>
            <select
              value={mode}
              onChange={(e) => handleModeChange(e.target.value as VisibleWhenMode)}
              className="border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-background text-foreground"
            >
              <option value="single">{fb.conditionSimple}</option>
              <option value="all">{fb.conditionAll}</option>
              <option value="any">{fb.conditionAny}</option>
            </select>
          </div>

          {/* Single mode */}
          {mode === "single" && visibleWhen && "field" in visibleWhen && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">{fb.conditionIf}</span>
              <SingleConditionRow
                condition={visibleWhen}
                previousFields={previousFields}
                fb={fb}
                onChange={(c) => onChange(c)}
              />
            </div>
          )}

          {/* Multi mode (all/any) */}
          {(mode === "all" || mode === "any") && (
            <div className="space-y-2">
              {getConditions().map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground pt-1.5 w-6 shrink-0 text-right">
                    {i === 0 ? fb.conditionIf : mode === "all" ? fb.conditionAnd : fb.conditionOr}
                  </span>
                  <SingleConditionRow
                    condition={c}
                    previousFields={previousFields}
                    fb={fb}
                    onChange={(updated) => updateCondition(i, updated)}
                    onRemove={getConditions().length > 1 ? () => removeCondition(i) : undefined}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={addCondition}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-1"
              >
                {fb.addCondition}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
