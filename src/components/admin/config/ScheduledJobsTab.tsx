"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Play, Trash2, Plus, Clock, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type JobAction = "retention_cleanup" | "export_json" | "export_csv" | "export_backup" | "dataset_poll";

interface JobRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "ok" | "error" | "running";
  result: Record<string, unknown> | null;
  error: string | null;
}

interface ScheduledJob {
  id: string;
  name: string;
  action: JobAction;
  config: Record<string, unknown>;
  schedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: "ok" | "error" | "running" | null;
  lastError: string | null;
  createdAt: string;
  recentRuns?: JobRun[];
}

interface ApiDataset {
  id: string;
  name: string;
  sourceType: string;
}

interface ApiFormInstance {
  id: string;
  name: string;
  slug: string;
}

const fmt = new Intl.DateTimeFormat(undefined, {
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});

function formatDate(d: string | null) {
  if (!d) return "—";
  return fmt.format(new Date(d));
}

interface StatusBadgeProps {
  status: "ok" | "error" | "running" | null;
  labels: { never: string; ok: string; error: string; running: string };
}

function StatusBadge({ status, labels }: StatusBadgeProps) {
  if (!status) return <span className="text-muted-foreground text-xs">{labels.never}</span>;
  const map = {
    ok:      "text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800",
    error:   "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800",
    running: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800",
  };
  const textLabels = { ok: labels.ok, error: labels.error, running: labels.running };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${map[status]}`}>
      {status === "ok" && <CheckCircle2 className="w-3 h-3" />}
      {status === "error" && <XCircle className="w-3 h-3" />}
      {status === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
      {textLabels[status]}
    </span>
  );
}

// ── Recurrence picker ─────────────────────────────────────────────────────────

type RecurrenceMode = "hourly" | "daily" | "weekly" | "monthly" | "custom";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const WEEKDAY_CRON = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 } as const;

function detectMode(cron: string): RecurrenceMode {
  if (/^0 \*\/\d+ \* \* \*$/.test(cron)) return "hourly";
  if (/^\d+ \d+ \* \* \*$/.test(cron)) return "daily";
  if (/^\d+ \d+ \* \* [\d,]+$/.test(cron)) return "weekly";
  if (/^\d+ \d+ \d+ \* \*$/.test(cron)) return "monthly";
  return "custom";
}

function parseCronTime(cron: string): { hour: number; minute: number } {
  const parts = cron.split(" ");
  return { hour: parseInt(parts[1]) || 0, minute: parseInt(parts[0]) || 0 };
}

interface RecurrencePickerProps {
  value: string;
  onChange: (cron: string) => void;
  j: ReturnType<typeof useTranslations>["admin"]["config"]["jobs"];
}

function RecurrencePicker({ value, onChange, j }: RecurrencePickerProps) {
  const [mode, setMode] = useState<RecurrenceMode>(() => detectMode(value));
  const [hour, setHour] = useState(() => parseCronTime(value).hour);
  const [minute, setMinute] = useState(() => parseCronTime(value).minute);
  const [nHours, setNHours] = useState(() => {
    const m = value.match(/^0 \*\/(\d+) \* \* \*$/);
    return m ? parseInt(m[1]) : 6;
  });
  const [days, setDays] = useState<Set<number>>(() => {
    const m = value.match(/^\d+ \d+ \* \* ([\d,]+)$/);
    if (!m) return new Set([1]);
    return new Set(m[1].split(",").map(Number));
  });
  const [dayOfMonth, setDayOfMonth] = useState(() => {
    const m = value.match(/^\d+ \d+ (\d+) \* \*$/);
    return m ? parseInt(m[1]) : 1;
  });
  const [custom, setCustom] = useState(value);

  function buildCron(
    m: RecurrenceMode,
    h = hour, min = minute, n = nHours,
    d = days, dom = dayOfMonth, c = custom,
  ): string {
    switch (m) {
      case "hourly":  return `0 */${n} * * *`;
      case "daily":   return `${min} ${h} * * *`;
      case "weekly":  return `${min} ${h} * * ${Array.from(d).sort().join(",")}`;
      case "monthly": return `${min} ${h} ${dom} * *`;
      case "custom":  return c;
    }
  }

  function emit(updates: Partial<{ m: RecurrenceMode; h: number; min: number; n: number; d: Set<number>; dom: number; c: string }>) {
    const m = updates.m ?? mode;
    const h = updates.h ?? hour;
    const min = updates.min ?? minute;
    const n = updates.n ?? nHours;
    const d = updates.d ?? days;
    const dom = updates.dom ?? dayOfMonth;
    const c = updates.c ?? custom;
    onChange(buildCron(m, h, min, n, d, dom, c));
  }

  function handleModeChange(newMode: RecurrenceMode) {
    setMode(newMode);
    emit({ m: newMode });
  }

  function toggleDay(cronDay: number) {
    const next = new Set(days);
    if (next.has(cronDay)) { if (next.size > 1) next.delete(cronDay); }
    else next.add(cronDay);
    setDays(next);
    emit({ d: next });
  }

  const cronExpr = buildCron(mode);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">{j.recurrenceMode}</label>
        <div className="relative">
          <select
            value={mode}
            onChange={e => handleModeChange(e.target.value as RecurrenceMode)}
            className="appearance-none h-9 w-full px-3 pr-8 text-sm border border-input rounded-md bg-transparent dark:bg-input/30 focus:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="hourly">{j.modeHourly}</option>
            <option value="daily">{j.modeDaily}</option>
            <option value="weekly">{j.modeWeekly}</option>
            <option value="monthly">{j.modeMonthly}</option>
            <option value="custom">{j.modeCustom}</option>
          </select>
          <ChevronsUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {mode === "hourly" && (
        <div className="flex items-center gap-2">
          <div className="relative w-24">
            <select
              value={nHours}
              onChange={e => { const n = parseInt(e.target.value); setNHours(n); emit({ n }); }}
              className="appearance-none h-9 w-full px-3 pr-7 text-sm border border-input rounded-md bg-transparent dark:bg-input/30 focus:outline-none focus-visible:border-ring"
            >
              {[1,2,3,4,6,8,12].map(n => <option key={n} value={n}>{n}h</option>)}
            </select>
            <ChevronsUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>
          <span className="text-xs text-muted-foreground">{j.everyHours.replace("{n}", String(nHours))}</span>
        </div>
      )}

      {(mode === "daily" || mode === "weekly" || mode === "monthly") && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">{j.atHour}</span>
          <input
            type="number" min={0} max={23} value={hour}
            onChange={e => { const h = Math.max(0, Math.min(23, parseInt(e.target.value) || 0)); setHour(h); emit({ h }); }}
            className="h-9 w-16 px-3 text-sm border border-input rounded-md bg-transparent dark:bg-input/30 focus:outline-none focus-visible:border-ring text-center"
          />
          <span className="text-xs text-muted-foreground">:</span>
          <input
            type="number" min={0} max={59} value={minute}
            onChange={e => { const min = Math.max(0, Math.min(59, parseInt(e.target.value) || 0)); setMinute(min); emit({ min }); }}
            className="h-9 w-16 px-3 text-sm border border-input rounded-md bg-transparent dark:bg-input/30 focus:outline-none focus-visible:border-ring text-center"
          />
        </div>
      )}

      {mode === "weekly" && (
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map(d => {
            const cronDay = WEEKDAY_CRON[d];
            const active = days.has(cronDay);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(cronDay)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {j.days[d]}
              </button>
            );
          })}
        </div>
      )}

      {mode === "monthly" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">{j.dayOfMonth.replace("{n}", String(dayOfMonth))}</span>
          <input
            type="number" min={1} max={28} value={dayOfMonth}
            onChange={e => { const dom = Math.max(1, Math.min(28, parseInt(e.target.value) || 1)); setDayOfMonth(dom); emit({ dom }); }}
            className="h-9 w-16 px-3 text-sm border border-input rounded-md bg-transparent dark:bg-input/30 focus:outline-none focus-visible:border-ring text-center"
          />
        </div>
      )}

      {mode === "custom" && (
        <Input
          required
          value={custom}
          onChange={e => { setCustom(e.target.value); emit({ c: e.target.value }); }}
          className="font-mono"
          placeholder="0 2 * * *"
        />
      )}

      {mode !== "custom" && (
        <p className="text-xs text-muted-foreground font-mono">
          {j.cronPreview}: <span className="text-foreground">{cronExpr}</span>
        </p>
      )}
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────

interface CreateJobModalProps {
  onClose: () => void;
  onCreated: (job: ScheduledJob) => void;
  actionLabels: Record<JobAction, string>;
  j: ReturnType<typeof useTranslations>["admin"]["config"]["jobs"];
}

function CreateJobModal({ onClose, onCreated, actionLabels, j }: CreateJobModalProps) {
  const [name, setName] = useState("");
  const [action, setAction] = useState<JobAction>("export_json");
  const [schedule, setSchedule] = useState("0 2 * * *");
  const [enabled, setEnabled] = useState(false);
  const [olderThanDays, setOlderThanDays] = useState("90");
  const [formSlug, setFormSlug] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [apiDatasets, setApiDatasets] = useState<ApiDataset[]>([]);
  const [apiFormInstances, setApiFormInstances] = useState<ApiFormInstance[]>([]);
  const [saving, setSaving] = useState(false);

  const needsFormSelect = action === "retention_cleanup" || action === "export_json" || action === "export_csv" || action === "export_backup";

  // Fetch form list on mount — needed by most actions, cheap to load upfront
  useEffect(() => {
    fetch("/api/admin/forms")
      .then(r => r.json())
      .then((data: ApiFormInstance[]) => setApiFormInstances(data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (action !== "dataset_poll") return;
    fetch("/api/admin/datasets")
      .then(r => r.json())
      .then((data: ApiDataset[]) => setApiDatasets((data ?? []).filter(d => d.sourceType === "api")))
      .catch(() => {});
  }, [action]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const config: Record<string, unknown> = {};
      if (action === "retention_cleanup") {
        config.olderThanDays = parseInt(olderThanDays) || 90;
        if (formSlug) config.formSlug = formSlug;
      } else if (action === "dataset_poll") {
        config.datasetId = datasetId;
      } else {
        if (formSlug) config.formSlug = formSlug;
      }

      const res = await fetch("/api/admin/scheduled-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, action, config, schedule, enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? j.networkError);
        return;
      }
      toast.success(j.toastCreated);
      onCreated(data);
    } catch {
      toast.error(j.networkError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">{j.modalCreate}</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{j.name}</label>
            <Input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={j.namePlaceholder}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{j.action}</label>
            <div className="relative">
              <select
                value={action}
                onChange={e => setAction(e.target.value as JobAction)}
                className="appearance-none h-9 w-full px-3 pr-8 text-sm border border-input rounded-md bg-transparent dark:bg-input/30 focus:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {(Object.entries(actionLabels) as [JobAction, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <ChevronsUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              {action === "retention_cleanup" && j.actionDescRetention}
              {action === "export_json"       && j.actionDescJson}
              {action === "export_csv"        && j.actionDescCsv}
              {action === "export_backup"     && j.actionDescBackup}
              {action === "dataset_poll"      && j.actionDescDataset}
            </p>
          </div>

          <RecurrencePicker value={schedule} onChange={setSchedule} j={j} />

          {action === "retention_cleanup" && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{j.retentionDays}</label>
              <Input
                type="number"
                min="1"
                value={olderThanDays}
                onChange={e => setOlderThanDays(e.target.value)}
              />
            </div>
          )}

          {needsFormSelect && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{j.formOptional}</label>
              <div className="relative">
                <select
                  value={formSlug}
                  onChange={e => setFormSlug(e.target.value)}
                  className="appearance-none h-9 w-full px-3 pr-8 text-sm border border-input rounded-md bg-transparent dark:bg-input/30 focus:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">{j.formAllOption}</option>
                  {apiFormInstances.map(f => (
                    <option key={f.id} value={f.slug}>{f.name}</option>
                  ))}
                </select>
                <ChevronsUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}

          {action === "dataset_poll" && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{j.datasetLabel}</label>
              {apiDatasets.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">{j.datasetNoneApi}</p>
              ) : (
                <div className="relative">
                  <select
                    required
                    value={datasetId}
                    onChange={e => setDatasetId(e.target.value)}
                    className="appearance-none h-9 w-full px-3 pr-8 text-sm border border-input rounded-md bg-transparent dark:bg-input/30 focus:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <option value="">{j.datasetPlaceholder}</option>
                    {apiDatasets.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <ChevronsUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm text-foreground">{j.enableNow}</span>
          </label>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors">
              {j.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? j.creating : j.create}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Job row ───────────────────────────────────────────────────────────────────

interface JobRowProps {
  job: ScheduledJob;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onRunNow: (id: string) => void;
  actionLabels: Record<JobAction, string>;
  statusLabels: { never: string; ok: string; error: string; running: string };
  j: ReturnType<typeof useTranslations>["admin"]["config"]["jobs"];
}

function JobRow({ job, onToggle, onDelete, onRunNow, actionLabels, statusLabels, j }: JobRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [runs, setRuns] = useState<JobRun[] | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [running, setRunning] = useState(false);

  const isRunning = job.lastStatus === "running";

  async function loadRuns() {
    if (runs) return;
    setLoadingRuns(true);
    try {
      const res = await fetch(`/api/admin/scheduled-jobs/${job.id}`);
      const data = await res.json();
      setRuns(data.recentRuns ?? []);
    } catch {
      setRuns([]);
    } finally {
      setLoadingRuns(false);
    }
  }

  function toggleExpanded() {
    const next = !expanded;
    if (next) loadRuns();
    setExpanded(next);
  }

  async function handleRunNow() {
    setRunning(true);
    try {
      const res = await fetch(`/api/admin/scheduled-jobs/${job.id}/run`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(j.toastRun);
        onRunNow(job.id);
        setRuns(null);
      } else {
        toast.error(data.error ?? j.networkError);
      }
    } catch {
      toast.error(j.networkError);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${isRunning ? "border-blue-400 dark:border-blue-600 shadow-sm shadow-blue-100 dark:shadow-blue-900/30" : "border-border"}`}>
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Toggle with running pulse */}
        <div className={`shrink-0 ${isRunning ? "animate-pulse" : ""}`}>
          <button
            onClick={() => onToggle(job.id, !job.enabled)}
            className={`relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors ${
              job.enabled ? "bg-primary" : "bg-muted"
            }`}
            title={job.enabled ? j.tooltipDisable : j.tooltipEnable}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${job.enabled ? "translate-x-4" : "translate-x-0"}`} />
          </button>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-foreground">{job.name}</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {actionLabels[job.action] ?? job.action}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {job.schedule}
            </span>
            <StatusBadge status={job.lastStatus} labels={statusLabels} />
            {job.lastRunAt && (
              <span className="text-xs text-muted-foreground">
                {j.lastRunLabel.replace("{date}", formatDate(job.lastRunAt))}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleRunNow}
            disabled={running || isRunning}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
            title={j.tooltipRun}
          >
            {(running || isRunning) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onDelete(job.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors text-muted-foreground"
            title={j.tooltipDelete}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={toggleExpanded}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            title={j.tooltipHistory}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded history */}
      {expanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{j.last10}</p>
          {loadingRuns && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> {j.loading}
            </div>
          )}
          {!loadingRuns && runs && runs.length === 0 && (
            <p className="text-sm text-muted-foreground">{j.noRuns}</p>
          )}
          {!loadingRuns && runs && runs.length > 0 && (
            <div className="space-y-1">
              {runs.map(run => (
                <div key={run.id} className="flex items-center gap-3 text-xs">
                  <StatusBadge status={run.status} labels={statusLabels} />
                  <span className="text-muted-foreground">{formatDate(run.startedAt)}</span>
                  {run.completedAt && (
                    <span className="text-muted-foreground">
                      {Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s
                    </span>
                  )}
                  {run.result && (
                    <span className="text-muted-foreground font-mono truncate max-w-[200px]">
                      {JSON.stringify(run.result)}
                    </span>
                  )}
                  {run.error && (
                    <span className="text-red-500 truncate max-w-[200px]">{run.error}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {job.lastError && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-0.5">{j.lastError}</p>
              <p className="text-xs text-red-600 dark:text-red-400 font-mono">{job.lastError}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function ScheduledJobsTab() {
  const tr = useTranslations();
  const j = tr.admin.config.jobs;

  const ACTION_LABELS: Record<JobAction, string> = {
    retention_cleanup: j.actionRetention,
    export_json:       j.actionJson,
    export_csv:        j.actionCsv,
    export_backup:     j.actionBackup,
    dataset_poll:      j.actionDatasetPoll,
  };

  const STATUS_LABELS = {
    never:   j.statusNever,
    ok:      j.statusOk,
    error:   j.statusError,
    running: j.statusRunning,
  };

  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; description: string; onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/scheduled-jobs");
      if (res.ok) setJobs(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Poll every 3s while any job is running to show live animation
  const hasRunning = jobs.some(job => job.lastStatus === "running");
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(loadJobs, 3000);
    return () => clearInterval(id);
  }, [hasRunning, loadJobs]);

  async function handleToggle(id: string, enabled: boolean) {
    const res = await fetch(`/api/admin/scheduled-jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) {
      setJobs(prev => prev.map(job => job.id === id ? { ...job, enabled } : job));
      toast.success(enabled ? j.toastEnabled : j.toastDisabled);
    } else {
      toast.error(j.networkError);
    }
  }

  function handleDelete(id: string) {
    setConfirmDialog({
      open: true,
      title: j.deleteTitle,
      description: j.deleteConfirm,
      onConfirm: async () => {
        const res = await fetch(`/api/admin/scheduled-jobs/${id}`, { method: "DELETE" });
        if (res.ok) {
          setJobs(prev => prev.filter(job => job.id !== id));
          toast.success(j.toastDeleted);
        } else {
          toast.error(j.networkError);
        }
      },
    });
  }

  function handleRunNow(id: string) {
    setJobs(prev => prev.map(job => job.id === id ? { ...job, lastRunAt: new Date().toISOString() } : job));
    setTimeout(loadJobs, 500);
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={j.confirmDelete}
        cancelLabel={j.confirmCancel}
        destructive
        onConfirm={confirmDialog.onConfirm}
        onOpenChange={open => setConfirmDialog(s => ({ ...s, open }))}
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{j.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{j.description}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          {j.newJob}
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> {j.loading}
        </div>
      )}

      {!loading && jobs.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">{j.empty}</p>
          <p className="text-xs text-muted-foreground mt-1">{j.emptyDesc}</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            {j.createFirst}
          </button>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map(job => (
            <JobRow
              key={job.id}
              job={job}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onRunNow={handleRunNow}
              actionLabels={ACTION_LABELS}
              statusLabels={STATUS_LABELS}
              j={j}
            />
          ))}
        </div>
      )}

      {!loading && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-medium text-foreground mb-1">{j.howTitle}</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>{j.howDesc}</li>
            <li><strong>{j.howJson}</strong></li>
            <li><strong>{j.howRetention}</strong></li>
            <li>{j.howServer}</li>
          </ul>
        </div>
      )}

      {showCreate && (
        <CreateJobModal
          onClose={() => setShowCreate(false)}
          onCreated={job => {
            setJobs(prev => [job, ...prev]);
            setShowCreate(false);
          }}
          actionLabels={ACTION_LABELS}
          j={j}
        />
      )}
    </div>
  );
}
