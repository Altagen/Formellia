"use client";

import { useState, useEffect } from "react";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { getTranslations } from "@/i18n";

interface Props {
  next: string;
  locale?: string | null;
}

interface PolicyInfo {
  enforced: boolean;
  rules: string[];
}

export function FirstSetupForm({ next, locale }: Props) {
  const [username, setUsername] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [policy, setPolicy]     = useState<PolicyInfo>({ enforced: false, rules: [] });

  const tr = getTranslations(locale);
  const s = tr.admin.setup;

  useEffect(() => {
    fetch("/api/admin/setup/policy")
      .then(r => r.json())
      .then((data: PolicyInfo) => setPolicy(data))
      .catch(() => {/* silent — policy unavailable, no enforcement shown */});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const createRes = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email: email || undefined, password }),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        setError(data.error ?? s.errorCreate);
        return;
      }

      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: username, password }),
      });

      if (!loginRes.ok) {
        setError(s.errorLogin);
        return;
      }

      window.location.href = next;
    } catch {
      setError(s.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-card rounded-2xl shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-foreground">{s.title}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {s.subtitle}<br />{s.subtitleLine2}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              id="username"
              type="text"
              label={s.usernameLabel}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={s.usernamePlaceholder}
              required
              autoComplete="username"
            />
            <FormField
              id="email"
              type="email"
              label={s.emailLabel}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="email"
            />
            <div>
              <FormField
                id="password"
                type="password"
                label={s.passwordLabel}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={policy.enforced ? s.passwordPlaceholderPolicy : s.passwordPlaceholderMin}
                required
                minLength={8}
                autoComplete="new-password"
              />
              {policy.enforced && policy.rules.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {policy.rules.map(rule => (
                    <li key={rule} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                      {rule}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              {s.submit}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-4">{s.disclaimer}</p>
        </div>
      </div>
    </div>
  );
}
