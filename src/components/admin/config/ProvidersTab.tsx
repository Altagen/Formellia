"use client";

/**
 * Configuration → Providers tab (UI-11d).
 *
 * The only place email credentials live. Every form's notification blob and
 * every broadcast row references a row here by `providerId`; the resolver
 * falls back to the default preset when no explicit reference is set.
 *
 * The tab renders a full-width list of presets, an "add preset" CTA, and
 * per-row Edit / Set-default / Delete actions. Empty state pushes the
 * operator toward creating the first preset so the transactional email flow
 * has something to bind to.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Star, Trash2, KeyRound, Mail, X } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface ProviderRow {
  id:               string;
  name:             string;
  provider:         "resend" | "sendgrid" | "mailgun";
  fromAddress:      string;
  fromName:         string | null;
  apiKeyConfigured: boolean;
  apiKeyExpiresAt:  string | null;
  isDefault:        boolean;
  createdAt:        string;
  updatedAt:        string;
}

const PROVIDER_KINDS = [
  { value: "resend",   label: "Resend"   },
  { value: "sendgrid", label: "SendGrid" },
  { value: "mailgun",  label: "Mailgun"  },
] as const;

export function ProvidersTab() {
  const tr = useTranslations();
  const t  = tr.admin.config.providersTab;

  const [rows, setRows]     = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProviderRow | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProviderRow | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/email/providers");
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t.loadError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function makeDefault(row: ProviderRow) {
    try {
      const res = await fetch(`/api/admin/email/providers/${row.id}/set-default`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success(t.setDefaultOk.replace("{name}", row.name));
      void reload();
    } catch {
      toast.error(t.setDefaultError);
    }
  }

  async function handleDelete(row: ProviderRow) {
    try {
      const res = await fetch(`/api/admin/email/providers/${row.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(t.deletedToast.replace("{name}", row.name));
      setDeleteTarget(null);
      void reload();
    } catch {
      toast.error(t.deleteError);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="w-4 h-4 mr-1" />
          {t.addButton}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="w-4 h-4 animate-spin" /> {t.loading}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {t.emptyState}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 font-medium">{t.colName}</th>
                  <th className="text-left px-3 py-2 font-medium">{t.colProvider}</th>
                  <th className="text-left px-3 py-2 font-medium">{t.colFrom}</th>
                  <th className="text-left px-3 py-2 font-medium">{t.colKey}</th>
                  <th className="text-left px-3 py-2 font-medium">{t.colExpiry}</th>
                  <th className="text-right px-3 py-2 font-medium">{t.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-border/40 last:border-0 hover:bg-accent/20">
                    <td className="px-3 py-2 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        {row.name}
                        {row.isDefault && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                            {t.defaultBadge}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs uppercase font-mono">{row.provider}</td>
                    <td className="px-3 py-2 text-xs">
                      <div>{row.fromAddress}</div>
                      {row.fromName && <div className="text-muted-foreground">{row.fromName}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.apiKeyConfigured ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><KeyRound className="w-3 h-3" /> {t.keySet}</span>
                      ) : (
                        <span className="text-muted-foreground">{t.keyMissing}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {row.apiKeyExpiresAt ? new Date(row.apiKeyExpiresAt).toLocaleDateString() : t.noExpiry}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        {!row.isDefault && (
                          <button
                            type="button"
                            onClick={() => makeDefault(row)}
                            title={t.setDefault}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-amber-500 hover:bg-muted transition-colors"
                          >
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditing(row)}
                          title={t.edit}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(row)}
                          title={t.delete}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {rows.map(row => (
              <div key={row.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-foreground truncate">{row.name}</p>
                      {row.isDefault && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                          {t.defaultBadge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{row.provider.toUpperCase()} · {row.fromAddress}</p>
                  </div>
                  <div className="inline-flex items-center gap-0.5 shrink-0">
                    {!row.isDefault && (
                      <button type="button" onClick={() => makeDefault(row)} title={t.setDefault} className="p-1.5 rounded-md text-muted-foreground hover:text-amber-500">
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button type="button" onClick={() => setEditing(row)} title={t.edit} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(row)} title={t.delete} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-3">
                  <span>{row.apiKeyConfigured ? t.keySet : t.keyMissing}</span>
                  <span className="ml-auto">{row.apiKeyExpiresAt ? new Date(row.apiKeyExpiresAt).toLocaleDateString() : t.noExpiry}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {editing && (
        <ProviderEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void reload(); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t.deleteConfirmTitle}
        description={deleteTarget ? t.deleteConfirmBody.replace("{name}", deleteTarget.name) : ""}
        confirmLabel={t.delete}
        cancelLabel={t.cancel}
        destructive
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
    </div>
  );
}

function ProviderEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: ProviderRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const tr = useTranslations();
  const t  = tr.admin.config.providersTab;
  const isNew = initial === null;

  const [name,            setName]            = useState(initial?.name ?? "");
  const [provider,        setProvider]        = useState<"resend" | "sendgrid" | "mailgun">(initial?.provider ?? "resend");
  const [fromAddress,     setFromAddress]     = useState(initial?.fromAddress ?? "");
  const [fromName,        setFromName]        = useState(initial?.fromName ?? "");
  const [apiKey,          setApiKey]          = useState("");
  const [apiKeyExpiresAt, setApiKeyExpiresAt] = useState(initial?.apiKeyExpiresAt ?? "");
  const [isDefault,       setIsDefault]       = useState(initial?.isDefault ?? false);
  const [saving,          setSaving]          = useState(false);

  const nameOk    = name.trim().length > 0;
  const fromOk    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress);
  const keyOk     = isNew ? apiKey.trim().length > 0 : true;
  const canSubmit = nameOk && fromOk && keyOk && !saving;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name:            name.trim(),
        provider,
        fromAddress:     fromAddress.trim(),
        fromName:        fromName.trim() || null,
        apiKeyExpiresAt: apiKeyExpiresAt || null,
        isDefault,
      };
      if (isNew) {
        payload.apiKey = apiKey.trim();
      } else if (apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }
      const url = isNew ? "/api/admin/email/providers" : `/api/admin/email/providers/${initial!.id}`;
      const res = await fetch(url, {
        method:  isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t.saveError);
        return;
      }
      toast.success(isNew ? t.createdToast : t.updatedToast);
      onSaved();
    } catch {
      toast.error(t.saveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>{isNew ? t.editorNewTitle : t.editorEditTitle}</DialogTitle>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <DialogDescription>{isNew ? t.editorNewDesc : t.editorEditDesc}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t.fieldName}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={t.fieldNamePlaceholder} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t.fieldProvider}</Label>
              <select
                value={provider}
                onChange={e => setProvider(e.target.value as typeof provider)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
              >
                {PROVIDER_KINDS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t.fieldExpiry}</Label>
              <Input type="date" value={apiKeyExpiresAt} onChange={e => setApiKeyExpiresAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t.fieldFromAddress}</Label>
              <Input value={fromAddress} onChange={e => setFromAddress(e.target.value)} placeholder={t.fieldFromAddressPlaceholder} />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t.fieldFromName}</Label>
              <Input value={fromName} onChange={e => setFromName(e.target.value)} placeholder={t.fieldFromNamePlaceholder} />
            </div>
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t.fieldApiKey}{!isNew && <span className="text-muted-foreground/60"> — {t.fieldApiKeyRotateHint}</span>}
            </Label>
            <Input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={isNew ? t.fieldApiKeyPlaceholderNew : t.fieldApiKeyPlaceholderKeep}
              autoComplete="off"
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              className="accent-primary"
            />
            {t.fieldIsDefault}
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              {isNew ? t.createButton : t.saveButton}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
