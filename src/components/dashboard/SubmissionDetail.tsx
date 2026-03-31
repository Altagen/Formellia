"use client";

import { useState, useEffect } from "react";
import type { Submission, SubmissionEvent } from "@/lib/db/schema";
import type { SubmissionStatus, SubmissionPriority, FormConfig, StepDef } from "@/types/config";
import { calcAutoPriority } from "@/lib/utils/priority";
import { usePrioritySettings } from "@/lib/context/PrioritySettingsContext";
import { useUserRole } from "@/lib/context/UserRoleContext";
import { useTranslations } from "@/lib/context/LocaleContext";

// Labels are built dynamically from translations inside the component

const PRIORITY_COLORS: Record<SubmissionPriority, string> = {
  none: "bg-gray-200",
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  orange: "bg-orange-500",
  red: "bg-red-500",
};


interface SubmissionDetailProps {
  submission: Submission;
  onClose: () => void;
  onSaved: (updated: Submission) => void;
  formConfig?: FormConfig;
  formSteps?: StepDef[];
}

export function SubmissionDetail({ submission, onClose, onSaved, formConfig: _formConfig, formSteps }: SubmissionDetailProps) {
  const [localSubmission, setLocalSubmission] = useState<Submission>(submission);
  const [status, setStatus] = useState<SubmissionStatus>((submission.status as SubmissionStatus) ?? "pending");
  const [priority, setPriority] = useState<SubmissionPriority>((submission.priority as SubmissionPriority) ?? "none");
  const [dateEcheance, setDateEcheance] = useState(submission.dateEcheance ?? "");
  const [notes, setNotes] = useState(submission.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<SubmissionEvent[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; email: string; role: string }>>([]);

  useEffect(() => {
    fetch(`/api/admin/submissions/${submission.id}/events`)
      .then((r) => r.ok ? r.json() : [])
      .then(setEvents)
      .catch(() => {});
  }, [submission.id]);

  useEffect(() => {
    fetch("/api/admin/users")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setUsers(data); })
      .catch(() => {});
  }, []);

  const role = useUserRole();
  const readOnly = role === "viewer";
  const tr = useTranslations();
  const STATUS_OPTIONS = [
    { value: "pending" as SubmissionStatus, label: tr.status.pending },
    { value: "in_progress" as SubmissionStatus, label: tr.status.in_progress },
    { value: "done" as SubmissionStatus, label: tr.status.done },
    { value: "waiting_user" as SubmissionStatus, label: tr.status.waiting_user },
  ];
  const PRIORITY_OPTIONS = [
    { value: "none" as SubmissionPriority, label: tr.priority.none, color: PRIORITY_COLORS.none },
    { value: "green" as SubmissionPriority, label: tr.priority.green, color: PRIORITY_COLORS.green },
    { value: "yellow" as SubmissionPriority, label: tr.priority.yellow, color: PRIORITY_COLORS.yellow },
    { value: "orange" as SubmissionPriority, label: tr.priority.orange, color: PRIORITY_COLORS.orange },
    { value: "red" as SubmissionPriority, label: tr.priority.red, color: PRIORITY_COLORS.red },
  ];
  const formData = submission.formData as Record<string, string>;
  const thresholds = usePrioritySettings();
  const autoResult = calcAutoPriority(submission.dateEcheance, thresholds);
  const isOverride = priority !== "none";
  const effectivePriority: SubmissionPriority = isOverride ? priority : autoResult.priority;

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/submissions/${submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, priority, dateEcheance: dateEcheance || null, notes: notes || null }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? tr.admin.detail.errorSave);
        return;
      }
      onSaved({ ...submission, status, priority, dateEcheance: dateEcheance || null, notes: notes || null });
      // Refresh audit trail
      fetch(`/api/admin/submissions/${submission.id}/events`)
        .then((r) => r.ok ? r.json() : [])
        .then(setEvents)
        .catch(() => {});
    } catch {
      setError(tr.admin.detail.networkError);
    } finally {
      setSaving(false);
    }
  }

  // Config as schema contract — or legacy fallback
  type FieldRow = { key: string; label: string; value: string | null };

  function buildFieldRows(): FieldRow[] {
    if (formSteps && formSteps.length > 0) {
      const rows: FieldRow[] = [];
      for (const step of formSteps) {
        for (const field of step.fields) {
          if (field.type === "section_header") continue;
          const key = field.dbKey ?? field.id;
          if (key === "email" || key === "dateEcheance") continue;
          const raw = formData[key] ?? null;
          let value = raw;
          if (raw !== null && field.options) {
            const opt = field.options.find((o) => o.value === raw);
            if (opt) value = opt.label;
          }
          rows.push({ key, label: field.label, value });
        }
      }
      return rows;
    }
    return Object.entries(formData).map(([key, val]) => ({
      key,
      label: key,
      value: val,
    }));
  }

  const fieldRows = buildFieldRows();

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 cursor-pointer" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-card shadow-xl h-full overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">{tr.admin.detail.title}</h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full border border-border">
              <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[effectivePriority]}`} />
              {isOverride ? tr.admin.detail.priorityManual : (autoResult.label || tr.admin.detail.noDeadline)}
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-6 py-4 space-y-6">
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{tr.admin.detail.contact}</h3>
            <div className="space-y-2">
              <div>
                <span className="text-xs text-muted-foreground">{tr.admin.detail.emailLabel}</span>
                <p className="text-sm font-medium text-foreground">{submission.email ?? <span className="text-muted-foreground italic">—</span>}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{tr.admin.detail.submittedAt}</span>
                <p className="text-sm text-foreground">
                  {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(submission.submittedAt))}
                </p>
              </div>
              {submission.dateReception && (
                <div>
                  <span className="text-xs text-muted-foreground">{tr.admin.detail.receptionDate}</span>
                  <p className="text-sm text-foreground">{submission.dateReception}</p>
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{tr.admin.detail.formData}</h3>
            <div className="space-y-2 bg-muted rounded-lg p-4">
              {fieldRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tr.admin.detail.noData}</p>
              ) : (
                fieldRows.map((row) => (
                  <div key={row.key}>
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <p className={`text-sm ${row.value === null ? "text-muted-foreground italic" : "text-foreground"}`}>
                      {row.value ?? "—"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{tr.admin.detail.management}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-2">
                  {tr.admin.detail.priorityLabel}
                  {isOverride && <span className="ml-2 text-amber-600 font-medium">{tr.admin.detail.manualOverride}</span>}
                </label>
                <div className="flex items-center gap-2">
                  {PRIORITY_OPTIONS.map((opt) => {
                    const isActive = priority === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => !readOnly && setPriority(opt.value)}
                        disabled={readOnly}
                        title={opt.label}
                        className={`transition-all ${readOnly ? "cursor-default opacity-70" : "cursor-pointer"} ${
                          opt.value === "none"
                            ? `text-xs px-2 py-1 rounded border font-medium ${isActive ? "bg-muted border-border text-foreground" : "bg-background border-border text-muted-foreground hover:border-foreground/40"}`
                            : `w-7 h-7 rounded-full ${opt.color} ${isActive ? "ring-2 ring-offset-2 ring-offset-card ring-border scale-110" : "opacity-60 hover:opacity-100 hover:scale-105"}`
                        }`}
                      >
                        {opt.value === "none" ? tr.admin.detail.calculated : ""}
                      </button>
                    );
                  })}
                </div>
                {autoResult.daysLeft !== null && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {tr.admin.detail.autoCalc}{" "}
                    <span className={`font-medium ${autoResult.priority === "red" ? "text-red-600" : autoResult.priority === "orange" ? "text-orange-600" : autoResult.priority === "yellow" ? "text-yellow-600" : "text-green-600"}`}>
                      {autoResult.label}
                    </span>
                    {isOverride && ` ${tr.admin.detail.autoIgnored}`}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">{tr.admin.detail.statusLabel}</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as SubmissionStatus)} disabled={readOnly} className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-70 disabled:cursor-default cursor-pointer">
                  {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {tr.admin.detail.deadlineLabel}
                  {submission.dateEcheance && <span className="ml-1 text-muted-foreground">{tr.admin.detail.deadlineClientHint} {submission.dateEcheance}</span>}
                </label>
                <input type="date" value={dateEcheance} onChange={(e) => setDateEcheance(e.target.value)} readOnly={readOnly} className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 read-only:opacity-70 read-only:cursor-default cursor-pointer" />
                <p className="text-xs text-muted-foreground mt-1">{tr.admin.detail.deadlineHint}</p>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">{tr.admin.detail.notesLabel}</label>
                <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} readOnly={readOnly} placeholder={tr.admin.detail.notesPlaceholder} className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none read-only:opacity-70 read-only:cursor-default" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{tr.admin.detail.assignedTo}</label>
                <select
                  value={localSubmission.assignedToId ?? ""}
                  disabled={readOnly}
                  onChange={async e => {
                    const userId = e.target.value || null;
                    const user = users.find(u => u.id === userId);
                    const res = await fetch(`/api/admin/submissions/${localSubmission.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ assignedToId: userId, assignedToEmail: user?.email ?? null }),
                    });
                    if (res.ok) {
                      const updated = { ...localSubmission, assignedToId: userId, assignedToEmail: user?.email ?? null };
                      setLocalSubmission(updated);
                      onSaved(updated);
                    }
                  }}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50 disabled:opacity-70 disabled:cursor-default cursor-pointer"
                >
                  <option value="">{tr.admin.detail.unassigned}</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.email} ({u.role})</option>)}
                </select>
              </div>
            </div>
          </section>

          {events.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{tr.admin.detail.history}</h3>
              <ol className="relative border-l border-border space-y-4 ml-2">
                {events.map((ev) => {
                  const changes = ev.changes as { field: string; label: string; from: string | null; to: string | null }[];
                  return (
                    <li key={ev.id} className="ml-4">
                      <span className="absolute -left-1.5 w-3 h-3 bg-muted-foreground/40 rounded-full border-2 border-card" />
                      <p className="text-xs text-muted-foreground mb-1">
                        {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ev.createdAt))}
                        {ev.userEmail && <span className="ml-1">· {ev.userEmail}</span>}
                      </p>
                      <ul className="space-y-0.5">
                        {changes.map((c, i) => (
                          <li key={i} className="text-xs text-foreground">
                            <span className="font-medium">{c.label}</span>
                            {" "}
                            <span className="text-muted-foreground">{c.from ?? "—"}</span>
                            {" → "}
                            <span className="text-foreground">{c.to ?? "—"}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {!readOnly && (
          <div className="px-6 py-4 border-t border-border bg-card sticky bottom-0">
            <button onClick={handleSave} disabled={saving} className="w-full bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer">
              {saving ? tr.admin.detail.saving : tr.admin.detail.save}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
