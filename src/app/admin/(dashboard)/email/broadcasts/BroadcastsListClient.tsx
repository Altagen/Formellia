"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Plus, AlertTriangle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EmailBroadcast } from "@/lib/db/schema";
import type { GlobalEmailConfig } from "@/lib/email/globalEmailConfig";
import { useTranslations } from "@/lib/context/LocaleContext";

interface PoolOpt { id: string; name: string; slug: string }

interface Props {
  initialBroadcasts: EmailBroadcast[];
  pools:             PoolOpt[];
  providerConfig:    GlobalEmailConfig;
}

const STATUS_BADGE_CLS: Record<string, string> = {
  draft:   "bg-muted text-muted-foreground",
  sending: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100",
  sent:    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100",
  failed:  "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-100",
};

export function BroadcastsListClient({ initialBroadcasts, pools, providerConfig }: Props) {
  const router = useRouter();
  const t = useTranslations().admin.email;
  const [broadcasts] = useState(initialBroadcasts);
  const [creating, setCreating] = useState(false);

  // Operator still needs the provider; pools are now optional because the
  // composer accepts ad-hoc addresses on top of (or instead of) DataPools.
  const noPools = pools.length === 0;
  const noProvider = !providerConfig.provider || !providerConfig.fromAddress || !providerConfig.apiKeyConfigured;

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
          <Link href="/admin/email/provider">
            <Button variant="outline" size="sm">
              <Settings2 className="w-4 h-4 mr-1" /> {t.provider.title}
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
                    {t.list.configNoProvider} <Link href="/admin/email/provider" className="underline">{t.list.configNoProviderLink}</Link> {t.list.configNoProviderSuffix}
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 font-medium">{t.list.colName}</th>
              <th className="text-left px-3 py-2 font-medium">{t.list.colSubject}</th>
              <th className="text-left px-3 py-2 font-medium">{t.list.colDataPools}</th>
              <th className="text-left px-3 py-2 font-medium">{t.list.colStatus}</th>
              <th className="text-left px-3 py-2 font-medium">{t.list.colRecipients}</th>
              <th className="text-left px-3 py-2 font-medium">{t.list.colCreated}</th>
            </tr>
          </thead>
          <tbody>
            {broadcasts.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">{t.list.emptyState}</td></tr>
            ) : broadcasts.map(b => (
              <tr key={b.id} className="border-b border-border/40 last:border-0 hover:bg-accent/20">
                <td className="px-3 py-2">
                  <Link href={`/admin/email/broadcasts/${b.id}`} className="text-foreground hover:underline">
                    {b.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground max-w-[300px] truncate">{b.subject || <span className="italic">—</span>}</td>
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
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
