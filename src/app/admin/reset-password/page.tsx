"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PasswordStrengthIndicator } from "@/components/ui/PasswordStrengthIndicator";
import { getTranslations } from "@/i18n";

export default function ResetPasswordPage() {
  const router = useRouter();
  // locale not available outside dashboard layout — default to fr
  const tr = getTranslations(null);
  const r = tr.admin.resetPassword;

  const [token, setToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    setToken(params.get("token") ?? "");
  }, []);

  if (token === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="h-48 w-full max-w-sm bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-5 text-sm text-destructive">
          {r.invalidLink}
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirm) {
      setError(r.errorMismatch);
      return;
    }
    if (newPassword.length < 8) {
      setError(r.errorMinLength);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? r.errorReset);
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/admin/login"), 3000);
    } catch {
      setError(r.networkError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{r.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{r.subtitle}</p>
        </div>

        {success ? (
          <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 px-6 py-5 text-sm text-green-700 dark:text-green-300 space-y-1">
            <p className="font-semibold">{r.successTitle}</p>
            <p>{r.successRedirect}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">{r.newPasswordLabel}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{r.newPasswordLabel}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={8}
                  autoFocus
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
                />
                <PasswordStrengthIndicator password={newPassword} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{r.confirmPasswordLabel}</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
                />
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {saving ? r.saving : r.submit}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
