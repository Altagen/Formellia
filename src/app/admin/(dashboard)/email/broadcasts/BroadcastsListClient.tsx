"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Plus, AlertTriangle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EmailBroadcast } from "@/lib/db/schema";
import type { EmailProviderSafe } from "@/lib/email/providers";
import { useTranslations } from "@/lib/context/LocaleContext";

interface PoolOpt { id: string; name: string; slug: string }

interface Props {
  initialBroadcasts: EmailBroadcast[];
  pools:             PoolOpt[];
  providers:         EmailProviderSafe[];
}

const STATUS_BADGE_CLS: Record<string, string> = {
  draft:   "bg-muted text-muted-foreground",
  sending: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100",
  sent:    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100",
  failed:  "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-100",
};

export function BroadcastsListClient({ initialBroadcasts, pools, providers }: Props) {
  const router = useRouter();
  const t = useTranslations().admin.email;
  const [broadcasts] = useState(initialBroadcasts);
  const [creating, setCreating] = useState(false);

  // Operator still needs a provider preset; pools are optional because the
  // composer accepts ad-hoc addresses on top of (or instead of) DataPools.
  const noPools    = pools.length === 0;
  const noProvider = providers.length === 0;
  const defaultProvider = providers.find(p => p.isDefault) ?? null;

  /**
   * Resolve which preset a given broadcast will actually use at send time.
   * Mirrors `executeBroadcast`: explicit providerId wins, otherwise fall back
   * to the row marked `is_default`. Returns null when nothing resolves so the
   * caller can render an "unset" indicator instead of a stale preset name.
   */
  function resolveProviderFor(b: EmailBroadcast): { label: string; explicit: boolean } | null {
    if (b.providerId) {
      const explicit = providers.find(p => p.id === b.providerId);
      if (explicit) return { label: explicit.name, explicit: true };
    }
    if (defaultProvider) return { label: defaultProvider.name, explicit: false };
    return null;
  }

  async function createDraft() {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/email/broadcasts", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:        t.list.defaultDraftName.replace("{date}", new Date().toLocaleDateString()),
          subject:     "",
          bodyHtml:    "",
          bodyText:    "",
          // Pre-select the first pool when there is one — saves the operator
          // a click in the common case. An empty list is fine; the composer
          // surfaces the manual-addresses input either way.
          dataPoolIds: pools.length > 0 ? [pools[0].id] : [],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const row = (await res.json()) as EmailBroadcast;
      router.push(`/admin/email/broadcasts/${row.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.list.createFailed);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Mail className="w-6 h-6" /> {t.list.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t.list.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Always-visible escape hatch into the provider config. Without
              this the operator can only get there via the warning banner
              below — which disappears as soon as the provider is set. */}
          <Link href="/admin/configuration?tab=emails">
            <Button variant="outline" size="sm" className="gap-1">
              <Settings2 className="w-4 h-4" />
              {t.provider.title}
              {defaultProvider && (
                <span className="ml-1 hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 uppercase tracking-wider font-semibold">
                  {defaultProvider.name}
                </span>
              )}
            </Button>
          </Link>
          <Button onClick={createDraft} disabled={creating || noProvider}>
            <Plus className="w-4 h-4 mr-1" /> {creating ? "…" : t.list.newDraft}
          </Button>
        </div>
      </div>

      {/* Only the provider is a hard pre-requisite now — pools are merely a
          quality-of-life shortcut over typing addresses by hand. We still
          surface the "no pools" line as informative, not blocking. */}
      {(noPools || noProvider) && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
            <div className="space-y-2">
              <p className="font-medium">{t.list.configRequired}</p>
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                {noPools && (
                  <li>
                    {t.list.configNoDataPools} <Link href="/admin/datapools" className="underline">{t.list.configNoDataPoolsLink}</Link> {t.list.configNoDataPoolsSuffix}
                  </li>
                )}
                {noProvider && (
                  <li>
                    {t.list.configNoProvider} <Link href="/admin/configuration?tab=emails" className="underline">{t.list.configNoProviderLink}</Link> {t.list.configNoProviderSuffix}
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block border border-border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 font-medium">{t.list.colName}</th>
              <th className="text-left px-3 py-2 font-medium">{t.list.colSubject}</th>
              <th className="text-left px-3 py-2 font-medium">{t.list.colProvider}</th>
              <th className="text-left px-3 py-2 font-medium">{t.list.colDataPools}</th>
              <th className="text-left px-3 py-2 font-medium">{t.list.colStatus}</th>
              <th className="text-left px-3 py-2 font-medium">{t.list.colRecipients}</th>
              <th className="text-left px-3 py-2 font-medium">{t.list.colCreated}</th>
            </tr>
          </thead>
          <tbody>
            {broadcasts.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">{t.list.emptyState}</td></tr>
            ) : broadcasts.map(b => {
              const prov = resolveProviderFor(b);
              return (
              <tr key={b.id} className="border-b border-border/40 last:border-0 hover:bg-accent/20">
                <td className="px-3 py-2">
                  <Link href={`/admin/email/broadcasts/${b.id}`} className="text-foreground hover:underline">
                    {b.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground max-w-[300px] truncate">{b.subject || <span className="italic">—</span>}</td>
                <td className="px-3 py-2 text-xs">
                  {prov ? (
                    <span className="inline-flex items-center gap-1">
                      <span>{prov.label}</span>
                      {!prov.explicit && (
                        <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wider">
                          {t.list.providerImplicit}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 italic">{t.list.providerUnset}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{b.dataPoolIds.length}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block text-xs px-2 py-0.5 rounded ${STATUS_BADGE_CLS[b.status] ?? STATUS_BADGE_CLS.draft}`}>
                    {b.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {b.status === "sent" ? `${b.sentCount} / ${b.recipientCount}` : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {broadcasts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t.list.emptyState}
          </div>
        ) : broadcasts.map(b => {
          const prov = resolveProviderFor(b);
          return (
          <Link
            key={b.id}
            href={`/admin/email/broadcasts/${b.id}`}
            className="block rounded-lg border border-border bg-card p-3 hover:bg-accent/20 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <p className="text-sm font-semibold text-foreground truncate flex-1">{b.name}</p>
              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE_CLS[b.status] ?? STATUS_BADGE_CLS.draft}`}>
                {b.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate mb-1">
              {b.subject || <span className="italic">—</span>}
            </p>
            <p className="text-[11px] text-muted-foreground mb-1.5">
              {prov ? (
                <>
                  {t.list.providerCardPrefix} <span className="text-foreground font-medium">{prov.label}</span>
                  {!prov.explicit && <span className="text-muted-foreground/70"> · {t.list.providerImplicit}</span>}
                </>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">{t.list.providerUnset}</span>
              )}
            </p>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>{b.dataPoolIds.length} {t.list.colDataPools}</span>
              {b.status === "sent" && <span>· {b.sentCount}/{b.recipientCount}</span>}
              <span className="ml-auto">{new Date(b.createdAt).toLocaleDateString()}</span>
            </div>
          </Link>
          );
        })}
      </div>

    </div>
  );
}
