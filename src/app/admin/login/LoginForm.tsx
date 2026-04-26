"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { getTranslations } from "@/i18n";
import type { AdminBrandingConfig } from "@/types/config";

interface Props {
  next: string;
  locale?: string | null;
  branding?: AdminBrandingConfig | null;
}

export function LoginForm({ next, locale, branding }: Props) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const tr = getTranslations(locale);
  const l = tr.admin.login;

  const appName = branding?.appName || "Admin";
  // Login page has a light background — prefer light logo
  const logoUrl = branding?.logoLightUrl || branding?.logoUrl;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.mustChangePassword) {
          window.location.href = "/admin/profile?changePassword=true";
        } else {
          window.location.href = next;
        }
        return;
      }

      let message = l.invalidCredentials;
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {
        // keep default
      }
      setError(message);
    } catch {
      setError(l.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-card rounded-2xl shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={appName}
                  width={64}
                  height={64}
                  unoptimized
                  style={{ maxHeight: "64px", width: "auto" }}
                />
              ) : (
                <Image
                  src="/formellia-logo-transparent.png"
                  alt={appName}
                  width={64}
                  height={64}
                  style={{ height: "auto" }}
                />
              )}
            </div>
            <h1 className="text-2xl font-bold text-foreground">{appName}</h1>
            <p className="text-muted-foreground text-sm mt-1">{l.subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              id="identifier"
              type="text"
              label={l.identifierLabel}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={l.identifierPlaceholder}
              required
              autoComplete="username"
            />
            <FormField
              id="password"
              type="password"
              label={l.passwordLabel}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              {l.submit}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Link href="/admin/recovery" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {l.useRecoveryCode}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
