"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PasswordStrengthIndicator } from "@/components/ui/PasswordStrengthIndicator";
import { useTranslations } from "@/lib/context/LocaleContext";

export function CreateUserForm({ onCreated }: { onCreated?: (user: { id: string; username: string; email: string | null }) => void } = {}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const tr = useTranslations();
  const c = tr.admin.createUser;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email: email || undefined, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? c.errorCreate);
        return;
      }

      toast.success(c.successCreated.replace("{username}", username));
      if (onCreated) {
        onCreated({ id: data.id, username, email: email || null });
      }
      setUsername("");
      setEmail("");
      setPassword("");
      if (!onCreated) {
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch {
      toast.error(c.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium text-foreground block mb-1">{c.usernameLabel}</label>
        <input
          type="text"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={c.usernamePlaceholder}
          pattern="[a-zA-Z0-9_\-]{3,50}"
          title={c.usernameHint}
          autoComplete="username"
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground mt-1">{c.usernameHint}</p>
      </div>
      <div>
        <label className="text-sm font-medium text-foreground block mb-1">{c.emailLabel}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
          autoComplete="email"
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground block mb-1">{c.passwordLabel}</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={c.passwordPlaceholder}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
        <PasswordStrengthIndicator password={password} />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
      >
        {loading ? c.creating : c.create}
      </button>
    </form>
  );
}
