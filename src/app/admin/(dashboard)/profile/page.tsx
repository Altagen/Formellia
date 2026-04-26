"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sun, Moon, Check, KeyRound, Monitor, Languages, AlertTriangle, Mail, ShieldCheck, Copy, RefreshCw } from "lucide-react";
import { ApiKeysTab } from "@/components/admin/config/ApiKeysTab";
import { PasswordStrengthIndicator } from "@/components/ui/PasswordStrengthIndicator";
import { ActiveSessions } from "@/components/dashboard/ActiveSessions";
import { useTranslations } from "@/lib/context/LocaleContext";
import { useUserPreferences } from "@/lib/context/UserPreferencesContext";
import { COLOR_PRESETS, PRESET_NAMES } from "@/lib/theme/presets";
import type { ThemeMode } from "@/types/config";
import type { Locale } from "@/i18n";

function ProfilePageInner() {
  const searchParams = useSearchParams();
  const mustChange = searchParams.get("changePassword") === "true";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const tr = useTranslations();
  const p = tr.admin.profile;
  const { themeMode, colorPreset, locale, setThemeMode, setColorPreset, setLocale, saving: prefSaving } = useUserPreferences();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirm) { setError(p.errorMismatch); return; }
    if (newPassword.length < 8)  { setError(p.errorMinLength); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? p.errorChange); return; }
      toast.success(p.successPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setError("");
    } catch {
      toast.error(p.networkError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">

      {/* Forced password change banner */}
      {mustChange && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-300">{p.mustChangePasswordBanner}</p>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{p.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{p.appearanceDesc}</p>
        </div>
        {prefSaving && (
          <span className="text-xs text-muted-foreground mt-1 animate-pulse">…</span>
        )}
      </div>

      {/* ── Appearance ── */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
          <Monitor className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{p.appearanceTitle}</h2>
        </div>

        <div className="p-5 space-y-5">
          {/* Theme */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm font-medium text-foreground">{p.themeLabel}</p>
            <ThemeSegmentedControl
              value={themeMode}
              onChange={setThemeMode}
              labelLight={p.themeLight}
              labelDark={p.themeDark}
            />
          </div>

          <div className="border-t border-border/50" />

          {/* Color preset */}
          <div>
            <p className="text-sm font-medium text-foreground mb-3">{p.colorLabel}</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_NAMES.map((name) => {
                const preset = COLOR_PRESETS[name];
                const active = (colorPreset ?? "default") === name;
                return (
                  <button
                    key={name}
                    type="button"
                    title={preset.label}
                    onClick={() => setColorPreset(name)}
                    className={`group flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all cursor-pointer ${
                      active ? "bg-accent ring-2 ring-primary/40" : "hover:bg-accent/60"
                    }`}
                  >
                    <span className="relative block w-8 h-8 rounded-full shadow-sm" style={{ backgroundColor: preset.swatch }}>
                      {active && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <Check className="w-4 h-4 text-white drop-shadow" strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className={`text-[10px] leading-none ${active ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Language ── */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
          <Languages className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{p.localeLabel}</h2>
        </div>

        <div className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-muted-foreground max-w-xs">{p.localeHint}</p>
            <LocaleSegmentedControl
              value={locale}
              onChange={setLocale}
              labelFr={p.localeFr}
              labelEn={p.localeEn}
            />
          </div>
        </div>
      </section>

      {/* ── Email ── */}
      <EmailSection />

      {/* ── Recovery codes ── */}
      <RecoveryCodesSection />

      {/* ── Password ── */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
          <KeyRound className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{p.changePassword}</h2>
        </div>
        <div className="p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{p.currentPassword}</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{p.newPassword}</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
              />
              <PasswordStrengthIndicator password={newPassword} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{p.confirm}</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {saving ? p.saving : p.save}
            </button>
          </form>
        </div>
      </section>

      {/* ── API Keys ── */}
      <ApiKeysTab />

      {/* ── Sessions ── */}
      <ActiveSessions />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfilePageInner />
    </Suspense>
  );
}

/* ─── Email section ────────────────────────────────────────────────────────── */

function EmailSection() {
  const tr = useTranslations();
  const p = tr.admin.profile;
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [initialEmail, setInitialEmail] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/account/email")
      .then(r => r.json())
      .then(d => {
        const val = d.email ?? "";
        setInitialEmail(d.email);
        setEmail(val);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/account/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "email_duplicate") {
          setError(p.emailDuplicate);
        } else {
          toast.error(data.error ?? p.networkError);
        }
        return;
      }
      setInitialEmail(email.trim() || null);
      toast.success(p.emailSaved);
      router.refresh();
    } catch {
      toast.error(p.networkError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <Mail className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{p.emailSection}</h2>
      </div>
      <div className="p-5 space-y-4">
        {!initialEmail && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-300">{p.emailEmpty}</p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(""); }}
              placeholder="email@exemple.fr"
              autoComplete="email"
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving ? p.saving : p.emailSave}
          </button>
        </form>
      </div>
    </section>
  );
}

/* ─── Theme segmented control ─────────────────────────────────────────────── */

/* ─── Recovery codes section ──────────────────────────────────────────────── */

function RecoveryCodesSection() {
  const tr = useTranslations();
  const p = tr.admin.profile;
  const [count, setCount]         = useState<number | null>(null);
  const [codes, setCodes]         = useState<string[] | null>(null);
  const [copied, setCopied]       = useState(false);
  const [generating, setGenerating] = useState(false);
  const [clearing, setClearing]   = useState(false);

  useEffect(() => {
    fetch("/api/admin/account/recovery-codes")
      .then(r => r.json())
      .then(d => setCount(d.count ?? 0))
      .catch(() => setCount(0));
  }, []);

  async function generate() {
    setGenerating(true);
    setCodes(null);
    try {
      const res = await fetch("/api/admin/account/recovery-codes", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setCodes(data.codes);
        setCount(data.codes.length);
        toast.success(p.recoveryCodesGenerated);
      } else {
        toast.error(data.error ?? p.networkError);
      }
    } catch {
      toast.error(p.networkError);
    } finally {
      setGenerating(false);
    }
  }

  async function clear() {
    setClearing(true);
    try {
      const res = await fetch("/api/admin/account/recovery-codes", { method: "DELETE" });
      if (res.ok) {
        setCount(0);
        setCodes(null);
        toast.success(p.recoveryCodesCleared);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? p.networkError);
      }
    } catch {
      toast.error(p.networkError);
    } finally {
      setClearing(false);
    }
  }

  async function copyAll() {
    if (!codes) return;
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <ShieldCheck className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{p.recoveryCodesSection}</h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-muted-foreground">{p.recoveryCodesDesc}</p>

        {count === 0 && !codes && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-300">{p.recoveryCodesNone}</p>
          </div>
        )}

        {count !== null && count > 0 && !codes && (
          <p className="text-xs text-muted-foreground">{p.recoveryCodesCount.replace("{n}", String(count))}</p>
        )}

        {codes && (
          <div className="space-y-2">
            <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">{p.recoveryCodesWarning}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3 font-mono text-xs grid grid-cols-2 gap-1.5">
              {codes.map(c => (
                <span key={c} className="px-2 py-1 rounded bg-background border border-border">{c}</span>
              ))}
            </div>
            <button
              type="button"
              onClick={copyAll}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? p.recoveryCodesCopied : p.recoveryCodesCopyAll}
            </button>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={generate}
            disabled={generating || clearing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} />
            {count !== null && count > 0 ? p.recoveryCodesRegenerate : p.recoveryCodesGenerate}
          </button>
          {count !== null && count > 0 && !codes && (
            <button
              type="button"
              onClick={clear}
              disabled={generating || clearing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {p.recoveryCodesClear}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

interface ThemeSegmentedControlProps {
  value: ThemeMode;
  onChange: (v: ThemeMode) => void;
  labelLight: string;
  labelDark: string;
}

function ThemeSegmentedControl({ value, onChange, labelLight, labelDark }: ThemeSegmentedControlProps) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted border border-border">
      {([
        { mode: "light" as ThemeMode, Icon: Sun,  label: labelLight },
        { mode: "dark"  as ThemeMode, Icon: Moon, label: labelDark  },
      ] as const).map(({ mode, Icon, label }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              active
                ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className={`w-4 h-4 transition-colors ${active ? "text-primary" : ""}`} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Locale segmented control ────────────────────────────────────────────── */

interface LocaleSegmentedControlProps {
  value: Locale;
  onChange: (v: Locale) => void;
  labelFr: string;
  labelEn: string;
}

function LocaleSegmentedControl({ value, onChange, labelFr, labelEn }: LocaleSegmentedControlProps) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted border border-border">
      {([
        { locale: "fr" as Locale, flag: "🇫🇷", label: labelFr },
        { locale: "en" as Locale, flag: "🇬🇧", label: labelEn },
      ] as const).map(({ locale, flag, label }) => {
        const active = value === locale;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => onChange(locale)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              active
                ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="text-base leading-none">{flag}</span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
