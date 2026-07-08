"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Timer, UserPlus, X as XIcon } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function PasswordPolicyToggle() {
  const tr = useTranslations();
  const u = tr.admin.config.users;
  const [enforced, setEnforced] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/app-config")
      .then(r => r.json())
      .then(d => setEnforced(d.enforcePasswordPolicy ?? false))
      .catch(() => setEnforced(false));
  }, []);

  async function toggle(value: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enforcePasswordPolicy: value }),
      });
      if (res.ok) {
        setEnforced(value);
        toast.success(value ? u.policyEnabled : u.policyDisabled);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? tr.admin.config.toasts.networkError);
      }
    } catch {
      toast.error(tr.admin.config.toasts.networkError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">{u.passwordPolicy}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {u.passwordPolicyDesc}
            </p>
            {enforced && (
              <p className="text-xs text-primary mt-1.5 font-medium">
                {u.passwordPolicyActive}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enforced ?? false}
          disabled={enforced === null || saving}
          onClick={() => toggle(!enforced)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50 ${
            enforced ? "bg-primary" : "bg-input"
          }`}
        >
          <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${enforced ? "translate-x-4" : "translate-x-0"}`} />
        </button>
      </div>
    </div>
  );
}

const SESSION_PRESETS = [1, 7, 30, 90, 365] as const;

function SessionDurationSetting() {
  const tr = useTranslations();
  const u = tr.admin.config.users;
  const [days, setDays]     = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/app-config")
      .then(r => r.json())
      .then(d => setDays(d.sessionDurationDays ?? 30))
      .catch(() => setDays(30));
  }, []);

  async function save(value: number) {
    setDays(value);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionDurationDays: value }),
      });
      if (res.ok) {
        toast.success(u.sessionDurationSaved);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? tr.admin.config.toasts.networkError);
      }
    } catch {
      toast.error(tr.admin.config.toasts.networkError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <Timer className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{u.sessionDuration}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">{u.sessionDurationDesc}</p>
          <div className="flex flex-wrap gap-2">
            {SESSION_PRESETS.map(n => (
              <button
                key={n}
                type="button"
                disabled={saving || days === null}
                onClick={() => save(n)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer disabled:opacity-50 ${
                  days === n
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-muted"
                }`}
              >
                {u.sessionDurationDays.split(" | ")[n === 1 ? 0 : 1]?.replace("{n}", String(n)) ?? `${n}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function UserCreationRateLimitSetting() {
  const tr = useTranslations();
  const u = tr.admin.config.users;
  const [limit, setLimit]   = useState<number | null>(null);
  const [input, setInput]   = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/app-config")
      .then(r => r.json())
      .then(d => {
        const val = d.userCreationRateLimit ?? 5;
        setLimit(val);
        setInput(String(val));
      })
      .catch(() => { setLimit(5); setInput("5"); });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const value = parseInt(input, 10);
    if (isNaN(value) || value < 0 || value > 128) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCreationRateLimit: value }),
      });
      if (res.ok) {
        setLimit(value);
        toast.success(u.userCreationRateLimitSaved);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? tr.admin.config.toasts.networkError);
      }
    } catch {
      toast.error(tr.admin.config.toasts.networkError);
    } finally {
      setSaving(false);
    }
  }

  const parsed = parseInt(input, 10);
  const invalid = input !== "" && (isNaN(parsed) || parsed < 0 || parsed > 128);
  const dirty = limit !== null && parsed !== limit && !isNaN(parsed);
  const disabled_creation = !isNaN(parsed) && parsed === 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <UserPlus className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{u.userCreationRateLimit}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">{u.userCreationRateLimitDesc}</p>
          <form onSubmit={handleSave} className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={128}
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={limit === null || saving}
              className={`w-24 h-9 rounded-lg border px-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50 transition-shadow ${
                invalid ? "border-destructive" : disabled_creation ? "border-amber-500" : "border-input"
              }`}
            />
            {!disabled_creation && (
              <span className="text-xs text-muted-foreground">{u.userCreationRateLimitUnit}</span>
            )}
            <button
              type="submit"
              disabled={saving || limit === null || !dirty || invalid}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {saving ? "…" : u.userCreationRateLimitSave}
            </button>
          </form>
          {invalid && (
            <p className="text-xs text-destructive mt-1.5">{u.userCreationRateLimitRange}</p>
          )}
          {disabled_creation && !invalid && (
            <p className="text-xs text-amber-600 mt-1.5">{u.userCreationRateLimitDisabled}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function LoginRateLimitSetting() {
  const tr = useTranslations();
  const u = tr.admin.config.users;
  const [maxAttempts, setMaxAttempts]   = useState<number | null>(null);
  const [winMinutes, setWinMinutes]     = useState<number | null>(null);
  const [inputMax, setInputMax]         = useState("");
  const [inputWin, setInputWin]         = useState("");
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    fetch("/api/admin/app-config")
      .then(r => r.json())
      .then(d => {
        const ma = d.loginRateLimitMaxAttempts   ?? 10;
        const wm = d.loginRateLimitWindowMinutes ?? 15;
        setMaxAttempts(ma); setInputMax(String(ma));
        setWinMinutes(wm);  setInputWin(String(wm));
      })
      .catch(() => { setMaxAttempts(10); setInputMax("10"); setWinMinutes(15); setInputWin("15"); });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const ma = parseInt(inputMax, 10);
    const wm = parseInt(inputWin, 10);
    if (isNaN(ma) || ma < 1 || ma > 200 || isNaN(wm) || wm < 1 || wm > 1440) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginRateLimitMaxAttempts: ma, loginRateLimitWindowMinutes: wm }),
      });
      if (res.ok) {
        setMaxAttempts(ma); setWinMinutes(wm);
        toast.success(u.loginRateLimitSaved);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? tr.admin.config.toasts.networkError);
      }
    } catch {
      toast.error(tr.admin.config.toasts.networkError);
    } finally {
      setSaving(false);
    }
  }

  const parsedMax = parseInt(inputMax, 10);
  const parsedWin = parseInt(inputWin, 10);
  const invalidMax = inputMax !== "" && (isNaN(parsedMax) || parsedMax < 1 || parsedMax > 200);
  const invalidWin = inputWin !== "" && (isNaN(parsedWin) || parsedWin < 1 || parsedWin > 1440);
  const dirty = !isNaN(parsedMax) && !isNaN(parsedWin) &&
    (parsedMax !== maxAttempts || parsedWin !== winMinutes);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{u.loginRateLimit}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">{u.loginRateLimitDesc}</p>
          <form onSubmit={handleSave} className="flex flex-wrap items-start gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{u.loginRateLimitMaxAttempts}</label>
              <input
                type="number" min={1} max={200}
                value={inputMax}
                onChange={e => setInputMax(e.target.value)}
                disabled={maxAttempts === null || saving}
                className={`w-24 h-9 rounded-lg border px-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50 transition-shadow ${invalidMax ? "border-destructive" : "border-input"}`}
              />
              {invalidMax && <p className="text-xs text-destructive">{u.loginRateLimitMaxRange}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{u.loginRateLimitWindowMinutes}</label>
              <input
                type="number" min={1} max={1440}
                value={inputWin}
                onChange={e => setInputWin(e.target.value)}
                disabled={winMinutes === null || saving}
                className={`w-28 h-9 rounded-lg border px-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50 transition-shadow ${invalidWin ? "border-destructive" : "border-input"}`}
              />
              {invalidWin && <p className="text-xs text-destructive">{u.loginRateLimitWinRange}</p>}
            </div>
            <div className="flex items-end pb-0.5">
              <button
                type="submit"
                disabled={saving || maxAttempts === null || !dirty || invalidMax || invalidWin}
                className="px-3 py-1.5 h-9 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {saving ? "…" : u.loginRateLimitSave}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

interface CertRow { id: string; name: string; enabled: boolean; pemExcerpt: string; createdAt: string; }

function CustomCaSection() {
  const tr = useTranslations();
  const u = tr.admin.config.users;
  const [certs, setCerts]   = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName]     = useState("");
  const [pem, setPem]       = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/certs");
      const data = await res.json().catch(() => []);
      setCerts(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleAdd() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/certs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pem, enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? tr.admin.config.toasts.networkError); return; }
      toast.success(u.certsSaved);
      setName(""); setPem(""); setEnabled(true); setShowAdd(false);
      void load();
    } catch {
      toast.error(tr.admin.config.toasts.networkError);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, value: boolean) {
    await fetch(`/api/admin/certs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: value }),
    });
    toast.success(u.certsToggled);
    void load();
  }

  async function handleDeleteConfirmed(id: string) {
    setDeleteTarget(null);
    setDeleting(id);
    try {
      await fetch(`/api/admin/certs/${id}`, { method: "DELETE" });
      toast.success(u.certsDeleted);
      void load();
    } finally {
      setDeleting(null);
    }
  }

  const inputCls = "w-full text-xs border border-input rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring";
  const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{u.sectionCerts}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{u.certsDesc}</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="text-xs font-medium text-primary hover:underline shrink-0"
        >
          {u.certsAdd}
        </button>
      </div>

      {showAdd && (
        <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/20">
          <div>
            <label className={labelCls}>{u.certsName}</label>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder={u.certsNamePlaceholder} />
          </div>
          <div>
            <label className={labelCls}>{u.certsPem}</label>
            <textarea
              className={`${inputCls} font-mono h-32 resize-y`}
              value={pem}
              onChange={e => setPem(e.target.value)}
              placeholder={u.certsPemPlaceholder}
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="accent-primary" />
            {u.certsEnabled}
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !name || !pem}
              className="text-xs font-medium px-3 py-1.5 bg-primary text-primary-foreground rounded-md disabled:opacity-50"
            >
              {saving ? "…" : u.certsSave}
            </button>
            <button onClick={() => setShowAdd(false)} className="text-xs px-3 py-1.5 border border-border rounded-md">
              {tr.admin.config.forms.cancel}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">…</p>
      ) : certs.length === 0 ? (
        <p className="text-xs text-muted-foreground">{u.certsNone}</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {certs.map(c => (
            <div key={c.id} className="flex items-center justify-between px-3 py-2 text-xs bg-muted/10">
              <div className="min-w-0">
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 font-mono text-muted-foreground truncate max-w-xs hidden sm:inline">{c.pemExcerpt.split("\n")[0]}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={c.enabled} onChange={e => void handleToggle(c.id, e.target.checked)} className="accent-primary" />
                  <span className="text-muted-foreground">{c.enabled ? u.certsActive : u.certsInactive}</span>
                </label>
                <button
                  onClick={() => setDeleteTarget(c.id)}
                  disabled={deleting === c.id}
                  className="text-destructive hover:underline"
                >
                  {deleting === c.id ? "…" : <XIcon className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">{u.certsNote}</p>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={u.certsDeleteConfirm}
        confirmLabel={tr.admin.config.forms.delete}
        cancelLabel={tr.admin.config.forms.cancel}
        destructive
        onConfirm={() => deleteTarget && void handleDeleteConfirmed(deleteTarget)}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
      />
    </div>
  );
}

export function SecuritySection() {
  return (
    <div className="space-y-4">
      <PasswordPolicyToggle />
      <SessionDurationSetting />
      <UserCreationRateLimitSetting />
      <LoginRateLimitSetting />
      <CustomCaSection />
    </div>
  );
}
