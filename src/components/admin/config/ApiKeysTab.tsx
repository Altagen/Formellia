"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Check, KeyRound, X } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";

interface ApiKey {
  id:         string;
  name:       string;
  role:       string;
  lastUsedAt: string | null;
  expiresAt:  string | null;
  createdAt:  string;
}

interface CreateForm {
  name:      string;
  role:      "viewer" | "editor" | "admin";
  expiresAt: string;
}

const ROLE_BADGE: Record<string, string> = {
  admin:  "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  editor: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  viewer: "bg-muted text-muted-foreground",
};

export function ApiKeysTab() {
  const tr = useTranslations();
  const k  = tr.admin.config.apiKeys;

  const [keys, setKeys]         = useState<ApiKey[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [rawKey, setRawKey]     = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [form, setForm] = useState<CreateForm>({ name: "", role: "editor", expiresAt: "" });

  useEffect(() => {
    fetch("/api/admin/account/api-keys")
      .then(r => r.json())
      .then(d => setKeys(d.keys ?? []))
      .catch(() => toast.error(k.networkError))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const body: Record<string, unknown> = { name: form.name.trim(), role: form.role };
      if (form.expiresAt) body.expiresAt = form.expiresAt;
      const res = await fetch("/api/admin/account/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? k.networkError); return; }
      setRawKey(data.rawKey);
      setKeys(prev => [data.key, ...prev]);
      setShowCreate(false);
      setForm({ name: "", role: "editor", expiresAt: "" });
    } catch {
      toast.error(k.networkError);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      const res = await fetch(`/api/admin/account/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? k.networkError);
        return;
      }
      setKeys(prev => prev.filter(k => k.id !== id));
      setConfirmRevoke(null);
    } catch {
      toast.error(k.networkError);
    } finally {
      setRevoking(null);
    }
  }

  async function copyRawKey() {
    if (!rawKey) return;
    await navigator.clipboard.writeText(rawKey).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDate(iso: string | null) {
    if (!iso) return k.never;
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <KeyRound className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{k.title}</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {k.create}
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* One-time raw key banner */}
        {rawKey && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">{k.rawKeyTitle}</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">{k.rawKeyDesc}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-background border border-border rounded-lg px-3 py-2 break-all font-mono">
                {rawKey}
              </code>
              <button
                type="button"
                onClick={copyRawKey}
                className="shrink-0 p-2 rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer"
                title={k.rawKeyCopy}
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => { setRawKey(null); setCopied(false); }}
              className="mt-2 text-xs text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:no-underline cursor-pointer"
            >
              {k.rawKeyClose}
            </button>
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{k.name}</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={k.namePlaceholder}
                className="w-full text-sm border border-input rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground block mb-1">{k.role}</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as CreateForm["role"] }))}
                  className="w-full text-sm border border-input rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring/50"
                >
                  <option value="viewer">{k.roleViewer}</option>
                  <option value="editor">{k.roleEditor}</option>
                  <option value="admin">{k.roleAdmin}</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground block mb-1">{k.expiresAt}</label>
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                  className="w-full text-sm border border-input rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring/50"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{k.expiresAtHint}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors cursor-pointer"
              >
                {k.cancel}
              </button>
              <button
                type="button"
                disabled={!form.name.trim() || creating}
                onClick={handleCreate}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {creating ? "…" : k.create}
              </button>
            </div>
          </div>
        )}

        {/* Description */}
        <p className="text-xs text-muted-foreground">{k.description}</p>

        {/* Keys list */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">{k.noKeys}</p>
        ) : (
          <ul className="divide-y divide-border">
            {keys.map(key => (
              <li key={key.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-foreground truncate">{key.name}</p>
                    <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[key.role] ?? ROLE_BADGE.viewer}`}>
                      {key.role}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {k.createdAt} {formatDate(key.createdAt)}
                    {key.lastUsedAt ? ` · ${k.lastUsed} ${formatDate(key.lastUsedAt)}` : ` · ${k.lastUsed} ${k.never}`}
                    {key.expiresAt ? ` · ${k.expiresAt} ${formatDate(key.expiresAt)}` : ""}
                  </p>
                </div>
                {confirmRevoke === key.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-destructive">{k.revokeConfirmTitle}</span>
                    <button
                      onClick={() => setConfirmRevoke(null)}
                      className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-muted cursor-pointer transition-colors"
                    >
                      {k.cancel}
                    </button>
                    <button
                      onClick={() => handleRevoke(key.id)}
                      disabled={revoking === key.id}
                      className="text-xs px-2 py-1 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      {revoking === key.id ? "…" : k.confirmRevoke}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRevoke(key.id)}
                    className="text-muted-foreground hover:text-destructive cursor-pointer transition-colors shrink-0 p-1 rounded-lg hover:bg-destructive/10"
                    title={k.revoke}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
