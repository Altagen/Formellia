"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Save, Download, Trash2, Database } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { DataPoolWithMeta, DataPoolEntry } from "@/lib/datapools/types";
import type { FormOption } from "../DataPoolsListClient";

interface Props {
  pool: DataPoolWithMeta;
  forms: FormOption[];
}

type Tab = "settings" | "preview" | "exclusions";

export function DataPoolDetailClient({ pool: initialPool, forms }: Props) {
  const router = useRouter();
  const [pool, setPool] = useState(initialPool);
  const [tab, setTab] = useState<Tab>("settings");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <Link href="/admin/datapools" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Toutes les DataPools
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
        {(["settings", "preview", "exclusions"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "settings" ? "Paramètres" : t === "preview" ? "Aperçu des entrées" : `Exclusions (${pool.exclusions.length})`}
          </button>
        ))}
      </div>

      {tab === "settings" && (
        <SettingsTab pool={pool} forms={forms} onUpdated={setPool} onDeleted={() => router.push("/admin/datapools")} />
      )}
      {tab === "preview" && <PreviewTab pool={pool} />}
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
  const [name, setName] = useState(pool.name);
  const [slug, setSlug] = useState(pool.slug);
  const [description, setDescription] = useState(pool.description ?? "");
  const [keyField, setKeyField] = useState(pool.keyField);
  const [additionalFields, setAdditionalFields] = useState<string[]>(pool.additionalFields);
  const [selectedFormIds, setSelectedFormIds] = useState<string[]>(pool.sources.map((s) => s.formInstanceId));
  const [saving, setSaving] = useState(false);
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
      toast.success("DataPool enregistrée");
    } else {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(error ?? "Erreur lors de la sauvegarde");
    }
  }

  async function remove() {
    if (!confirm(`Supprimer la DataPool "${pool.name}" ?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/datapools/${pool.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      toast.success("DataPool supprimée");
      onDeleted();
    } else {
      toast.error("Erreur lors de la suppression");
    }
  }

  const valid = name.trim() && slug.trim() && selectedFormIds.length > 0 && keyField;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Nom</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Slug</label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="font-mono" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">Description (optionnel)</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">
          Formulaires sources ({selectedFormIds.length})
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
        <label className="block text-xs text-muted-foreground mb-1.5">Champ-clé</label>
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
          <label className="block text-xs text-muted-foreground mb-1.5">Champs additionnels</label>
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
        <Button variant="outline" onClick={remove} disabled={deleting} className="text-destructive hover:text-destructive">
          <Trash2 className="w-4 h-4 mr-1" /> {deleting ? "Suppression…" : "Supprimer la DataPool"}
        </Button>
        <Button onClick={save} disabled={!valid || saving}>
          <Save className="w-4 h-4 mr-1" /> {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}

// ─── Preview tab ───────────────────────────────────────────────────────────

function PreviewTab({ pool }: { pool: DataPoolWithMeta }) {
  const [entries, setEntries] = useState<DataPoolEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 50;

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

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Input
          placeholder="Rechercher dans le champ-clé ou les champs additionnels…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
          className="flex-1"
        />
        <Button variant="outline" onClick={downloadCsv}>
          <Download className="w-4 h-4 mr-1" /> Exporter CSV
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">
        {loading ? "Chargement…" : `${total} entrée${total > 1 ? "s" : ""} unique${total > 1 ? "s" : ""} · affichage ${entries.length > 0 ? `${offset + 1}–${offset + entries.length}` : "0"}`}
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 font-medium">{pool.keyField}</th>
              {pool.additionalFields.map((f) => (
                <th key={f} className="text-left px-3 py-2 font-medium">{f}</th>
              ))}
              <th className="text-left px-3 py-2 font-medium">Soumis le</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={2 + pool.additionalFields.length} className="text-center py-6 text-muted-foreground">Aucune entrée</td></tr>
            ) : (
              entries.map((e) => (
                <tr key={e.sourceSubmissionId} className="border-b border-border/40 last:border-0 hover:bg-accent/20">
                  <td className="px-3 py-2 font-mono">{e.key}</td>
                  {pool.additionalFields.map((f) => (
                    <td key={f} className="px-3 py-2">{e.additional[f] ?? ""}</td>
                  ))}
                  <td className="px-3 py-2 text-muted-foreground">{new Date(e.lastSubmittedAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > limit && (
        <div className="flex justify-between text-sm">
          <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
            ← Précédent
          </Button>
          <Button variant="outline" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
            Suivant →
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Exclusions tab ────────────────────────────────────────────────────────

function ExclusionsTab({ pool, onUpdated }: { pool: DataPoolWithMeta; onUpdated: (p: DataPoolWithMeta) => void }) {
  const [submissionId, setSubmissionId] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/admin/datapools/${pool.id}`);
    if (res.ok) {
      const updated = (await res.json()) as DataPoolWithMeta;
      onUpdated(updated);
    }
  }

  async function addExclusion() {
    if (!submissionId.trim()) return;
    setAdding(true);
    const res = await fetch(`/api/admin/datapools/${pool.id}/exclusions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: submissionId.trim(), reason: reason.trim() || null }),
    });
    setAdding(false);
    if (res.ok) {
      toast.success("Exclusion ajoutée");
      setSubmissionId("");
      setReason("");
      await refresh();
    } else {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(error ?? "Erreur");
    }
  }

  async function removeExclusion(subId: string) {
    const res = await fetch(`/api/admin/datapools/${pool.id}/exclusions/${subId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Exclusion retirée");
      await refresh();
    } else {
      toast.error("Erreur lors du retrait");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Les exclusions masquent une soumission précise de cette pool (et seulement de celle-ci). La donnée du
        formulaire reste intacte ; pour la supprimer totalement, supprimez la soumission depuis l&apos;onglet
        Soumissions du formulaire.
      </p>

      <div className="border border-border rounded-md p-4 bg-muted/20">
        <div className="text-sm font-medium mb-3">Ajouter une exclusion par ID de soumission</div>
        <div className="grid grid-cols-[2fr_1fr_auto] gap-2">
          <Input placeholder="UUID de la soumission" value={submissionId} onChange={(e) => setSubmissionId(e.target.value)} className="font-mono text-xs" />
          <Input placeholder="Raison (optionnel)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button onClick={addExclusion} disabled={adding || !submissionId.trim()}>{adding ? "…" : "Ajouter"}</Button>
        </div>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 font-medium">ID soumission</th>
              <th className="text-left px-3 py-2 font-medium">Raison</th>
              <th className="text-left px-3 py-2 font-medium">Le</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pool.exclusions.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">Aucune exclusion</td></tr>
            ) : (
              pool.exclusions.map((e) => (
                <tr key={e.id} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{e.submissionId}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.reason ?? <span className="italic">—</span>}</td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(e.excludedAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => removeExclusion(e.submissionId)} className="text-destructive hover:underline text-xs">
                      Retirer
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
