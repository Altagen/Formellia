"use client";

import { useState } from "react";
import type { TableColumnDef, StepDef } from "@/types/config";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, Trash2, Plus, Eye, EyeOff, Settings2, ArrowUpRight } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";

interface ColumnsTabProps {
  columns: TableColumnDef[];
  formSteps: StepDef[];
  onChange: (cols: TableColumnDef[]) => void;
  /** compact=true hides the context banner — used when embedded inside widget config */
  compact?: boolean;
}

const BUILTIN_SOURCE_KEYS = [
  { value: "email",        key: "builtinEmail" as const,       icon: "📧" },
  { value: "submittedAt",  key: "builtinSubmittedAt" as const, icon: "📅" },
  { value: "status",       key: "builtinStatus" as const,      icon: "🏷" },
  { value: "priority",     key: "builtinPriority" as const,    icon: "⚡" },
  { value: "dateEcheance", key: "builtinDeadline" as const,    icon: "⏰" },
];

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function ColumnsTab({ columns, formSteps, onChange, compact = false }: ColumnsTabProps) {
  const tr = useTranslations();
  const c = tr.admin.config.columns;
  const [editingId, setEditingId] = useState<string | null>(null);

  const BUILTIN_SOURCES = BUILTIN_SOURCE_KEYS.map(s => ({ value: s.value, label: c[s.key], icon: s.icon }));

  const fieldSources = formSteps
    .flatMap(s => s.fields)
    .filter(f => f.type !== "section_header")
    .map(f => ({ value: f.dbKey ?? f.id, label: f.label }));

  const allSources = [...BUILTIN_SOURCES, ...fieldSources];

  function update(id: string, patch: Partial<TableColumnDef>) {
    onChange(columns.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  function remove(id: string) {
    onChange(columns.filter(c => c.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function addColumn() {
    const id = `col_${Date.now()}`;
    onChange([...columns, { id, label: c.newColumn, source: "email" }]);
    setEditingId(id);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Context banner — hidden in compact mode */}
      {!compact && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/50 border border-border">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{c.title}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {c.helpText.split("⚙")[0]}<Eye className="inline w-3 h-3 mx-0.5" />{" "}
              {c.helpText.split("⚙")[0].includes("et") ? "" : "et "}<EyeOff className="inline w-3 h-3 mx-0.5" /> {c.helpText.split(",")[1]}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {(() => {
            const vis = columns.filter(col => !col.hidden).length;
            const hid = columns.filter(col => col.hidden).length;
            return `${vis} ${vis !== 1 ? c.visiblePlural : c.visibleSingular}${hid > 0 ? ` · ${hid} ${hid !== 1 ? c.hiddenPlural : c.hiddenSingular}` : ""}`;
          })()}
        </p>
        <Button type="button" onClick={addColumn} size="sm" variant="default" className="gap-1.5">
          <Plus className="w-4 h-4" />
          {c.addColumn}
        </Button>
      </div>

      {columns.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border-2 border-dashed rounded-xl">
          <Eye className="w-8 h-8 mx-auto mb-3 opacity-20" />
          {c.noColumns}
          <br />
          <button type="button" onClick={addColumn} className="text-primary underline mt-1 text-sm">
            {c.addFirst}
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {columns.map((col, i) => {
            const isEditing = editingId === col.id;
            const knownSource = allSources.find(s => s.value === col.source);
            const isCustom = !knownSource;

            return (
              <div
                key={col.id}
                className={cn(
                  "rounded-xl border transition-all",
                  col.hidden ? "opacity-50 bg-muted/20 border-border/50" : "bg-card border-border",
                  isEditing && "ring-2 ring-ring/30 opacity-100"
                )}
              >
                {/* Main row */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                  {/* Order */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => i > 0 && onChange(move(columns, i, i - 1))}
                      disabled={i === 0}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-20 transition-colors"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => i < columns.length - 1 && onChange(move(columns, i, i + 1))}
                      disabled={i === columns.length - 1}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-20 transition-colors"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Eye toggle */}
                  <button
                    type="button"
                    onClick={() => update(col.id, { hidden: !col.hidden })}
                    title={col.hidden ? c.tooltipShow : c.tooltipHide}
                    className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent"
                  >
                    {col.hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>

                  {/* Label + source */}
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium truncate", col.hidden ? "text-muted-foreground line-through" : "text-foreground")}>
                      {col.label || <span className="italic text-muted-foreground">{c.untitled}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {knownSource
                        ? `${"icon" in knownSource ? knownSource.icon + " " : ""}${knownSource.label}`
                        : col.source}
                    </p>
                  </div>

                  {/* Edit */}
                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : col.id)}
                    className={cn(
                      "w-9 h-9 flex items-center justify-center rounded-lg transition-colors shrink-0",
                      isEditing ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => remove(col.id)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Edit panel */}
                {isEditing && (
                  <div className="px-4 pb-4 pt-2 border-t border-border/60 space-y-3 bg-muted/20 rounded-b-xl">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{c.columnHeader}</label>
                      <Input
                        value={col.label}
                        onChange={e => update(col.id, { label: e.target.value })}
                        placeholder={c.headerPlaceholder}
                        className="text-sm"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{c.dataSource}</label>
                      <select
                        value={isCustom ? "__custom__" : col.source}
                        onChange={e => { if (e.target.value !== "__custom__") update(col.id, { source: e.target.value }); }}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
                      >
                        <optgroup label={c.systemGroup}>
                          {BUILTIN_SOURCES.map(s => (
                            <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
                          ))}
                        </optgroup>
                        {fieldSources.length > 0 && (
                          <optgroup label={c.formGroup}>
                            {fieldSources.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </optgroup>
                        )}
                        <option value="__custom__">{c.customOption}</option>
                      </select>
                    </div>
                    {isCustom && (
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{c.customKey}</label>
                        <Input
                          value={col.source}
                          onChange={e => update(col.id, { source: e.target.value })}
                          placeholder={c.keyPlaceholder}
                          className="text-sm font-mono"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
