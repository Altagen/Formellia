"use client";

import { Plus, Trash2 } from "lucide-react";
import type { FieldDef, RepeaterColumn } from "@/types/config";

type Row = Record<string, string>;

interface RepeaterFieldProps {
  field: FieldDef;
  value: string; // JSON.stringify(Row[])
  onChange: (value: string) => void;
  error?: string;
  addRowLabel?: string;
  removeRowLabel?: string;
}

function parseRows(value: string): Row[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed as Row[];
  } catch {
    // ignore
  }
  return [];
}

const COL_WIDTH: Record<string, string> = {
  sm: "w-24 min-w-[6rem]",
  md: "w-40 min-w-[10rem]",
  lg: "w-64 min-w-[16rem]",
};

function CellInput({
  col,
  value,
  onChange,
}: {
  col: RepeaterColumn;
  value: string;
  onChange: (v: string) => void;
}) {
  const base =
    "h-8 w-full px-2 text-sm border border-input rounded bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] focus:border-[var(--brand-primary)]";

  if (col.type === "select" && col.options?.length) {
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={base}
      >
        <option value="">—</option>
        {col.options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={col.placeholder}
      className={base}
    />
  );
}

export function RepeaterField({
  field,
  value,
  onChange,
  error,
  addRowLabel = "Add a row",
  removeRowLabel = "Delete",
}: RepeaterFieldProps) {
  const columns: RepeaterColumn[] = field.repeaterColumns ?? [];
  const maxRows = field.repeaterMax ?? 20;
  const minRows = field.repeaterMin ?? 0;
  const rows = parseRows(value);

  function update(next: Row[]) {
    onChange(JSON.stringify(next));
  }

  function addRow() {
    if (rows.length >= maxRows) return;
    const empty: Row = {};
    for (const col of columns) empty[col.id] = "";
    update([...rows, empty]);
  }

  function removeRow(i: number) {
    if (rows.length <= minRows) return;
    update(rows.filter((_, idx) => idx !== i));
  }

  function setCellValue(rowIdx: number, colId: string, v: string) {
    const next = rows.map((r, i) => i === rowIdx ? { ...r, [colId]: v } : r);
    update(next);
  }

  if (columns.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{field.label}</span>

      <div className="overflow-x-auto rounded-lg border border-input">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              {columns.map(col => (
                <th
                  key={col.id}
                  className={`px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground border-b border-input ${COL_WIDTH[col.width ?? "md"]}`}
                >
                  {col.label}
                  {col.required && <span className="text-red-500 ml-0.5">*</span>}
                </th>
              ))}
              <th className="w-8 border-b border-input" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-4 text-center text-xs text-muted-foreground"
                >
                  —
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-input last:border-b-0 hover:bg-muted/20 transition-colors">
                {columns.map(col => (
                  <td key={col.id} className="px-1.5 py-1">
                    <CellInput
                      col={col}
                      value={row[col.id] ?? ""}
                      onChange={v => setCellValue(i, col.id, v)}
                    />
                  </td>
                ))}
                <td className="px-1 py-1">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={rows.length <= minRows}
                    className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30"
                    title={removeRowLabel}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length < maxRows && (
        <button
          type="button"
          onClick={addRow}
          className="self-start flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--brand-primary)] border border-[var(--brand-primary)]/40 rounded-lg hover:bg-[var(--brand-primary)]/5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {field.repeaterAddLabel ?? addRowLabel}
        </button>
      )}

      {field.helpText && !error && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
