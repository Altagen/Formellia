"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "@/lib/context/LocaleContext";

interface SessionInfo {
  id: string;
  expiresAt: string;
  isCurrent: boolean;
}

export function ActiveSessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const tr = useTranslations();
  const s = tr.admin.sessions;

  useEffect(() => {
    fetch("/api/admin/account/sessions")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSessions(data); })
      .catch(() => toast.error(s.loadError))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function revokeSession(id: string) {
    setRevoking(id);
    try {
      const res = await fetch(`/api/admin/account/sessions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? s.errorGeneric); return; }
      setSessions(prev => prev.filter(sess => sess.id !== id));
      toast.success(s.revokeSuccess);
    } catch {
      toast.error(s.networkError);
    } finally {
      setRevoking(null);
    }
  }

  async function revokeAll() {
    setRevokingAll(true);
    try {
      const res = await fetch("/api/admin/account/sessions", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? s.errorGeneric); return; }
      setSessions(prev => prev.filter(sess => sess.isCurrent));
      toast.success(s.revokeAllSuccess);
    } catch {
      toast.error(s.networkError);
    } finally {
      setRevokingAll(false);
    }
  }

  const others = sessions.filter(sess => !sess.isCurrent);

  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground">{s.title}</h2>
        {others.length > 0 && (
          <button
            onClick={revokeAll}
            disabled={revokingAll}
            className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 font-medium cursor-pointer disabled:opacity-50 transition-colors"
          >
            {revokingAll ? s.revoking : s.revokeAll}
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{s.noSessions}</p>
      ) : (
        <ul className="divide-y divide-border">
          {sessions.map(session => (
            <li key={session.id} className="py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${session.isCurrent ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                <div className="min-w-0">
                  <p className="text-sm text-foreground font-mono truncate text-xs">{session.id.slice(0, 20)}…</p>
                  <p className="text-xs text-muted-foreground">
                    {s.expiresAt.replace("{date}", fmt.format(new Date(session.expiresAt)))}
                  </p>
                </div>
                {session.isCurrent && (
                  <span className="text-xs bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 px-2 py-0.5 rounded-full font-medium shrink-0">
                    {s.current}
                  </span>
                )}
              </div>
              {!session.isCurrent && (
                <button
                  onClick={() => revokeSession(session.id)}
                  disabled={revoking === session.id}
                  className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 font-medium cursor-pointer disabled:opacity-50 transition-colors shrink-0"
                >
                  {revoking === session.id ? "…" : s.revoke}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
