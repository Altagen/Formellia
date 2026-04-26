"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Globe, Lock, ShieldCheck, ShieldAlert, Timer, UserPlus, X as XIcon } from "lucide-react";
import { Copy, Check, X } from "lucide-react";
import { CreateUserForm } from "@/components/dashboard/CreateUserForm";
import { useTranslations } from "@/lib/context/LocaleContext";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type AdminRole = "admin" | "editor" | "agent" | "viewer";
type GrantRole = "editor" | "agent" | "viewer";
interface AdminUser { id: string; username: string; email: string | null; role: string | null; }
interface FormOption  { id: string; slug: string; name: string; }
interface GrantRow    { id: string; formInstanceId: string; role: GrantRole; formName?: string; formSlug?: string; }

function RootPageSetting() {
  const tr = useTranslations();
  const u = tr.admin.config.users;
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/app-config")
      .then(r => r.json())
      .then(d => setEnabled(d.useCustomRoot ?? false))
      .catch(() => setEnabled(false));
  }, []);

  async function toggle(value: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useCustomRoot: value }),
      });
      if (res.ok) {
        setEnabled(value);
        toast.success(value ? u.rootPageEnabled : u.rootPageDisabled);
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
          <Globe className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">{u.rootPage}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{u.rootPageDesc}</p>
            {enabled && (
              <p className="text-xs text-amber-600 mt-1.5 font-medium">{u.rootPageWarning}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled ?? false}
          disabled={enabled === null || saving}
          onClick={() => toggle(!enabled)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50 ${
            enabled ? "bg-primary" : "bg-input"
          }`}
        >
          <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${enabled ? "translate-x-4" : "translate-x-0"}`} />
        </button>
      </div>
    </div>
  );
}

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

type FormSlugOption = { id: string; slug: string; name: string };

function ProtectedSlugsSetting() {
  const tr = useTranslations();
  const u = tr.admin.config.users;
  const [protectedSlugs, setProtectedSlugs] = useState<string[] | null>(null);
  const [forms, setForms] = useState<FormSlugOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/app-config").then(r => r.json()),
      fetch("/api/admin/forms").then(r => r.json()),
    ]).then(([cfg, fs]) => {
      setProtectedSlugs(cfg.protectedSlugs ?? []);
      setForms(Array.isArray(fs) ? fs : []);
    }).catch(() => { setProtectedSlugs([]); setForms([]); });
  }, []);

  async function save(next: string[]) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protectedSlugs: next }),
      });
      if (res.ok) {
        setProtectedSlugs(next);
        toast.success(u.protectedSlugsSaved);
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

  function remove(slug: string) {
    if (!protectedSlugs) return;
    save(protectedSlugs.filter(s => s !== slug));
  }

  function add(slug: string) {
    if (!protectedSlugs || protectedSlugs.includes(slug)) return;
    save([...protectedSlugs, slug]);
  }

  const unprotectedForms = forms.filter(f => !protectedSlugs?.includes(f.slug));

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <Lock className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{u.protectedSlugs}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">{u.protectedSlugsDesc}</p>

          {protectedSlugs === null ? (
            <div className="h-8 rounded bg-muted animate-pulse w-32" />
          ) : protectedSlugs.length === 0 ? (
            <p className="text-xs text-muted-foreground italic mb-3">{u.protectedSlugsEmpty}</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {protectedSlugs.map(slug => {
                const form = forms.find(f => f.slug === slug);
                return (
                  <span key={slug} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                    <Lock className="w-3 h-3 shrink-0" />
                    <span className="font-mono">{slug === "/" ? "/" : `/${slug}`}</span>
                    {form && <span className="text-primary/60 max-w-[100px] truncate">({form.name})</span>}
                    <button
                      type="button"
                      onClick={() => remove(slug)}
                      disabled={saving}
                      title={u.protectedSlugsRemove}
                      className="ml-0.5 rounded hover:bg-primary/20 p-0.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {unprotectedForms.length > 0 && (
            <select
              disabled={saving || protectedSlugs === null}
              value=""
              onChange={e => { if (e.target.value) add(e.target.value); }}
              className="text-xs border border-input rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50 cursor-pointer"
            >
              <option value="">{u.protectedSlugsAdd}</option>
              {unprotectedForms.map(f => (
                <option key={f.id} value={f.slug}>
                  {f.slug === "/" ? "/" : `/${f.slug}`} — {f.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}

function UserGrantsEditor({ userId, disabled }: { userId: string; disabled: boolean }) {
  const tr = useTranslations();
  const u = tr.admin.config.users;
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [forms, setForms]   = useState<FormOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (disabled) return;
    Promise.all([
      fetch(`/api/admin/users/${userId}/grants`).then(r => r.json()).catch(() => ({ grants: [] })),
      fetch("/api/admin/forms").then(r => r.json()).catch(() => []),
    ]).then(([gd, fs]) => {
      setGrants(Array.isArray(gd.grants) ? gd.grants : []);
      setForms(Array.isArray(fs) ? fs : []);
      setLoaded(true);
    });
  }, [userId, disabled]);

  async function saveGrants(next: GrantRow[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/grants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grants: next.map(g => ({ formInstanceId: g.formInstanceId, role: g.role })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? tr.admin.config.toasts.networkError); return; }
      setGrants(next);
      toast.success(u.grantsSaved);
    } catch {
      toast.error(tr.admin.config.toasts.networkError);
    } finally {
      setSaving(false);
    }
  }

  function removeGrant(formInstanceId: string) {
    saveGrants(grants.filter(g => g.formInstanceId !== formInstanceId));
  }

  function addGrant(formId: string) {
    if (grants.some(g => g.formInstanceId === formId)) return;
    const form = forms.find(f => f.id === formId);
    const newGrant: GrantRow = { id: "", formInstanceId: formId, role: "agent", formName: form?.name, formSlug: form?.slug };
    saveGrants([...grants, newGrant]);
  }

  function changeRole(formInstanceId: string, role: GrantRole) {
    saveGrants(grants.map(g => g.formInstanceId === formInstanceId ? { ...g, role } : g));
  }

  const ungranted = forms.filter(f => !grants.some(g => g.formInstanceId === f.id));

  if (disabled) {
    return (
      <p className="text-xs text-muted-foreground italic mt-2 pl-2">
        {u.grantsGlobalRoleNote}
      </p>
    );
  }

  if (!loaded) {
    return <div className="h-6 rounded bg-muted animate-pulse w-40 mt-2 ml-2" />;
  }

  return (
    <div className="mt-3 pl-2 border-l-2 border-border space-y-2">
      <p className="text-xs font-medium text-foreground">{u.grantsTitle}</p>
      {grants.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{u.grantsEmpty}</p>
      ) : (
        <ul className="space-y-1">
          {grants.map(g => (
            <li key={g.formInstanceId} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-foreground">
                {g.formName ?? g.formSlug ?? g.formInstanceId}
              </span>
              <select
                value={g.role}
                disabled={saving}
                onChange={e => changeRole(g.formInstanceId, e.target.value as GrantRole)}
                className="border border-input rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring/50 disabled:opacity-50 text-xs"
              >
                <option value="editor">{u.roleEditor}</option>
                <option value="agent">{u.roleAgent ?? "Agent"}</option>
                <option value="viewer">{u.roleViewer}</option>
              </select>
              <button
                type="button"
                disabled={saving}
                onClick={() => removeGrant(g.formInstanceId)}
                className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer disabled:opacity-50"
                title={u.grantsRemove ?? "Remove access"}
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {ungranted.length > 0 && (
        <select
          disabled={saving}
          value=""
          onChange={e => { if (e.target.value) addGrant(e.target.value); }}
          className="text-xs border border-input rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring/50 disabled:opacity-50 cursor-pointer"
        >
          <option value="">{u.grantsAdd ?? "+ Add access"}</option>
          {ungranted.map(f => (
            <option key={f.id} value={f.id}>{f.slug === "/" ? "/" : `/${f.slug}`} — {f.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function UsersSection({ initialAdmins }: { initialAdmins: AdminUser[] }) {
  const router = useRouter();
  const tr = useTranslations();
  const u = tr.admin.config.users;
  const cfg = tr.admin.config;

  const ROLE_LABELS: Record<AdminRole, string> = {
    admin:  u.roleAdmin,
    editor: u.roleEditor,
    agent:  u.roleAgent,
    viewer: u.roleViewer,
  };
  const ROLE_DESCRIPTIONS: Record<AdminRole | "null", string> = {
    admin:  u.accessFull,
    editor: u.accessManage,
    agent:  u.accessAgent,
    viewer: u.accessRead,
    null:   u.accessScoped,
  };

  const [users, setUsers] = useState<AdminUser[]>(initialAdmins);
  const [updating, setUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [generatingTemp, setGeneratingTemp] = useState<string | null>(null);
  const [confirmTempReset, setConfirmTempReset] = useState<string | null>(null);
  const [tempPasswordModal, setTempPasswordModal] = useState<{ username: string; password: string } | null>(null);
  const [tempCopied, setTempCopied] = useState(false);

  async function handleRoleChange(id: string, role: AdminRole | "null") {
    setUpdating(id);
    const apiRole: AdminRole | null = role === "null" ? null : role;
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: apiRole }),
      });
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === id ? { ...u, role: apiRole } : u));
        toast.success(u.roleUpdated);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? cfg.toasts.networkError);
      }
    } catch {
      toast.error(cfg.toasts.networkError);
    } finally {
      setUpdating(null);
    }
  }

  async function handleGenerateTempPassword(id: string, username: string) {
    setConfirmTempReset(null);
    setGeneratingTemp(id);
    try {
      const res = await fetch(`/api/admin/users/${id}/temp-password`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? cfg.toasts.networkError); return; }
      setTempPasswordModal({ username, password: data.tempPassword });
      setTempCopied(false);
    } catch {
      toast.error(cfg.toasts.networkError);
    } finally {
      setGeneratingTemp(null);
    }
  }

  async function copyTempPassword() {
    if (!tempPasswordModal) return;
    await navigator.clipboard.writeText(tempPasswordModal.password).catch(() => {});
    setTempCopied(true);
    setTimeout(() => setTempCopied(false), 2000);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== id));
        toast.success(u.userDeleted);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? cfg.toasts.networkError);
      }
    } catch {
      toast.error(cfg.toasts.networkError);
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">{u.title}</h2>
        <p className="text-xs text-muted-foreground mb-4">{u.description}</p>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">{u.noUsers}</p>
        ) : (
          <ul className="divide-y divide-border">
            {users.map(user => (
              <li key={user.id} className="py-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
                    {user.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate font-medium">@{user.username}</p>
                    {user.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                    <p className="text-xs text-muted-foreground/70">
                      {ROLE_DESCRIPTIONS[(user.role ?? "null") as AdminRole | "null"] ?? user.role}
                    </p>
                  </div>
                <select
                  value={user.role ?? "null"}
                  disabled={updating === user.id}
                  onChange={e => handleRoleChange(user.id, e.target.value as AdminRole | "null")}
                  className="text-xs border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
                >
                  {(Object.keys(ROLE_LABELS) as AdminRole[]).map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                  <option value="null">{u.roleNone ?? "None (scoped access)"}</option>
                </select>
                {/* Temp password — two-step confirmation */}
                {confirmTempReset === user.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleGenerateTempPassword(user.id, user.username)}
                      disabled={generatingTemp === user.id}
                      className="text-xs text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 rounded px-2 py-1 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50"
                    >
                      {u.confirm}
                    </button>
                    <button
                      onClick={() => setConfirmTempReset(null)}
                      className="text-xs text-muted-foreground hover:text-foreground cursor-pointer px-1"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmTempReset(user.id)}
                    disabled={generatingTemp === user.id}
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors shrink-0 border border-border rounded px-2 py-1 disabled:opacity-50"
                    title={u.resetPassword}
                  >
                    {generatingTemp === user.id ? "…" : u.resetPassword}
                  </button>
                )}

                {confirmDelete === user.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-destructive">{u.confirmDelete}</span>
                    <button onClick={() => setConfirmDelete(null)} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted cursor-pointer">{u.no}</button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      disabled={deleting === user.id}
                      className="text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer disabled:opacity-50"
                    >
                      {deleting === user.id ? "…" : u.yes}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(user.id)}
                    className="text-muted-foreground hover:text-destructive cursor-pointer transition-colors shrink-0"
                    title={u.deleteUser}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
                </div>
                {/* Per-form grants — shown when role is null (scoped-only) */}
                <UserGrantsEditor userId={user.id} disabled={user.role !== null} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Temp password modal */}
      {tempPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">{u.tempPasswordModal}</h2>
              <button onClick={() => setTempPasswordModal(null)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground">{u.tempPasswordWarning.replace("{username}", tempPasswordModal.username)}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono bg-muted border border-border rounded-lg px-3 py-2 break-all select-all">
                  {tempPasswordModal.password}
                </code>
                <button
                  onClick={copyTempPassword}
                  className="shrink-0 p-2 rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer"
                >
                  {tempCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
                <p className="text-xs text-amber-800 dark:text-amber-300">{u.tempPasswordOnce}</p>
              </div>
              <button
                onClick={() => setTempPasswordModal(null)}
                className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
              >
                {u.tempPasswordClose}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <p><strong>{u.roleAdmin}</strong> — {u.roleAdminDesc}</p>
          <p><strong>{u.roleEditor}</strong> — {u.roleEditorDesc}</p>
          <p><strong>{u.roleAgent}</strong> — {u.roleAgentDesc}</p>
          <p><strong>{u.roleViewer}</strong> — {u.roleViewerDesc}</p>
          <p><strong>{u.roleNone}</strong> — {u.roleNoneDesc}</p>
        </div>
      </div>

      <PasswordPolicyToggle />
      <SessionDurationSetting />
      <UserCreationRateLimitSetting />

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">{u.createUser}</h2>
        <CreateUserForm onCreated={(u) => setUsers(prev => [...prev, { id: u.id, username: u.username, email: u.email, role: null }])} />
      </div>
    </div>
  );
}

interface AdminTabProps {
  admins: AdminUser[];
}

// ─── Custom CA Section ────────────────────────────────────────────────────────

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
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="My internal CA" />
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

export function AdminTab({ admins }: AdminTabProps) {
  const tr = useTranslations();
  const u = tr.admin.config.users;
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{u.sectionPages}</h3>
        <RootPageSetting />
        <ProtectedSlugsSetting />
      </section>
      <section className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{u.sectionSecurity}</h3>
        <PasswordPolicyToggle />
        <SessionDurationSetting />
        <UserCreationRateLimitSetting />
        <LoginRateLimitSetting />
        <CustomCaSection />
      </section>
      <section className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{u.title}</h3>
        <UsersSection initialAdmins={admins} />
      </section>
    </div>
  );
}
