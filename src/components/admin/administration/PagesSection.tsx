"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Globe, Lock, X as XIcon } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";

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

export function PagesSection() {
  return (
    <div className="space-y-4">
      <RootPageSetting />
      <ProtectedSlugsSetting />
    </div>
  );
}
