import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { submissions, formInstances } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { GlobalCharts } from "@/components/dashboard/GlobalCharts";
import { getFormConfig } from "@/lib/config";
import { getTranslations } from "@/i18n";

export default async function GlobalDashboardPage() {
  const config = await getFormConfig();
  if (!config.admin.features?.globalView) notFound();
  // All submissions with form instance name
  const [allSubs, allInstances, recentRows] = await Promise.all([
    db.select().from(submissions),

    db.select({
      id: formInstances.id,
      name: formInstances.name,
      slug: formInstances.slug,
    }).from(formInstances),

    db.select({
      id: submissions.id,
      email: submissions.email,
      status: submissions.status,
      submittedAt: submissions.submittedAt,
      formInstanceId: submissions.formInstanceId,
    })
      .from(submissions)
      .orderBy(desc(submissions.submittedAt))
      .limit(15),
  ]);

  const instanceMap = new Map(allInstances.map(i => [i.id, i]));

  // Total stats
  const total = allSubs.length;
  const pending = allSubs.filter(s => s.status === "pending").length;
  const inProgress = allSubs.filter(s => s.status === "in_progress").length;
  const done = allSubs.filter(s => s.status === "done").length;

  // Per-form breakdown
  type FormStat = { name: string; slug: string; total: number; pending: number; inProgress: number; done: number };
  const formStats = new Map<string, FormStat>();

  // Add all known instances (even with 0 submissions)
  for (const inst of allInstances) {
    formStats.set(inst.id, { name: inst.name, slug: inst.slug, total: 0, pending: 0, inProgress: 0, done: 0 });
  }
  const tr = getTranslations(config.locale);
  const g = tr.admin.globalView;

  // A synthetic bucket for orphan submissions (no formInstanceId)
  const ROOT_KEY = "__root__";
  const rootInst = allInstances.find(i => i.slug === "/");

  for (const sub of allSubs) {
    const key = sub.formInstanceId ?? (rootInst ? rootInst.id : ROOT_KEY);
    let stat = formStats.get(key);
    if (!stat) {
      stat = { name: g.unknownForm, slug: "?", total: 0, pending: 0, inProgress: 0, done: 0 };
      formStats.set(key, stat);
    }
    stat.total++;
    if (sub.status === "pending") stat.pending++;
    if (sub.status === "in_progress") stat.inProgress++;
    if (sub.status === "done") stat.done++;
  }

  const formRows = [...formStats.values()].sort((a, b) => b.total - a.total);

  const STATUS_LABELS: Record<string, string> = {
    pending: tr.status.pending,
    in_progress: tr.status.in_progress,
    done: tr.status.done,
    waiting_user: tr.status.waiting_user,
  };
  const STATUS_COLORS: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    in_progress: "bg-blue-100 text-blue-700",
    done: "bg-green-100 text-green-700",
    waiting_user: "bg-amber-100 text-amber-700",
  };

  const fmt = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">{g.title}</h1>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: g.total, value: total, color: "text-foreground" },
          { label: g.pending, value: pending, color: "text-muted-foreground" },
          { label: g.inProgress, value: inProgress, color: "text-blue-600" },
          { label: g.done, value: done, color: "text-green-600" },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Per-form breakdown */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">{g.perForm}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="px-5 py-3 font-medium">{g.formColumn}</th>
                <th className="px-5 py-3 font-medium text-right">{g.total}</th>
                <th className="px-5 py-3 font-medium text-right">{g.pending}</th>
                <th className="px-5 py-3 font-medium text-right">{g.inProgress}</th>
                <th className="px-5 py-3 font-medium text-right">{g.done}</th>
              </tr>
            </thead>
            <tbody>
              {formRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground text-sm">
                    {g.noForms}
                  </td>
                </tr>
              ) : (
                formRows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground">{row.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {row.slug === "/" ? "/" : `/${row.slug}`}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-foreground">{row.total}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{row.pending}</td>
                    <td className="px-5 py-3 text-right text-blue-600">{row.inProgress}</td>
                    <td className="px-5 py-3 text-right text-green-600">{row.done}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      <GlobalCharts submissions={allSubs} />

      {/* Recent submissions */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">{g.recentTitle}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="px-5 py-3 font-medium">{tr.admin.table.columns.email}</th>
                <th className="px-5 py-3 font-medium">{g.formColumn}</th>
                <th className="px-5 py-3 font-medium">{g.statusColumn}</th>
                <th className="px-5 py-3 font-medium hidden sm:table-cell">{g.submittedColumn}</th>
              </tr>
            </thead>
            <tbody>
              {recentRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground text-sm">
                    {tr.admin.table.empty}
                  </td>
                </tr>
              ) : (
                recentRows.map(sub => {
                  const inst = sub.formInstanceId ? instanceMap.get(sub.formInstanceId) : rootInst;
                  return (
                    <tr key={sub.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-foreground truncate max-w-[200px]">{sub.email}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {inst ? (
                          <span className="font-mono text-xs">{inst.slug === "/" ? "/" : `/${inst.slug}`}</span>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[sub.status ?? "pending"] ?? "bg-muted text-muted-foreground"}`}>
                          {STATUS_LABELS[sub.status ?? "pending"] ?? sub.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground hidden sm:table-cell">
                        {fmt.format(new Date(sub.submittedAt))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
