"use client";

import { useState } from "react";
import Link from "next/link";
import { getTranslations } from "@/i18n";

export default function RecoveryPage() {
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Use default locale for login pages (before user is authenticated)
  const tr = getTranslations("fr");
  const l = tr.admin.recovery;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, code }),
      });
      if (res.ok) {
        window.location.href = "/admin/profile?changePassword=true";
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? l.invalidCode);
    } catch {
      setError(l.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-card rounded-2xl shadow-lg p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">{l.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{l.subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground" htmlFor="identifier">{l.identifierLabel}</label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground" htmlFor="code">{l.codeLabel}</label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                required
                placeholder="a1b2-c3d4-e5f6-a7b8"
                autoComplete="off"
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading ? "…" : l.submit}
            </button>
          </form>

          <div className="text-center">
            <Link href="/admin/login" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              ← {l.backToLogin}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
