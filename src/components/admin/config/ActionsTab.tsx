"use client";

import { useState } from "react";
import type { FormAction, PrintViewAction, PrintCondition } from "@/types/formActions";
import type { FieldDef } from "@/types/config";
import { useTranslations } from "@/lib/context/LocaleContext";
import { PrintTemplateEditor } from "./print/PrintTemplateEditor";

interface ActionsTabProps {
  actions: FormAction[] | undefined;
  fieldDefs: FieldDef[];
  logoUrl?: string;
  brandColor?: string;
  formName?: string;
  formLocale?: string;
  onChange: (actions: FormAction[]) => void;
}

const DEFAULT_PRINT_TEMPLATE: PrintViewAction["template"] = {
  header: { showLogo: true, title: "{{formName}}", showDate: true },
  body: [
    { type: "field_list", style: "table" },
  ],
  footer: { text: "{{formName}} — {{submittedAt}}" },
};

export function ActionsTab({
  actions, fieldDefs, logoUrl, brandColor, formName, formLocale, onChange,
}: ActionsTabProps) {
  const tr = useTranslations();
  const a = tr.admin.config.actions;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedRunIfId, setExpandedRunIfId] = useState<string | null>(null);

  const list = actions ?? [];

  function addAction(type: FormAction["type"]) {
    if (type === "save_to_db") {
      onChange([...list, { id: crypto.randomUUID(), type: "save_to_db", enabled: true }]);
    } else if (type === "print_view") {
      onChange([...list, {
        id: crypto.randomUUID(),
        type: "print_view",
        enabled: true,
        template: DEFAULT_PRINT_TEMPLATE,
      }]);
    }
  }

  // Common properties shared by all action types (label, enabled, runIf)
  type CommonPatch = { label?: string; enabled?: boolean; runIf?: PrintCondition | undefined };
  function updateAction(id: string, patch: CommonPatch) {
    onChange(list.map(act => act.id === id ? { ...act, ...patch } : act));
  }

  // PrintViewAction-specific properties — type guard ensures no cross-type pollution
  function updatePrintViewAction(id: string, patch: Partial<Omit<PrintViewAction, "id" | "type">>) {
    onChange(list.map(act =>
      act.id === id && act.type === "print_view" ? { ...act, ...patch } : act
    ));
  }

  function removeAction(id: string) {
    onChange(list.filter(act => act.id !== id));
  }

  function moveAction(id: string, dir: -1 | 1) {
    const idx = list.findIndex(act => act.id === id);
    if (idx < 0) return;
    const next = [...list];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  const typeLabel = (type: FormAction["type"]) => {
    switch (type) {
      case "save_to_db":   return a.typeSaveToDb;
      case "print_view":   return a.typePrintView;
      case "webhook_post": return a.typeWebhookPost;
    }
  };

  const inputClass = "w-full px-2 py-1.5 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
  const labelClass = "text-xs font-medium text-muted-foreground";
  const templateLabels = a.printTemplate;

  return (
    <div className="space-y-4 py-2">
      <div>
        <p className="text-sm font-semibold text-foreground">{a.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
      </div>

      {list.length === 0 && (
        <p className="text-xs text-muted-foreground italic">{a.noActions}</p>
      )}

      <div className="space-y-2">
        {list.map((action, idx) => (
          <div key={action.id} className="border border-border rounded-lg overflow-hidden">
            {/* Card header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
              <input
                type="checkbox"
                checked={action.enabled !== false}
                onChange={e => updateAction(action.id, { enabled: e.target.checked })}
                className="shrink-0"
                title={a.enabledLabel}
              />
              <span className="text-xs font-semibold text-foreground shrink-0">
                {typeLabel(action.type)}
              </span>
              <input
                type="text"
                value={action.label ?? ""}
                onChange={e => updateAction(action.id, { label: e.target.value || undefined })}
                placeholder={a.labelPlaceholder}
                className="flex-1 min-w-0 text-xs px-2 py-1 rounded border border-border bg-background text-foreground focus:outline-none"
              />
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => moveAction(action.id, -1)} disabled={idx === 0}
                  className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
                  title={a.moveUp}>▲</button>
                <button type="button" onClick={() => moveAction(action.id, 1)} disabled={idx === list.length - 1}
                  className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
                  title={a.moveDown}>▼</button>
                {/* runIf toggle — all action types */}
                <button type="button"
                  onClick={() => setExpandedRunIfId(expandedRunIfId === action.id ? null : action.id)}
                  className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                    action.runIf
                      ? "border-amber-400/60 text-amber-500 bg-amber-50 dark:bg-amber-950/30"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={a.runIfLabel}
                >
                  {action.runIf ? "●" : "○"} {a.runIfLabel}
                </button>
                {action.type === "print_view" && (
                  <button type="button"
                    onClick={() => setExpandedId(expandedId === action.id ? null : action.id)}
                    className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground"
                  >
                    {expandedId === action.id ? "▲" : "▼"} {a.configureTemplate}
                  </button>
                )}
                <button type="button" onClick={() => removeAction(action.id)}
                  className="text-xs px-1.5 py-0.5 rounded border border-destructive/30 text-destructive hover:bg-destructive/10"
                  title={a.remove}>✕</button>
              </div>
            </div>

            {/* runIf editor */}
            {expandedRunIfId === action.id && (
              <div className="px-3 py-2 border-t border-border bg-amber-50/40 dark:bg-amber-950/10 space-y-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!action.runIf}
                    onChange={e => updateAction(action.id, {
                      runIf: e.target.checked ? { fieldId: "", operator: "not_empty" } : undefined,
                    })}
                  />
                  {a.runIfEnabled}
                </label>
                {action.runIf && (
                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <p className={labelClass}>{a.runIfField}</p>
                      <select
                        value={action.runIf.fieldId}
                        onChange={e => updateAction(action.id, {
                          runIf: { ...action.runIf!, fieldId: e.target.value },
                        })}
                        className={inputClass}
                      >
                        <option value="">{templateLabels.chooseField}</option>
                        {fieldDefs.filter(f => f.type !== "section_header").map(f => (
                          <option key={f.id} value={f.id}>{f.label || f.id}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className={labelClass}>{a.runIfOperator}</p>
                      <select
                        value={action.runIf.operator}
                        onChange={e => updateAction(action.id, {
                          runIf: { ...action.runIf!, operator: e.target.value as PrintCondition["operator"] },
                        })}
                        className={inputClass}
                      >
                        <option value="eq">{templateLabels.opEq}</option>
                        <option value="neq">{templateLabels.opNeq}</option>
                        <option value="empty">{templateLabels.opEmpty}</option>
                        <option value="not_empty">{templateLabels.opNotEmpty}</option>
                      </select>
                    </div>
                    {(action.runIf.operator === "eq" || action.runIf.operator === "neq") && (
                      <div>
                        <p className={labelClass}>{a.runIfValue}</p>
                        <input
                          type="text"
                          value={action.runIf.value ?? ""}
                          onChange={e => updateAction(action.id, {
                            runIf: { ...action.runIf!, value: e.target.value },
                          })}
                          className={inputClass}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* PrintTemplateEditor — print_view only */}
            {action.type === "print_view" && expandedId === action.id && (
              <div className="px-3 pb-3 border-t border-border space-y-2 pt-2">
                {/* Filename template */}
                <div>
                  <p className={labelClass}>{a.filenameLabel}</p>
                  <input
                    type="text"
                    value={action.filenameTemplate ?? ""}
                    onChange={e => updatePrintViewAction(action.id, { filenameTemplate: e.target.value || undefined })}
                    placeholder={a.filenamePlaceholder}
                    className={inputClass}
                  />
                </div>
                <PrintTemplateEditor
                  template={action.template}
                  fieldDefs={fieldDefs}
                  formName={formName}
                  formLocale={formLocale}
                  logoUrl={logoUrl}
                  brandColor={brandColor}
                  labels={templateLabels}
                  onChange={template => updatePrintViewAction(action.id, { template })}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add action */}
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{a.addAction}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addAction("save_to_db")}
            className="text-xs px-3 py-1.5 rounded-md bg-background border border-border text-foreground font-medium shadow-sm hover:bg-muted/60 hover:border-primary/40 transition-colors"
          >
            + {a.typeSaveToDb}
          </button>
          <button
            type="button"
            onClick={() => addAction("print_view")}
            className="text-xs px-3 py-1.5 rounded-md bg-background border border-border text-foreground font-medium shadow-sm hover:bg-muted/60 hover:border-primary/40 transition-colors"
          >
            + {a.typePrintView}
          </button>
          <button
            type="button"
            disabled
            className="text-xs px-3 py-1.5 rounded-md bg-background border border-border text-muted-foreground opacity-40 cursor-not-allowed"
            title={a.webhookComingSoon}
          >
            + {a.typeWebhookPost}
            <span className="ml-1 text-[10px] italic">({a.webhookComingSoon})</span>
          </button>
        </div>
      </div>
    </div>
  );
}
