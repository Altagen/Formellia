"use client";

import { useState, useEffect, useRef } from "react";
import type { ExternalDataset, ColumnDef } from "@/types/datasets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Upload, Play, Pencil, X, ChevronDown, ChevronUp, Table2, Settings, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations, useLocale } from "@/lib/context/LocaleContext";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// ── Types ─────────────────────────────────────────────────────

interface DatasetFormState {
  name: string;
  description: string;
  sourceType: "file" | "api";
  apiUrl: string;
  apiHeaders: { key: string; value: string }[];
  importMode: "append" | "replace" | "dedup";
  dedupKey: string;
  fieldMapRows: { from: string; to: string }[];
  showFieldMap: boolean;
  file: File | null;
  pendingColumnDefs: ColumnDef[] | null;
}

interface PreviewData {
  columns: string[];
  types: Record<string, "string" | "number" | "boolean" | "date">;
  rows: Record<string, unknown>[];
}

// ── Helpers ───────────────────────────────────────────────────

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function inferType(values: unknown[]): "string" | "number" | "boolean" | "date" {
  const sample = values.filter(v => v != null && v !== "").slice(0, 8);
  if (sample.length === 0) return "string";
  if (sample.every(v => v === true || v === false || v === "true" || v === "false")) return "boolean";
  if (sample.every(v => !isNaN(Number(v)) && String(v).trim() !== "")) return "number";
  if (sample.every(v => {
    const s = String(v);
    return s.length >= 8 && !isNaN(Date.parse(s));
  })) return "date";
  return "string";
}

const TYPE_COLORS: Record<string, string> = {
  string:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  number:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  boolean: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  date:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={cn("ml-1 px-1 py-0 rounded text-[10px] font-mono leading-tight", TYPE_COLORS[type] ?? TYPE_COLORS.string)}>
      {type}
    </span>
  );
}

// ── CSV client-side parser ─────────────────────────────────────

async function parseCSVPreview(file: File): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { columns: [], rows: [] };

  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const columns = parseLine(lines[0]);
  const rows = lines.slice(1, 31).map(line => {
    const values = parseLine(line);
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => { row[col] = values[i] ?? ""; });
    return row;
  });
  return { columns, rows };
}

// ── Auto-detect columnDefs ────────────────────────────────────

function inferColType(colName: string, values: unknown[]): ColumnDef["type"] {
  const lower = colName.toLowerCase().trim();
  // Email: exact or ends-with match only (avoids "Email Subscription Status" → email)
  if (lower === "email" || lower === "e-mail" || lower === "mail" ||
      lower.endsWith(" email") || lower.endsWith("_email")) return "email";
  // Currency: value-related words ("total" alone excluded — it can be a count)
  if (lower.includes("amount") || lower.includes("price") || lower.includes("spent") ||
      lower.includes("revenue") || lower.includes("cost") || lower.includes("fee") ||
      lower.includes("earning") || lower.includes("income")) return "currency";
  const sample = values.filter(v => v != null && v !== "").slice(0, 8);
  if (sample.length > 0 && sample.every(v => {
    const s = String(v);
    return s.length >= 8 && !isNaN(Date.parse(s));
  })) return "date";
  if (sample.length > 0 && sample.every(v => v === true || v === false || v === "true" || v === "false")) return "boolean";
  if (sample.length > 0 && sample.every(v => !isNaN(Number(v)) && String(v).trim() !== "")) return "number";
  return "text";
}

function inferColRole(colName: string, type: ColumnDef["type"]): ColumnDef["role"] {
  const lower = colName.toLowerCase().trim();
  // Email: exact or ends-with match only
  if (lower === "email" || lower === "e-mail" || lower === "mail" ||
      lower.endsWith(" email") || lower.endsWith("_email")) return "email";
  if (lower.includes("date") || lower.includes("since") || lower.includes("created") ||
      lower.endsWith("_at")) return "submittedAt";
  // Status: exact match only (not compound like "Email Subscription Status")
  if (lower === "status") return "status";
  if (lower === "priority") return "priority";
  if (lower.includes("echeance") || lower.includes("deadline") || lower.includes("due")) return "dueDate";
  if (type === "currency") return "amount";
  return null;
}

function buildAutoColumnDefs(columns: string[], rows: Record<string, unknown>[]): ColumnDef[] {
  return columns.map(col => {
    const values = rows.map(r => r[col]);
    const type = inferColType(col, values);
    const role = inferColRole(col, type);
    return { source: col, type, role: role ?? undefined };
  });
}

// ── Form helpers ──────────────────────────────────────────────

const emptyForm = (): DatasetFormState => ({
  name: "", description: "", sourceType: "file", apiUrl: "",
  apiHeaders: [], importMode: "replace", dedupKey: "", fieldMapRows: [], showFieldMap: false,
  file: null, pendingColumnDefs: null,
});

function formToPayload(f: DatasetFormState) {
  const apiHeaders: Record<string, string> = {};
  for (const h of f.apiHeaders) {
    if (h.key.trim()) apiHeaders[h.key.trim()] = h.value;
  }
  const fieldMap: Record<string, string> = {};
  for (const r of f.fieldMapRows) {
    if (r.from.trim()) fieldMap[r.from.trim()] = r.to.trim();
  }
  return {
    name: f.name,
    description: f.description || undefined,
    sourceType: f.sourceType,
    apiUrl: f.sourceType === "api" ? f.apiUrl || undefined : undefined,
    apiHeaders: f.sourceType === "api" && Object.keys(apiHeaders).length > 0 ? apiHeaders : undefined,
    importMode: f.importMode,
    dedupKey: f.importMode === "dedup" ? f.dedupKey || undefined : undefined,
    fieldMap: Object.keys(fieldMap).length > 0 ? fieldMap : undefined,
    columnDefs: f.pendingColumnDefs ?? undefined,
  };
}

function datasetToForm(d: ExternalDataset): DatasetFormState {
  const apiHeaders = d.apiHeaders
    ? Object.entries(d.apiHeaders).map(([key, value]) => ({ key, value }))
    : [];
  const fieldMapRows = d.fieldMap
    ? Object.entries(d.fieldMap).map(([from, to]) => ({ from, to }))
    : [];
  return {
    name: d.name, description: d.description ?? "", sourceType: d.sourceType,
    apiUrl: d.apiUrl ?? "", apiHeaders, importMode: d.importMode,
    dedupKey: d.dedupKey ?? "", fieldMapRows, showFieldMap: fieldMapRows.length > 0,
    file: null, pendingColumnDefs: null,
  };
}

// ── Schema table (shared) ─────────────────────────────────────

interface SchemaTableProps {
  defs: ColumnDef[];
  onChange: (i: number, patch: Partial<ColumnDef>) => void;
}

function SchemaTable({ defs, onChange }: SchemaTableProps) {
  const { admin: { config: { datasources: ds } } } = useTranslations();

  const typeOptions: { value: ColumnDef["type"]; label: string }[] = [
    { value: "text",     label: ds.schemaTypeText },
    { value: "number",   label: ds.schemaTypeNumber },
    { value: "date",     label: ds.schemaTypeDate },
    { value: "email",    label: ds.schemaTypeEmail },
    { value: "currency", label: ds.schemaTypeCurrency },
    { value: "boolean",  label: ds.schemaTypeBoolean },
  ];

  const roleOptions: { value: ColumnDef["role"]; label: string; hint: string }[] = [
    { value: null,           label: ds.schemaRoleNone,     hint: "" },
    { value: "email",        label: ds.schemaRoleEmail,    hint: ds.schemaHintEmail },
    { value: "submittedAt",  label: ds.schemaRoleDate,     hint: ds.schemaHintDate },
    { value: "status",       label: ds.schemaRoleStatus,   hint: ds.schemaHintStatus },
    { value: "priority",     label: ds.schemaRolePriority, hint: ds.schemaHintPriority },
    { value: "dueDate", label: ds.schemaRoleDeadline, hint: ds.schemaHintDeadline },
    { value: "amount",       label: ds.schemaRoleAmount,   hint: ds.schemaHintAmount },
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-border/40">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-muted/40 border-b border-border/40">
            <th className="px-2.5 py-2 text-left font-medium text-foreground whitespace-nowrap">{ds.schemaColSource}</th>
            <th className="px-2.5 py-2 text-left font-medium text-foreground whitespace-nowrap">{ds.schemaColType}</th>
            <th className="px-2.5 py-2 text-left font-medium text-foreground whitespace-nowrap">{ds.schemaColRole}</th>
            <th className="px-2.5 py-2 text-left font-medium text-foreground whitespace-nowrap">{ds.schemaColLabel}</th>
          </tr>
        </thead>
        <tbody>
          {defs.map((def, i) => {
            const roleOption = roleOptions.find(o => o.value === (def.role ?? null));
            return (
              <tr key={def.source} className={cn("border-b border-border/30 last:border-0", i % 2 === 0 ? "" : "bg-muted/10")}>
                <td className="px-2.5 py-1.5">
                  <span className="font-mono text-foreground">{def.source}</span>
                </td>
                <td className="px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={def.type}
                      onChange={e => {
                        const newType = e.target.value as ColumnDef["type"];
                        const newRole = newType !== "currency" && def.role === "amount" ? undefined : def.role;
                        onChange(i, { type: newType, role: newRole });
                      }}
                      className="h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/40"
                    >
                      {typeOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {def.type === "currency" && (
                      <select
                        value={def.currencySymbol ?? "€"}
                        onChange={e => onChange(i, { currencySymbol: e.target.value })}
                        title={ds.schemaCurrencyLabel}
                        className="h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/40"
                      >
                        <option value="€">€ EUR</option>
                        <option value="$">$ USD</option>
                        <option value="£">£ GBP</option>
                        <option value="CHF">CHF</option>
                        <option value="¥">¥ JPY</option>
                        <option value="CAD $">CAD $</option>
                        <option value="AUD $">AUD $</option>
                        <option value="kr">kr SEK</option>
                        <option value="₹">₹ INR</option>
                        <option value="₩">₩ KRW</option>
                      </select>
                    )}
                  </div>
                </td>
                <td className="px-2.5 py-1.5">
                  <div>
                    <select
                      value={def.role ?? ""}
                      onChange={e => onChange(i, { role: (e.target.value || null) as ColumnDef["role"] })}
                      className="h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/40"
                    >
                      {roleOptions.map(o => (
                        <option key={String(o.value)} value={o.value ?? ""}>{o.label}</option>
                      ))}
                    </select>
                    {roleOption?.hint && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{roleOption.hint}</p>
                    )}
                  </div>
                </td>
                <td className="px-2.5 py-1.5">
                  <input
                    type="text"
                    value={def.label ?? ""}
                    onChange={e => onChange(i, { label: e.target.value || undefined })}
                    placeholder={def.source}
                    className="h-7 w-full rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Inline schema (in create form) ────────────────────────────

interface SchemaInlineProps {
  defs: ColumnDef[];
  onChange: (defs: ColumnDef[]) => void;
}

function SchemaInline({ defs, onChange }: SchemaInlineProps) {
  const { admin: { config: { datasources: ds } } } = useTranslations();

  function update(i: number, patch: Partial<ColumnDef>) {
    onChange(defs.map((d, j) => j === i ? { ...d, ...patch } : d));
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/40 overflow-hidden">
      <div className="flex items-start gap-2 px-3 py-2.5 border-b border-amber-200/60 dark:border-amber-800/30">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            {ds.schemaBannerTitle}
          </p>
          <p className="text-[11px] text-amber-700/80 dark:text-amber-400/70 mt-0.5">
            {ds.schemaBannerDesc}
          </p>
        </div>
      </div>
      <div className="p-2.5">
        <SchemaTable defs={defs} onChange={update} />
      </div>
    </div>
  );
}

// ── Schema Editor (existing datasets) ─────────────────────────

/** Returns the duplicate role value, or null if all roles are unique. */
function validateRoles(defs: ColumnDef[]): ColumnDef["role"] | null {
  const seen = new Set<string>();
  for (const d of defs) {
    if (!d.role) continue;
    if (seen.has(d.role)) return d.role;
    seen.add(d.role);
  }
  return null;
}

interface SchemaEditorProps {
  datasetId: string;
  columnDefs: ColumnDef[];
  onSaved: () => void;
  onClose: () => void;
}

function SchemaEditor({ datasetId, columnDefs: initial, onSaved, onClose }: SchemaEditorProps) {
  const { admin: { config: { datasources: ds } } } = useTranslations();
  const [defs, setDefs] = useState<ColumnDef[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, patch: Partial<ColumnDef>) {
    setDefs(prev => prev.map((d, j) => j === i ? { ...d, ...patch } : d));
    setError(null);
  }

  async function handleSave() {
    const dupRole = validateRoles(defs);
    if (dupRole) {
      // Find label for this role from the role values list
      const roleLabels: Record<string, string> = {
        email: ds.schemaRoleEmail, submittedAt: ds.schemaRoleDate,
        status: ds.schemaRoleStatus, priority: ds.schemaRolePriority,
        dueDate: ds.schemaRoleDeadline, amount: ds.schemaRoleAmount,
      };
      setError(ds.schemaDuplicateRole.replace("{role}", roleLabels[dupRole] ?? dupRole));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const getRes = await fetch(`/api/admin/datasets/${datasetId}`);
      if (!getRes.ok) return;
      const dataset: ExternalDataset = await getRes.json();

      const res = await fetch(`/api/admin/datasets/${datasetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dataset.name,
          description: dataset.description,
          sourceType: dataset.sourceType,
          apiUrl: dataset.apiUrl,
          apiHeaders: dataset.apiHeaders,
          pollIntervalMinutes: dataset.pollIntervalMinutes,
          importMode: dataset.importMode,
          dedupKey: dataset.dedupKey,
          fieldMap: dataset.fieldMap,
          columnDefs: defs,
        }),
      });
      if (res.ok) { onSaved(); onClose(); }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-border/60 px-3 pb-3 pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">{ds.schemaEditorTitle}</p>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{ds.schemaEditorDesc}</p>

      <SchemaTable defs={defs} onChange={update} />

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">{error}</p>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "…" : ds.schemaSave}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{ds.cancel}</Button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export function DataSourcesTab() {
  const tr = useTranslations();
  const ds = tr.admin.config.datasources;
  const locale = useLocale();

  const [datasets, setDatasets] = useState<ExternalDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<DatasetFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [importResults, setImportResults] = useState<Record<string, { msg: string; isError: boolean }>>({});
  const [importingId, setImportingId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Preview state
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});
  const [previewData, setPreviewData] = useState<Record<string, PreviewData | null>>({});
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({});

  // Schema editor state (existing datasets)
  const [schemaOpen, setSchemaOpen] = useState<Record<string, boolean>>({});
  const [schemaColumnDefs, setSchemaColumnDefs] = useState<Record<string, ColumnDef[]>>({});

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  // Inline form validation error (replaces alert())
  const [formError, setFormError] = useState<string | null>(null);

  async function fetchDatasets() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/datasets");
      if (res.ok) setDatasets(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchDatasets(); }, []);

  // ── Preview ─────────────────────────────────────────────────

  async function fetchPreview(id: string) {
    setPreviewLoading(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/admin/datasets/${id}/records?limit=10`);
      if (!res.ok) return;
      const data = await res.json();
      const records: { data: Record<string, unknown> }[] = data.records ?? [];
      if (records.length === 0) {
        setPreviewData(prev => ({ ...prev, [id]: { columns: [], types: {}, rows: [] } }));
        return;
      }
      const allKeys = new Set<string>();
      for (const r of records) Object.keys(r.data).forEach(k => allKeys.add(k));
      const columns = Array.from(allKeys);
      const rows = records.map(r => r.data);
      const types: Record<string, "string" | "number" | "boolean" | "date"> = {};
      for (const col of columns) types[col] = inferType(rows.map(r => r[col]));
      setPreviewData(prev => ({ ...prev, [id]: { columns, types, rows } }));
    } finally {
      setPreviewLoading(prev => ({ ...prev, [id]: false }));
    }
  }

  function togglePreview(id: string) {
    const isOpen = previewOpen[id];
    setPreviewOpen(prev => ({ ...prev, [id]: !isOpen }));
    if (!isOpen && !previewData[id]) fetchPreview(id);
  }

  function refreshPreview(id: string) {
    setPreviewData(prev => ({ ...prev, [id]: null }));
    if (previewOpen[id]) fetchPreview(id);
  }

  // ── Schema editor (existing datasets) ───────────────────────

  async function openSchemaEditor(dataset: ExternalDataset) {
    const id = dataset.id;
    if (dataset.columnDefs && dataset.columnDefs.length > 0) {
      setSchemaColumnDefs(prev => ({ ...prev, [id]: dataset.columnDefs! }));
      setSchemaOpen(prev => ({ ...prev, [id]: true }));
      return;
    }
    const res = await fetch(`/api/admin/datasets/${id}/records?limit=30`);
    if (res.ok) {
      const data = await res.json();
      const records: { data: Record<string, unknown> }[] = data.records ?? [];
      if (records.length > 0) {
        const allKeys = new Set<string>();
        for (const r of records) Object.keys(r.data).forEach(k => allKeys.add(k));
        const columns = Array.from(allKeys);
        const rows = records.map(r => r.data);
        setSchemaColumnDefs(prev => ({ ...prev, [id]: buildAutoColumnDefs(columns, rows) }));
      }
    }
    setSchemaOpen(prev => ({ ...prev, [id]: true }));
  }

  function closeSchemaEditor(id: string) {
    setSchemaOpen(prev => ({ ...prev, [id]: false }));
  }

  // ── CRUD ────────────────────────────────────────────────────

  function startCreate() {
    setForm(emptyForm());
    setShowCreateForm(true);
    setEditingId(null);
  }

  function startEdit(d: ExternalDataset) {
    setForm(datasetToForm(d));
    setEditingId(d.id);
    setShowCreateForm(false);
  }

  function cancelForm() {
    setShowCreateForm(false);
    setEditingId(null);
  }

  async function handleSubmit() {
    if (!form.name.trim()) return;
    if (form.pendingColumnDefs) {
      const dupRole = validateRoles(form.pendingColumnDefs);
      if (dupRole) {
        const roleLabels: Record<string, string> = {
          email: ds.schemaRoleEmail, submittedAt: ds.schemaRoleDate,
          status: ds.schemaRoleStatus, priority: ds.schemaRolePriority,
          dueDate: ds.schemaRoleDeadline, amount: ds.schemaRoleAmount,
        };
        setFormError(ds.schemaDuplicateRole.replace("{role}", roleLabels[dupRole] ?? dupRole));
        return;
      }
    }
    setFormError(null);
    setSaving(true);
    try {
      const payload = formToPayload(form);
      if (editingId) {
        const res = await fetch(`/api/admin/datasets/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) { await fetchDatasets(); setEditingId(null); }
      } else {
        const res = await fetch("/api/admin/datasets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created: ExternalDataset = await res.json();
          if (form.file) {
            const fd = new FormData();
            fd.append("file", form.file);
            const importRes = await fetch(`/api/admin/datasets/${created.id}/import`, { method: "POST", body: fd });
            const importData = await importRes.json();
            if (importRes.ok) {
              const msg = ds.importResult
                .replace("{inserted}", String(importData.inserted))
                .replace("{skipped}", String(importData.skipped ?? 0));
              setImportResults(prev => ({ ...prev, [created.id]: { msg, isError: false } }));
            } else {
              setImportResults(prev => ({ ...prev, [created.id]: { msg: importData.error ?? ds.networkError, isError: true } }));
            }
          }
          await fetchDatasets();
          setShowCreateForm(false);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(id: string) {
    setConfirmDialog({
      open: true,
      title: ds.deleteTitle,
      description: ds.deleteConfirm,
      onConfirm: async () => {
        await fetch(`/api/admin/datasets/${id}`, { method: "DELETE" });
        await fetchDatasets();
      },
    });
  }

  async function handleFileImport(dataset: ExternalDataset, file: File) {
    setImportingId(dataset.id);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/datasets/${dataset.id}/import`, { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        const msg = ds.importResult
          .replace("{inserted}", String(data.inserted))
          .replace("{skipped}", String(data.skipped ?? 0));
        setImportResults(prev => ({ ...prev, [dataset.id]: { msg, isError: false } }));
        await fetchDatasets();
        refreshPreview(dataset.id);
      } else {
        const msg = ds.importError.replace("{error}", data.error ?? ds.networkError);
        setImportResults(prev => ({ ...prev, [dataset.id]: { msg, isError: true } }));
      }
    } finally {
      setImportingId(null);
    }
  }

  async function handleApiTrigger(dataset: ExternalDataset) {
    setImportingId(dataset.id);
    try {
      const res = await fetch(`/api/admin/datasets/${dataset.id}/import`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const msg = ds.importResult
          .replace("{inserted}", String(data.inserted))
          .replace("{skipped}", String(data.skipped ?? 0));
        setImportResults(prev => ({ ...prev, [dataset.id]: { msg, isError: false } }));
        await fetchDatasets();
        refreshPreview(dataset.id);
      } else {
        const msg = ds.importError.replace("{error}", data.error ?? ds.networkError);
        setImportResults(prev => ({ ...prev, [dataset.id]: { msg, isError: true } }));
      }
    } finally {
      setImportingId(null);
    }
  }

  const isFormOpen = showCreateForm || editingId !== null;
  const hasFileAndSchema = !editingId && form.file !== null && form.pendingColumnDefs !== null;

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={ds.confirmDelete}
        cancelLabel={ds.confirmCancel}
        destructive
        onConfirm={confirmDialog.onConfirm}
        onOpenChange={open => setConfirmDialog(s => ({ ...s, open }))}
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{ds.title}</h2>
          <p className="text-xs text-muted-foreground mt-1">{ds.description}</p>
        </div>
        <Button type="button" size="sm" onClick={startCreate} className="gap-1.5 shrink-0">
          <Plus className="w-4 h-4" />
          {ds.newSource}
        </Button>
      </div>

      {/* Create / Edit form */}
      {isFormOpen && (
        <div className="rounded-xl border border-ring/40 ring-1 ring-ring/20 bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{editingId ? ds.edit : ds.newSource}</h3>
            <button type="button" onClick={cancelForm} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-muted-foreground mb-1.5">{ds.name} *</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Clients CRM" className="text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-muted-foreground mb-1.5">{ds.descriptionField}</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={ds.descriptionOptional} className="text-sm" />
            </div>
          </div>

          {/* Source type */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">{ds.sourceType}</label>
            <div className="flex gap-2">
              {(["file", "api"] as const).map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, sourceType: t }))}
                  className={cn("px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                    form.sourceType === t
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-background border-border text-muted-foreground hover:border-blue-400 hover:text-foreground"
                  )}>
                  {t === "file" ? ds.typeFile : ds.typeApi}
                </button>
              ))}
            </div>
          </div>

          {/* File picker — only for file type, only on creation */}
          {form.sourceType === "file" && !editingId && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">{ds.schemaFileLabel}</label>
              {form.file ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/30 text-xs">
                  <Upload className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate font-mono text-foreground">{form.file.name}</span>
                  <span className="text-muted-foreground shrink-0">{(form.file.size / 1024).toFixed(0)} Ko</span>
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, file: null, pendingColumnDefs: null }))}
                    className="text-muted-foreground hover:text-destructive shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-border hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  <Upload className="w-4 h-4" />
                  {ds.schemaFilePicker}
                  <input type="file" accept=".csv,.json" className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0] ?? null;
                      if (!file) return;
                      const name = file.name.replace(/\.[^.]+$/, "");
                      if (file.name.toLowerCase().endsWith(".csv")) {
                        const { columns, rows } = await parseCSVPreview(file);
                        const defs = buildAutoColumnDefs(columns, rows);
                        setForm(f => ({ ...f, file, name: f.name || name, pendingColumnDefs: defs }));
                      } else {
                        setForm(f => ({ ...f, file, name: f.name || name, pendingColumnDefs: null }));
                      }
                      e.target.value = "";
                    }} />
                </label>
              )}
            </div>
          )}

          {/* Inline schema editor — auto-shown after CSV selection */}
          {form.sourceType === "file" && !editingId && form.pendingColumnDefs !== null && (
            <SchemaInline
              defs={form.pendingColumnDefs}
              onChange={defs => setForm(f => ({ ...f, pendingColumnDefs: defs }))}
            />
          )}

          {/* API fields */}
          {form.sourceType === "api" && (
            <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border/60">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">{ds.apiUrl}</label>
                <Input value={form.apiUrl} onChange={e => setForm(f => ({ ...f, apiUrl: e.target.value }))} placeholder="https://api.example.com/data" className="text-sm font-mono" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-muted-foreground">{ds.httpHeaders}</label>
                  <button type="button" onClick={() => setForm(f => ({ ...f, apiHeaders: [...f.apiHeaders, { key: "", value: "" }] }))}
                    className="text-xs text-blue-600 hover:text-blue-700 transition-colors">{ds.addHeader}</button>
                </div>
                {form.apiHeaders.map((h, i) => (
                  <div key={i} className="flex gap-2 mb-1.5">
                    <Input value={h.key} onChange={e => setForm(f => ({ ...f, apiHeaders: f.apiHeaders.map((x, j) => j === i ? { ...x, key: e.target.value } : x) }))} placeholder="Authorization" className="text-xs font-mono flex-1" />
                    <Input value={h.value} onChange={e => setForm(f => ({ ...f, apiHeaders: f.apiHeaders.map((x, j) => j === i ? { ...x, value: e.target.value } : x) }))} placeholder="Bearer token…" className="text-xs font-mono flex-1" />
                    <button type="button" onClick={() => setForm(f => ({ ...f, apiHeaders: f.apiHeaders.filter((_, j) => j !== i) }))}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Import mode */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">{ds.importMode}</label>
            <select value={form.importMode}
              onChange={e => setForm(f => ({ ...f, importMode: e.target.value as DatasetFormState["importMode"] }))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50">
              <option value="append">{ds.modeAppend}</option>
              <option value="replace">{ds.modeReplace}</option>
              <option value="dedup">{ds.modeDedup}</option>
            </select>
            {form.importMode === "dedup" && (
              <div className="mt-2">
                <label className="block text-xs text-muted-foreground mb-1.5">{ds.uniqueKey}</label>
                <Input value={form.dedupKey} onChange={e => setForm(f => ({ ...f, dedupKey: e.target.value }))} placeholder="email" className="text-sm font-mono w-48" />
              </div>
            )}
          </div>

          {/* Field map (collapsible, legacy) */}
          <div>
            <button type="button" onClick={() => setForm(f => ({ ...f, showFieldMap: !f.showFieldMap }))}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {form.showFieldMap ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {ds.fieldMapping}
            </button>
            {form.showFieldMap && (
              <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border/60 space-y-2">
                <p className="text-xs text-muted-foreground">{ds.fieldMapping}</p>
                {form.fieldMapRows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={r.from} onChange={e => setForm(f => ({ ...f, fieldMapRows: f.fieldMapRows.map((x, j) => j === i ? { ...x, from: e.target.value } : x) }))} placeholder="colonne source" className="text-xs font-mono flex-1" />
                    <span className="text-xs text-muted-foreground shrink-0">→</span>
                    <Input value={r.to} onChange={e => setForm(f => ({ ...f, fieldMapRows: f.fieldMapRows.map((x, j) => j === i ? { ...x, to: e.target.value } : x) }))} placeholder="champ interne" className="text-xs font-mono flex-1" />
                    <button type="button" onClick={() => setForm(f => ({ ...f, fieldMapRows: f.fieldMapRows.filter((_, j) => j !== i) }))}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setForm(f => ({ ...f, fieldMapRows: [...f.fieldMapRows, { from: "", to: "" }] }))}
                  className="text-xs text-blue-600 hover:text-blue-700 transition-colors">{ds.addMapping}</button>
              </div>
            )}
          </div>

          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">{formError}</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button type="button" onClick={handleSubmit} disabled={saving || !form.name.trim()} size="sm">
              {saving ? "…" : hasFileAndSchema ? ds.schemaValidateImport : editingId ? ds.save : ds.create}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={cancelForm}>{ds.cancel}</Button>
          </div>
        </div>
      )}

      {/* Dataset list */}
      {loading ? (
        <p className="text-xs text-muted-foreground py-4">{ds.loading}</p>
      ) : datasets.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed rounded-xl text-sm text-muted-foreground">
          {ds.empty}
        </div>
      ) : (
        <div className="space-y-2">
          {datasets.map(d => {
            const isEditing = editingId === d.id;
            const importResult = importResults[d.id];
            const isImporting = importingId === d.id;
            const isPreviewOpen = previewOpen[d.id] ?? false;
            const preview = previewData[d.id];
            const isPreviewLoading = previewLoading[d.id] ?? false;
            const isSchemaOpen = schemaOpen[d.id] ?? false;
            const schemaDefs = schemaColumnDefs[d.id] ?? [];
            const hasSchema = !!(d.columnDefs && d.columnDefs.length > 0);
            const lastDate = d.lastImportedAt
              ? new Date(d.lastImportedAt).toLocaleDateString(locale, { day: "numeric", month: "short" })
              : null;

            return (
              <div key={d.id} className={cn("rounded-xl border transition-all", isEditing ? "border-ring/40 ring-1 ring-ring/20" : "border-border")}>
                {/* Main row */}
                <div className="flex items-start gap-3 p-3">
                  <span className="text-lg shrink-0 mt-0.5">{d.sourceType === "api" ? "🌐" : "🗂️"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{d.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono uppercase">{d.sourceType}</span>
                      <span className="text-xs text-muted-foreground">{ds.recordCount.replace("{n}", String(d.recordCount ?? 0))}</span>
                      {hasSchema ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{ds.schemaBadgeConfigured}</span>
                      ) : (d.recordCount ?? 0) > 0 ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{ds.schemaBadgeAuto}</span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ds.modeLabel.replace("{mode}", d.importMode)}{lastDate && ` · ${ds.importedOn.replace("{date}", lastDate)}`}
                    </p>
                    {d.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{d.description}</p>}
                    {importResult && (
                      <p className={cn("text-xs mt-1", importResult.isError ? "text-destructive" : "text-green-600 dark:text-green-400")}>
                        {importResult.msg}
                      </p>
                    )}
                    {/* Action links */}
                    <div className="flex items-center gap-3 mt-1.5">
                      {(d.recordCount ?? 0) > 0 && (
                        <button type="button" onClick={() => togglePreview(d.id)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors">
                          <Table2 className="w-3 h-3" />
                          {isPreviewOpen ? ds.hidePreview : ds.showPreview}
                          {isPreviewOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                      {(d.recordCount ?? 0) > 0 && (
                        <button type="button" onClick={() => isSchemaOpen ? closeSchemaEditor(d.id) : openSchemaEditor(d)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <Settings className="w-3 h-3" />
                          {isSchemaOpen ? ds.schemaHide : hasSchema ? ds.schemaEdit : ds.schemaOpen}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {d.sourceType === "file" ? (
                      <>
                        <input type="file" accept=".csv,.json" className="hidden"
                          ref={el => { fileRefs.current[d.id] = el; }}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleFileImport(d, file);
                            e.target.value = "";
                          }} />
                        <button type="button" disabled={isImporting} onClick={() => fileRefs.current[d.id]?.click()}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                          title={ds.import}>
                          {isImporting ? "…" : <><Upload className="w-3 h-3" /> {ds.import}</>}
                        </button>
                      </>
                    ) : (
                      <button type="button" disabled={isImporting} onClick={() => handleApiTrigger(d)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                        title={ds.trigger}>
                        {isImporting ? "…" : <><Play className="w-3 h-3" /> {ds.trigger}</>}
                      </button>
                    )}
                    <button type="button" onClick={() => startEdit(d)}
                      className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title={ds.edit}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => handleDelete(d.id)}
                      className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title={ds.delete}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Schema editor panel (for existing datasets) */}
                {isSchemaOpen && schemaDefs.length > 0 && (
                  <SchemaEditor
                    datasetId={d.id}
                    columnDefs={schemaDefs}
                    onSaved={fetchDatasets}
                    onClose={() => closeSchemaEditor(d.id)}
                  />
                )}

                {/* Preview panel */}
                {isPreviewOpen && (
                  <div className="border-t border-border/60 px-3 pb-3 pt-2.5">
                    {isPreviewLoading ? (
                      <p className="text-xs text-muted-foreground py-2">{ds.loadingPreview}</p>
                    ) : !preview || preview.columns.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 italic">{ds.noRecords}</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-border/40">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-muted/40">
                              {preview.columns.map(col => (
                                <th key={col} className="px-2.5 py-1.5 text-left font-medium text-foreground whitespace-nowrap border-b border-border/40">
                                  <span className="font-mono">{col}</span>
                                  <TypeBadge type={preview.types[col] ?? "string"} />
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {preview.rows.map((row, i) => (
                              <tr key={i} className={cn("border-b border-border/30 last:border-0", i % 2 === 0 ? "" : "bg-muted/10")}>
                                {preview.columns.map(col => (
                                  <td key={col} className="px-2.5 py-1.5 text-muted-foreground font-mono max-w-[180px] truncate">
                                    {truncate(String(row[col] ?? ""), 35)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground bg-muted/20 border-t border-border/40 rounded-b-lg">
                          {ds.previewTitle.replace("{total}", String(d.recordCount ?? 0))}
                        </p>
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
