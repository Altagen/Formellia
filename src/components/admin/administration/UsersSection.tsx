"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, X as XIcon, Copy, Check, X } from "lucide-react";
import { CreateUserForm } from "@/components/dashboard/CreateUserForm";
import { useTranslations } from "@/lib/context/LocaleContext";

type AdminRole = "admin" | "editor" | "agent" | "viewer";
type GrantRole = "editor" | "agent" | "viewer";
export interface AdminUser { id: string; username: string; email: string | null; role: string | null; }
interface FormOption  { id: string; slug: string; name: string; }
interface GrantRow    { id: string; formInstanceId: string; role: GrantRole; formName?: string; formSlug?: string; }

const AVATAR_PALETTE = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-purple-600",
  "bg-rose-600",
  "bg-cyan-700",
  "bg-zinc-700",
];

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
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

export function UsersSection({ initialAdmins }: { initialAdmins: AdminUser[] }) {
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
          <ul className="space-y-2">
            {users.map(user => (
              <li
                key={user.id}
                className="rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <div
                    className={`w-10 h-10 rounded-full ${avatarColor(user.username)} flex items-center justify-center text-white text-sm font-semibold shrink-0`}
                  >
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
                <UserGrantsEditor userId={user.id} disabled={user.role !== null} />
              </li>
            ))}
          </ul>
        )}
      </div>

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

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">{u.createUser}</h2>
        <CreateUserForm onCreated={(u) => setUsers(prev => [...prev, { id: u.id, username: u.username, email: u.email, role: null }])} />
      </div>
    </div>
  );
}
