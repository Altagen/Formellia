"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Database, Trash2, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslations } from "@/lib/context/LocaleContext";
import type { DataPool } from "@/lib/db/schema";

export interface FormOption {
  id: string;
  slug: string;
  name: string;
  fields: { id: string; label: string; type: string }[];
}

interface Props {
  initialPools: DataPool[];
  forms: FormOption[];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function DataPoolsListClient({ initialPools, forms }: Props) {
  const router = useRouter();
  const t = useTranslations().admin.datapool;
  const [pools, setPools] = useState<DataPool[]>(initialPools);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DataPool | null>(null);

  async function handleDelete() {
    if (!pendingDelete) return;
    const res = await fetch(`/api/admin/datapools/${pendingDelete.id}`, { method: "DELETE" });
    if (res.ok) {
      setPools((p) => p.filter((x) => x.id !== pendingDelete.id));
      toast.success(t.listDeletedToast.replace("{name}", pendingDelete.name));
    } else {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(error ?? t.listDeleteFailedToast);
    }
    setPendingDelete(null);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Database className="w-5 h-5" /> {t.listTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t.listDescription}</p>
        </div>
        <Button onClick={() => setCreating(true)} className="shrink-0">
          <Plus className="w-4 h-4 mr-1" /> {t.listNewButton}
        </Button>
      </div>

      {pools.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-xl text-sm text-muted-foreground">
          {t.listEmpty} <strong>{t.listEmptyAction}</strong> {t.listEmptySuffix}
        </div>
      ) : (
        <div className="space-y-2">
          {pools.map((pool) => (
            <div key={pool.id} className="rounded-xl border border-border bg-card hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-3 px-4 py-3">
                <Database className="w-5 h-5 text-primary shrink-0" />
                <Link href={`/admin/datapools/${pool.id}`} className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{pool.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    /{pool.slug} · <code>{pool.keyField}</code>
                    {pool.additionalFields.length > 0 && (
                      <> · {pool.additionalFields.length} +</>
                    )}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => setPendingDelete(pool)}
                  className="w-8 h-8 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title={t.listDeleteTooltip}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <Link
                  href={`/admin/datapools/${pool.id}`}
                  className="w-8 h-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreatePoolModal
          forms={forms}
          onClose={() => setCreating(false)}
          onCreated={(p) => {
            setPools((prev) => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)));
            setCreating(false);
            router.push(`/admin/datapools/${p.id}`);
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={t.listDeleteConfirmTitle}
        description={t.listDeleteConfirmDesc.replace("{name}", pendingDelete?.name ?? "")}
        confirmLabel={t.settingsDeleteButton}
        cancelLabel={t.createCancelButton}
        destructive
        onConfirm={handleDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      />
    </div>
  );
}

// ─── Create modal ──────────────────────────────────────────────────────────

interface CreatePoolModalProps {
  forms: FormOption[];
  onClose: () => void;
  onCreated: (p: DataPool) => void;
}

function CreatePoolModal({ forms, onClose, onCreated }: CreatePoolModalProps) {
  const t = useTranslations().admin.datapool;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [selectedFormIds, setSelectedFormIds] = useState<string[]>([]);
  const [keyField, setKeyField] = useState("");
  const [additionalFields, setAdditionalFields] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Auto-detected union of field ids across the selected source forms.
  // We deduplicate by id so the operator sees one entry per logical field
  // even when the same id (e.g. "email") exists in multiple forms.
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

  async function submit() {
    if (!name.trim() || !slug.trim() || selectedFormIds.length === 0 || !keyField) return;
    setSubmitting(true);
    const res = await fetch("/api/admin/datapools", {
      method: "POST",
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
    setSubmitting(false);
    if (res.ok) {
      const pool = (await res.json()) as DataPool;
      toast.success(t.createdToast.replace("{name}", pool.name));
      onCreated(pool);
    } else {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(error ?? t.createFailedToast);
    }
  }

  const valid = name.trim() && slug.trim() && selectedFormIds.length > 0 && keyField;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl shadow-lg w-full max-w-2xl my-8">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">{t.createTitle}</h2>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">{t.createNameLabel}</label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
                placeholder={t.createNamePlaceholder}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">{t.createSlugLabel}</label>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlug(slugify(e.target.value));
                  setSlugTouched(true);
                }}
                placeholder={t.createSlugPlaceholder}
                className="font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">{t.createDescriptionLabel}</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t.createDescriptionPlaceholder} />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">
              {t.createSourcesLabel
                .replace("{count}", String(selectedFormIds.length))
                .replace("{plural}", selectedFormIds.length > 1 ? "s" : "")}
            </label>
            {forms.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">{t.createNoForms}</p>
            ) : (
              <div className="border border-border rounded-md max-h-40 overflow-y-auto">
                {forms.map((f) => (
                  <label key={f.id} className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 cursor-pointer text-sm border-b border-border/40 last:border-0">
                    <input
                      type="checkbox"
                      checked={selectedFormIds.includes(f.id)}
                      onChange={() => toggleForm(f.id)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                    <span className="flex-1">{f.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">/{f.slug === "/" ? "" : f.slug}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">{t.createKeyFieldLabel}</label>
            {candidateFields.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">{t.createNoFormsSelectedHint}</p>
            ) : (
              <select
                value={keyField}
                onChange={(e) => setKeyField(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
              >
                <option value="">—</option>
                {candidateFields.map((f) => (
                  <option key={f.id} value={f.id}>{f.label} ({f.id})</option>
                ))}
              </select>
            )}
          </div>

          {keyField && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">{t.createAdditionalFieldsLabel}</label>
              <div className="border border-border rounded-md max-h-40 overflow-y-auto">
                {candidateFields.filter((f) => f.id !== keyField).map((f) => (
                  <label key={f.id} className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 cursor-pointer text-sm border-b border-border/40 last:border-0">
                    <input
                      type="checkbox"
                      checked={additionalFields.includes(f.id)}
                      onChange={() => toggleAdditional(f.id)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                    <span className="flex-1">{f.label}</span>
                    <span className="text-xs text-muted-foreground font-mono">{f.id}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>{t.createCancelButton}</Button>
          <Button onClick={submit} disabled={!valid || submitting}>
            {submitting ? t.createSubmittingButton : t.createSubmitButton}
          </Button>
        </div>
      </div>
    </div>
  );
}
