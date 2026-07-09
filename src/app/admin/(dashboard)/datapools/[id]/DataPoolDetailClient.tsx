"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Save, Download, Trash2, Database, Columns3, Check, Ban } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useTranslations } from "@/lib/context/LocaleContext";
import type { DataPoolWithMeta, DataPoolEntry } from "@/lib/datapools/types";
import type { FormOption } from "../DataPoolsListClient";

interface Props {
  pool: DataPoolWithMeta;
  forms: FormOption[];
  /** Predefined exclusion reasons from admin config, used as dropdown values
   *  in the per-row exclusion dialog. Empty = free text only. */
  exclusionReasons: string[];
}

type Tab = "settings" | "preview" | "exclusions";

export function DataPoolDetailClient({ pool: initialPool, forms, exclusionReasons }: Props) {
  const router = useRouter();
  const t = useTranslations().admin.datapool;
  const [pool, setPool] = useState(initialPool);
  const [tab, setTab] = useState<Tab>("settings");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <Link href="/admin/datapools" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> {t.detailBackLink}
        </Link>
      </div>

      <div className="mb-6 flex items-start gap-3">
        <Database className="w-6 h-6 text-primary mt-1" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">{pool.name}</h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">/{pool.slug}</p>
          {pool.description && <p className="text-sm text-muted-foreground mt-1">{pool.description}</p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {(["settings", "preview", "exclusions"] as Tab[]).map((tabName) => (
          <button
            key={tabName}
            type="button"
            onClick={() => setTab(tabName)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === tabName ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tabName === "settings"  ? t.tabSettings :
             tabName === "preview"   ? t.tabPreview  :
                                       t.tabExclusionsCount.replace("{count}", String(pool.exclusions.length))}
          </button>
        ))}
      </div>

      {tab === "settings" && (
        <SettingsTab pool={pool} forms={forms} onUpdated={setPool} onDeleted={() => router.push("/admin/datapools")} />
      )}
      {tab === "preview" && <PreviewTab pool={pool} forms={forms} exclusionReasons={exclusionReasons} onPoolUpdated={setPool} />}
      {tab === "exclusions" && <ExclusionsTab pool={pool} onUpdated={setPool} />}
    </div>
  );
}

// ─── Settings tab ──────────────────────────────────────────────────────────

function SettingsTab({
  pool, forms, onUpdated, onDeleted,
}: {
  pool: DataPoolWithMeta;
  forms: FormOption[];
  onUpdated: (p: DataPoolWithMeta) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations().admin.datapool;
  const [name, setName] = useState(pool.name);
  const [slug, setSlug] = useState(pool.slug);
  const [description, setDescription] = useState(pool.description ?? "");
  const [keyField, setKeyField] = useState(pool.keyField);
  const [additionalFields, setAdditionalFields] = useState<string[]>(pool.additionalFields);
  const [selectedFormIds, setSelectedFormIds] = useState<string[]>(pool.sources.map((s) => s.formInstanceId));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const candidateFields = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; label: string; type: string }[] = [];
    for (const f of forms.filter((fo) => selectedFormIds.includes(fo.id))) {
      for (const field of f.fields) {
        if (!seen.has(field.id)) {
          seen.add(field.id);
          out.push(field);
        }
      }
    }
    return out;
  }, [forms, selectedFormIds]);

  function toggleForm(id: string) {
    setSelectedFormIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }
  function toggleAdditional(id: string) {
    setAdditionalFields((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/admin/datapools/${pool.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        keyField,
        additionalFields: additionalFields.filter((f) => f !== keyField),
        sources: selectedFormIds.map((id) => ({ formInstanceId: id })),
      }),
    });
    setSaving(false);
    if (res.ok) {
      const updated = (await res.json()) as DataPoolWithMeta;
      onUpdated(updated);
      toast.success(t.settingsSavedToast);
    } else {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(error ?? t.settingsSaveFailedToast);
    }
  }

  async function performDelete() {
    setDeleting(true);
    const res = await fetch(`/api/admin/datapools/${pool.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      toast.success(t.settingsDeletedToast);
      onDeleted();
    } else {
      toast.error(t.settingsDeleteFailedToast);
    }
  }

  const valid = name.trim() && slug.trim() && selectedFormIds.length > 0 && keyField;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">{t.createNameLabel}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">{t.createSlugLabel}</label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="font-mono" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">{t.settingsDescriptionLabel}</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">
          {t.createSourcesLabel.replace("{count}", String(selectedFormIds.length)).replace("{plural}", selectedFormIds.length > 1 ? "s" : "")}
        </label>
        <div className="border border-border rounded-md max-h-48 overflow-y-auto">
          {forms.map((f) => (
            <label key={f.id} className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 cursor-pointer text-sm border-b border-border/40 last:border-0">
              <input type="checkbox" checked={selectedFormIds.includes(f.id)} onChange={() => toggleForm(f.id)} className="w-4 h-4 rounded border-border accent-primary" />
              <span className="flex-1">{f.name}</span>
              <span className="text-xs text-muted-foreground font-mono">/{f.slug === "/" ? "" : f.slug}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">{t.settingsKeyFieldLabel}</label>
        <select
          value={keyField}
          onChange={(e) => setKeyField(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
        >
          {candidateFields.map((f) => (
            <option key={f.id} value={f.id}>{f.label} ({f.id})</option>
          ))}
        </select>
      </div>

      {candidateFields.filter((f) => f.id !== keyField).length > 0 && (
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">{t.settingsAdditionalFieldsLabel}</label>
          <div className="border border-border rounded-md max-h-40 overflow-y-auto">
            {candidateFields.filter((f) => f.id !== keyField).map((f) => (
              <label key={f.id} className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 cursor-pointer text-sm border-b border-border/40 last:border-0">
                <input type="checkbox" checked={additionalFields.includes(f.id)} onChange={() => toggleAdditional(f.id)} className="w-4 h-4 rounded border-border accent-primary" />
                <span className="flex-1">{f.label}</span>
                <span className="text-xs text-muted-foreground font-mono">{f.id}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between pt-4 border-t border-border">
        <Button variant="outline" onClick={() => setConfirmDelete(true)} disabled={deleting} className="text-destructive hover:text-destructive">
          <Trash2 className="w-4 h-4 mr-1" /> {deleting ? t.settingsDeletingButton : t.settingsDeleteButton}
        </Button>
        <Button onClick={save} disabled={!valid || saving}>
          <Save className="w-4 h-4 mr-1" /> {saving ? t.settingsSavingButton : t.settingsSaveButton}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t.listDeleteConfirmTitle}
        description={t.listDeleteConfirmDesc.replace("{name}", pool.name)}
        confirmLabel={t.settingsDeleteButton}
        cancelLabel={t.createCancelButton}
        destructive
        onOpenChange={setConfirmDelete}
        onConfirm={() => { void performDelete(); }}
      />
    </div>
  );
}

// ─── Preview tab ───────────────────────────────────────────────────────────

/**
 * Meta-columns are computed by the API for every entry. They're shown / hidden
 * via the column picker (persisted to localStorage per pool).
 */
type MetaColumn = "lastSubmittedAt" | "firstSubmittedAt" | "submissionCount" | "sourceFormName";

const META_COLUMNS: readonly MetaColumn[] = ["lastSubmittedAt", "firstSubmittedAt", "submissionCount", "sourceFormName"];
const DEFAULT_META_COLUMNS: MetaColumn[] = ["lastSubmittedAt"];

function PreviewTab({
  pool, forms, exclusionReasons, onPoolUpdated,
}: {
  pool: DataPoolWithMeta;
  forms: FormOption[];
  exclusionReasons: string[];
  /** Called after the operator excludes a submission so the parent's */
  /* `pool.exclusions` is refreshed — keeps the Exclusions tab counter in */
  /* sync without forcing a page reload. */
  onPoolUpdated: (next: DataPoolWithMeta) => void;
}) {
  const t = useTranslations().admin.datapool;

  // Meta-column labels are resolved from the current locale rather than a
  // module-level constant so they translate with the rest of the UI.
  const metaLabel: Record<MetaColumn, string> = {
    lastSubmittedAt:  t.metaLastSubmittedAt,
    firstSubmittedAt: t.metaFirstSubmittedAt,
    submissionCount:  t.metaSubmissionCount,
    sourceFormName:   t.metaSourceFormName,
  };

  const [entries, setEntries] = useState<DataPoolEntry[]>([]);
  const [total, setTotal] = useState(0);
  // Pending exclusion — set when the operator clicks the Ban button on a row.
  // Holds the entry being excluded plus an editable reason. Drives a Dialog
  // so the operator can add an optional note before confirming.
  const [pendingExclude, setPendingExclude] = useState<DataPoolEntry | null>(null);
  const [excludeReason, setExcludeReason] = useState("");
  const [excluding, setExcluding] = useState(false);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 50;

  // Form id → name map for the "Last source form" meta-column.
  const formNameById = useMemo(() => Object.fromEntries(forms.map((f) => [f.id, f.name])), [forms]);

  // Column visibility state — persisted per pool in localStorage so different
  // admins can keep their own preferred view without bloating the DB schema.
  const lsKey = `datapool-preview-cols-${pool.id}`;
  const [visibleAdditional, setVisibleAdditional] = useState<string[]>(pool.additionalFields);
  const [visibleMeta, setVisibleMeta] = useState<MetaColumn[]>(DEFAULT_META_COLUMNS);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Hydrate from localStorage once on mount. We accept either a fresh shape
  // (object with `additional` + `meta` arrays) or older entries (silently
  // ignored — they'll be overwritten on the next save).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { additional?: string[]; meta?: MetaColumn[] };
      if (Array.isArray(parsed.additional)) {
        // Only keep stored columns that still exist on the pool — protects
        // against stale localStorage after an additionalFields edit.
        setVisibleAdditional(parsed.additional.filter((f) => pool.additionalFields.includes(f)));
      }
      if (Array.isArray(parsed.meta)) setVisibleMeta(parsed.meta);
    } catch {
      // ignore — localStorage corruption isn't worth crashing on
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.id]);

  // Persist on each change.
  useEffect(() => {
    try {
      localStorage.setItem(lsKey, JSON.stringify({ additional: visibleAdditional, meta: visibleMeta }));
    } catch {
      // ignore quota / private-mode failures
    }
  }, [lsKey, visibleAdditional, visibleMeta]);

  // Close the picker on outside click.
  useEffect(() => {
    if (!pickerOpen) return;
    function onClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [pickerOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/datapools/${pool.id}/preview?${params.toString()}`);
    setLoading(false);
    if (res.ok) {
      const data = (await res.json()) as { entries: DataPoolEntry[]; total: number };
      setEntries(data.entries);
      setTotal(data.total);
    }
  }, [pool.id, search, offset]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  function downloadCsv() {
    window.location.href = `/api/admin/datapools/${pool.id}/export.csv`;
  }

  function toggleAdditional(field: string) {
    setVisibleAdditional((cur) => (cur.includes(field) ? cur.filter((f) => f !== field) : [...cur, field]));
  }
  function toggleMeta(col: MetaColumn) {
    setVisibleMeta((cur) => (cur.includes(col) ? cur.filter((c) => c !== col) : [...cur, col]));
  }

  // +1 for the actions column at the end (Exclude button).
  const colSpan = 2 + visibleAdditional.length + visibleMeta.length;

  /**
   * Confirms the pending exclusion by POST-ing to the exclusions endpoint,
   * then reloads the preview so the entry disappears (or is replaced by an
   * older submission with the same key when several exist for the same
   * email — that's documented in the dialog body).
   */
  async function confirmExclude() {
    if (!pendingExclude) return;
    setExcluding(true);
    // The dropdown uses " " as a sentinel for "Other (typing)" — trim it
    // away here so the API never receives a meaningless whitespace value.
    const reason = excludeReason.trim();
    const res = await fetch(`/api/admin/datapools/${pool.id}/exclusions`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        submissionId: pendingExclude.sourceSubmissionId,
        reason:       reason || null,
      }),
    });
    setExcluding(false);
    if (!res.ok) {
      toast.error(t.excludeFailedToast);
      return;
    }
    toast.success(t.excludeSuccessToast.replace("{key}", pendingExclude.key));
    setPendingExclude(null);
    setExcludeReason("");
    // Reload the preview (the entry may disappear or be replaced by an older
    // submission with the same key) AND refetch the pool so the Exclusions
    // tab's list/counter reflect the new entry without needing a refresh.
    void load();
    try {
      const res = await fetch(`/api/admin/datapools/${pool.id}`);
      if (res.ok) {
        const fresh = (await res.json()) as DataPoolWithMeta;
        onPoolUpdated(fresh);
      }
    } catch {
      // Soft-failure: the count will catch up on next page visit. Not worth
      // a toast — the main action (the exclusion itself) succeeded.
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Input
          placeholder={t.previewSearchPlaceholder}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
          className="flex-1"
        />
        <div className="relative" ref={pickerRef}>
          <Button variant="outline" onClick={() => setPickerOpen((v) => !v)}>
            <Columns3 className="w-4 h-4 mr-1" /> {t.previewColumnsButton}
          </Button>
          {pickerOpen && (
            <div className="absolute right-0 top-full mt-1 z-10 w-72 rounded-md border border-border bg-card shadow-lg p-2">
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{t.previewColumnsKeyField}</div>
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                <Check className="w-3.5 h-3.5 text-primary" />
                <span className="font-mono">{pool.keyField}</span>
                <span className="ml-auto text-xs">{t.previewColumnsAlwaysVisible}</span>
              </div>
              {pool.additionalFields.length > 0 && (
                <>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-t border-border/50 mt-1 pt-2">{t.previewColumnsAdditional}</div>
                  {pool.additionalFields.map((f) => (
                    <label key={f} className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent/30 cursor-pointer rounded text-sm">
                      <input type="checkbox" checked={visibleAdditional.includes(f)} onChange={() => toggleAdditional(f)} className="w-4 h-4 rounded border-border accent-primary" />
                      <span className="flex-1 font-mono text-xs">{f}</span>
                    </label>
                  ))}
                </>
              )}
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-t border-border/50 mt-1 pt-2">{t.previewColumnsMeta}</div>
              {META_COLUMNS.map((c) => (
                <label key={c} className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent/30 cursor-pointer rounded text-sm">
                  <input type="checkbox" checked={visibleMeta.includes(c)} onChange={() => toggleMeta(c)} className="w-4 h-4 rounded border-border accent-primary" />
                  <span className="flex-1">{metaLabel[c]}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <Button variant="outline" onClick={downloadCsv}>
          <Download className="w-4 h-4 mr-1" /> CSV
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">
        {loading
          ? t.previewLoading
          : (() => {
              const unit = total > 1 ? t.previewCountUnitPlural : t.previewCountUnit;
              const range = entries.length > 0 ? `${offset + 1}–${offset + entries.length}` : "0";
              const showing = t.previewShowing.replace("{range}", range);
              return `${total} ${unit} · ${showing}`;
            })()
        }
      </div>

      <div className="border border-border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 font-medium">{pool.keyField}</th>
              {pool.additionalFields.filter((f) => visibleAdditional.includes(f)).map((f) => (
                <th key={f} className="text-left px-3 py-2 font-medium">{f}</th>
              ))}
              {visibleMeta.map((c) => (
                <th key={c} className="text-left px-3 py-2 font-medium">{metaLabel[c]}</th>
              ))}
              <th className="px-3 py-2 w-10" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={colSpan} className="text-center py-6 text-muted-foreground">{t.previewEmpty}</td></tr>
            ) : (
              entries.map((e) => (
                <tr key={e.sourceSubmissionId} className="border-b border-border/40 last:border-0 hover:bg-accent/20">
                  <td className="px-3 py-2 font-mono">{e.key}</td>
                  {pool.additionalFields.filter((f) => visibleAdditional.includes(f)).map((f) => (
                    <td key={f} className="px-3 py-2">{e.additional[f] ?? ""}</td>
                  ))}
                  {visibleMeta.map((c) => (
                    <td key={c} className="px-3 py-2 text-muted-foreground">
                      {c === "lastSubmittedAt"  && new Date(e.lastSubmittedAt).toLocaleDateString()}
                      {c === "firstSubmittedAt" && new Date(e.firstSubmittedAt).toLocaleDateString()}
                      {c === "submissionCount"  && e.submissionCount}
                      {c === "sourceFormName"   && (formNameById[e.sourceFormInstanceId] ?? "—")}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      title={t.previewExcludeTooltip}
                      onClick={() => { setPendingExclude(e); setExcludeReason(""); }}
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > limit && (
        <div className="flex justify-between text-sm">
          <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
            {t.previewPrev}
          </Button>
          <Button variant="outline" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
            {t.previewNext}
          </Button>
        </div>
      )}

      {/* Exclusion dialog — replaces the old "go find the UUID and paste it */}
      {/* manually" flow in the Exclusions tab. Includes an optional reason */}
      {/* field for the audit log + a hint that the entry may not visually */}
      {/* disappear if the same email has multiple submissions. */}
      <Dialog open={pendingExclude !== null} onOpenChange={(open) => { if (!open) setPendingExclude(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.excludeDialogTitle}</DialogTitle>
            <DialogDescription>
              {pendingExclude && (() => {
                // Split the description around the `{key}` placeholder so we
                // can wrap the key in <span className="font-mono"> without
                // emitting raw HTML. Three pieces: [before] <key> [after].
                const parts = t.excludeDialogDescription.split("{key}");
                return (
                  <>
                    {parts[0]}
                    <span className="font-mono">{pendingExclude.key}</span>
                    {parts[1] ?? ""}
                  </>
                );
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">{t.excludeDialogReasonLabel}</label>
            {exclusionReasons.length > 0 ? (
              <>
                {/* Predefined-reason dropdown + free-text fallback. The */}
                {/* sentinel "__custom__" switches to a typed field — the value */}
                {/* still propagates into `excludeReason` so the API payload */}
                {/* is unchanged regardless of how the operator picked it. */}
                <select
                  value={
                    excludeReason === ""                          ? "" :
                    exclusionReasons.includes(excludeReason)      ? excludeReason :
                                                                    "__custom__"
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "")              setExcludeReason("");
                    else if (v === "__custom__") setExcludeReason(" ");
                    else                       setExcludeReason(v);
                  }}
                  autoFocus
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
                >
                  <option value="">{t.excludeDialogReasonNone}</option>
                  {exclusionReasons.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                  <option value="__custom__">{t.excludeDialogReasonCustom}</option>
                </select>
                {excludeReason !== "" && !exclusionReasons.includes(excludeReason) && (
                  <Input
                    value={excludeReason.trim()}
                    onChange={(e) => setExcludeReason(e.target.value || " ")}
                    placeholder={t.excludeDialogReasonCustomPlaceholder}
                    onKeyDown={(e) => { if (e.key === "Enter" && !excluding) void confirmExclude(); }}
                  />
                )}
              </>
            ) : (
              <Input
                value={excludeReason}
                onChange={(e) => setExcludeReason(e.target.value)}
                placeholder={t.excludeDialogReasonFreePlaceholder}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && !excluding) void confirmExclude(); }}
              />
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setPendingExclude(null)}>
              {t.excludeDialogCancel}
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => { void confirmExclude(); }} disabled={excluding}>
              {excluding ? t.excludeDialogConfirming : t.excludeDialogConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Exclusions tab ────────────────────────────────────────────────────────

function ExclusionsTab({ pool, onUpdated }: { pool: DataPoolWithMeta; onUpdated: (p: DataPoolWithMeta) => void }) {
  const t = useTranslations().admin.datapool;
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/admin/datapools/${pool.id}`);
    if (res.ok) {
      const updated = (await res.json()) as DataPoolWithMeta;
      onUpdated(updated);
    }
  }

  async function removeExclusion(subId: string) {
    const res = await fetch(`/api/admin/datapools/${pool.id}/exclusions/${subId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t.exclusionRemovedToast);
      await refresh();
    } else {
      toast.error(t.exclusionRemoveFailedToast);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t.exclusionsIntro}</p>

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 font-medium">{t.exclusionsTableId}</th>
              <th className="text-left px-3 py-2 font-medium">{t.exclusionsTableReason}</th>
              <th className="text-left px-3 py-2 font-medium">{t.exclusionsTableDate}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pool.exclusions.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">{t.exclusionsEmpty}</td></tr>
            ) : (
              pool.exclusions.map((e) => (
                <tr key={e.id} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{e.submissionId}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.reason ?? <span className="italic">—</span>}</td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(e.excludedAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => setPendingRemove(e.submissionId)} className="text-destructive hover:underline text-xs">
                      {t.exclusionsTableRemove}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(o) => !o && setPendingRemove(null)}
        title={t.exclusionRemoveConfirmTitle}
        description={t.exclusionRemoveConfirmDesc}
        confirmLabel={t.exclusionRemoveConfirm}
        cancelLabel={t.exclusionRemoveCancel}
        destructive
        onConfirm={async () => {
          if (pendingRemove) await removeExclusion(pendingRemove);
          setPendingRemove(null);
        }}
      />
    </div>
  );
}
