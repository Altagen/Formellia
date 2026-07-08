"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { FormInstance, FormInstanceConfig } from "@/types/formInstance";
import { PageBuilderTab } from "@/components/admin/config/PageBuilderTab";
import { FormBuilderTab } from "@/components/admin/config/FormBuilderTab";
import { MetaTab } from "@/components/admin/config/MetaTab";
import { SecurityTab } from "@/components/admin/config/SecurityTab";
import { FormFeaturesTab } from "@/components/admin/config/FormFeaturesTab";
import { FormsGlobalSettings } from "@/components/admin/config/FormsGlobalSettings";
import { NotificationsTab } from "@/components/admin/config/NotificationsTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Trash2, ExternalLink, FileCode2, Eye, X, History, Unlock, Download, Sheet } from "lucide-react";
import { SubmissionExportDialog } from "@/components/admin/SubmissionExportDialog";
import { FormWizard } from "@/components/form/FormWizard";
import { useTranslations } from "@/lib/context/LocaleContext";
import { PrioritiesTab } from "@/components/admin/config/PrioritiesTab";
import { ActionsTab } from "@/components/admin/config/ActionsTab";
import { CodeTab } from "@/components/admin/config/CodeTab";

// InstanceTabId is derived from the fixed set of tab IDs (labels are translated at runtime)
type InstanceTabId = "options" | "page" | "form" | "meta" | "security" | "notifications" | "statuses" | "priorities" | "actions" | "code";

interface FormsTabProps {
  instances: FormInstance[];
}


// ─────────────────────────────────────────────────────────
// Instance editor (sub-tabs: options, page, form, meta, security)
// ─────────────────────────────────────────────────────────

interface InstanceEditorProps {
  instance: FormInstance;
  onSaved: (updated: FormInstance) => void;
  onDeleted: () => void;
}

export function InstanceEditor({ instance: initial, onSaved, onDeleted }: InstanceEditorProps) {
  const router = useRouter();
  const tr = useTranslations();
  const f = tr.admin.config.forms;

  const INSTANCE_TABS = [
    { id: "options"       as InstanceTabId, label: f.tabOptions },
    { id: "page"          as InstanceTabId, label: f.tabPage },
    { id: "form"          as InstanceTabId, label: f.tabForm },
    { id: "meta"          as InstanceTabId, label: f.tabMeta },
    { id: "security"      as InstanceTabId, label: f.tabSecurity },
    { id: "notifications" as InstanceTabId, label: f.tabNotifications },
    { id: "statuses"      as InstanceTabId, label: f.tabStatuses },
    { id: "priorities"    as InstanceTabId, label: f.tabPriorities },
    { id: "actions"       as InstanceTabId, label: f.tabActions },
    { id: "code"          as InstanceTabId, label: f.tabCode },
  ];

  const [draft, setDraft] = useState<FormInstance>(() =>
    JSON.parse(JSON.stringify(initial))
  );
  const [tab, setTab] = useState<InstanceTabId>("options");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteSlugInput, setDeleteSlugInput] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<Array<{ id: string; createdAt: string; savedByEmail?: string | null; config: unknown }>>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<FormInstanceConfig | null>(null);
  const [confirmUnlockOpen, setConfirmUnlockOpen] = useState(false);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const isManagedByConfig = draft.config._managedBy === "yaml";
  const isManagedByImport = draft.config._managedBy === "ui-import";

  function patchDraft(patch: Partial<FormInstance>) {
    setDraft(prev => ({ ...prev, ...patch }));
  }

  const handleSave = useCallback(async () => {
    setSaving(true);
    const toastId = toast.loading(f.save + "…");
    try {
      const res = await fetch(`/api/admin/forms/${draft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, config: draft.config }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? f.networkError, { id: toastId });
      } else {
        const updated: FormInstance = await res.json();
        toast.success(f.saved, { id: toastId });
        onSaved(updated);
        router.refresh();
      }
    } catch {
      toast.error(f.networkError, { id: toastId });
    } finally {
      setSaving(false);
    }
  }, [draft, onSaved, router, f]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/forms/${draft.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? f.networkError);
      } else {
        toast.success(f.deleted);
        onDeleted();
        router.refresh();
      }
    } catch {
      toast.error(f.networkError);
    } finally {
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  }, [draft.id, onDeleted, router, f]);

  const handleUnlock = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/forms/${draft.id}/unlock`, { method: "PATCH" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? f.networkError);
      } else {
        const updated: FormInstance = await res.json();
        toast.success(f.saved);
        setDraft(updated);
        onSaved(updated);
        router.refresh();
      }
    } catch {
      toast.error(f.networkError);
    } finally {
      setConfirmUnlockOpen(false);
    }
  }, [draft.id, onSaved, router, f]);

  async function loadVersions() {
    setShowHistory(true);
    setLoadingVersions(true);
    try {
      const res = await fetch(`/api/admin/forms/${draft.id}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data);
      }
    } finally {
      setLoadingVersions(false);
    }
  }

  const publicUrl =
    draft.slug === "/"
      ? "/"
      : `/${draft.slug}`;

  return (
    <div className="space-y-4">
      {/* Config-as-code warning banner (config.yaml) */}
      {isManagedByConfig && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
          <FileCode2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{f.configManaged}</span>
        </div>
      )}

      {/* UI-import lock banner */}
      {isManagedByImport && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 text-sm text-violet-800 dark:text-violet-300">
          <div className="flex items-start gap-2 flex-1">
            <FileCode2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{f.lockBanner}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setTab("code")}
              className="text-xs font-medium underline hover:no-underline"
            >
              {f.lockEditCode}
            </button>
            <button
              type="button"
              onClick={() => setConfirmUnlockOpen(true)}
              className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-violet-300 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900 transition-colors"
            >
              <Unlock className="w-3 h-3" />
              {f.lockUnlock}
            </button>
          </div>
        </div>
      )}

      {/* Unlock confirm dialog */}
      <ConfirmDialog
        open={confirmUnlockOpen}
        title={f.unlockConfirmTitle}
        description={f.unlockConfirmDesc}
        confirmLabel={f.lockUnlock}
        cancelLabel={f.cancel}
        onConfirm={handleUnlock}
        onOpenChange={setConfirmUnlockOpen}
      />

      {/* Editor header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{draft.name}</h3>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title={f.preview}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          {isDirty && (
            <span className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full shrink-0">
              {f.unsaved}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draft.config.features?.formVersioning === true && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={loadVersions}
            >
              <History className="w-3.5 h-3.5 mr-1" />
              {f.history}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowPreview(true)}
          >
            <Eye className="w-3.5 h-3.5 mr-1" />
            {f.preview}
          </Button>
          <a
            href={`/admin/preview/${draft.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button type="button" size="sm" variant="outline">
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              {f.previewFullPage}
            </Button>
          </a>
          <a href={`/api/admin/forms/${draft.id}/export`} download>
            <Button type="button" size="sm" variant="outline" title={f.exportYamlHint}>
              <Download className="w-3.5 h-3.5 mr-1" />
              {f.exportYaml}
            </Button>
          </a>
          <Button type="button" size="sm" variant="outline" onClick={() => setExportOpen(true)}>
            <Sheet className="w-3.5 h-3.5 mr-1" />
            {f.exportData}
          </Button>
          {draft.slug !== "/" && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => { setDeleteSlugInput(""); setConfirmDeleteOpen(true); }}
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                {f.delete}
              </Button>
              <Dialog open={confirmDeleteOpen} onOpenChange={open => { setConfirmDeleteOpen(open); setDeleteSlugInput(""); }}>
                <DialogContent showCloseButton={false} className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>{f.deleteTitle}</DialogTitle>
                    <DialogDescription>{f.deleteDesc}</DialogDescription>
                  </DialogHeader>
                  <div className="py-1 space-y-1.5">
                    <label className="block text-xs text-muted-foreground">{f.deleteSlugPrompt}</label>
                    <Input
                      value={deleteSlugInput}
                      onChange={e => setDeleteSlugInput(e.target.value)}
                      placeholder={draft.slug}
                      className="text-sm font-mono"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === "Enter" && deleteSlugInput === draft.slug) {
                          setConfirmDeleteOpen(false);
                          setDeleteSlugInput("");
                          handleDelete();
                        }
                      }}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setConfirmDeleteOpen(false); setDeleteSlugInput(""); }}
                    >
                      {f.cancel}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={deleteSlugInput !== draft.slug || deleting}
                      onClick={() => { setConfirmDeleteOpen(false); setDeleteSlugInput(""); handleDelete(); }}
                    >
                      {f.delete}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || saving}
          >
            {saving ? "…" : f.save}
          </Button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {INSTANCE_TABS.map(t => {
          const disabledByLock = isManagedByImport && t.id !== "code";
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { if (!disabledByLock) setTab(t.id); }}
              className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              } ${disabledByLock ? "pointer-events-none opacity-40" : ""}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      <div className="pt-1">
        {tab === "options" && (
          <FormFeaturesTab
            instance={draft}
            onChange={patch => patchDraft(patch)}
          />
        )}
        {tab === "page" && (
          <PageBuilderTab
            page={draft.config.page}
            onChange={page => patchDraft({ config: { ...draft.config, page } })}
          />
        )}
        {tab === "form" && (
          <FormBuilderTab
            steps={draft.config.form.steps}
            onChange={steps =>
              patchDraft({ config: { ...draft.config, form: { ...draft.config.form, steps } } })
            }
          />
        )}
        {tab === "meta" && (
          <MetaTab
            meta={draft.config.meta}
            onChange={meta => patchDraft({ config: { ...draft.config, meta } })}
          />
        )}
        {tab === "security" && (
          <SecurityTab
            security={draft.config.security}
            onChange={security => patchDraft({ config: { ...draft.config, security } })}
          />
        )}
        {tab === "notifications" && (
          <NotificationsTab
            instance={draft}
            onChange={patch => patchDraft(patch)}
          />
        )}
        {tab === "statuses" && (
          <StatusesEditor
            customStatuses={draft.config.customStatuses}
            onChange={customStatuses =>
              patchDraft({ config: { ...draft.config, customStatuses } })
            }
          />
        )}
        {tab === "priorities" && (
          <PrioritiesTab
            thresholds={draft.config.priorityThresholds}
            onChange={priorityThresholds =>
              patchDraft({ config: { ...draft.config, priorityThresholds } })
            }
          />
        )}
        {tab === "actions" && (
          <ActionsTab
            actions={draft.config.onSubmitActions}
            fieldDefs={draft.config.form.steps.flatMap(s => s.fields)}
            logoUrl={draft.config.page?.branding?.logoUrl}
            brandColor={draft.config.page?.branding?.primaryColor}
            formName={draft.config.meta?.name}
            formLocale={draft.config.meta?.locale}
            onChange={onSubmitActions =>
              patchDraft({ config: { ...draft.config, onSubmitActions } })
            }
          />
        )}
        {tab === "code" && (
          <CodeTab
            instance={draft}
            onImported={updated => {
              patchDraft({ config: updated.config });
              onSaved(updated);
            }}
          />
        )}
      </div>

      {/* Preview modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-8">
          <div className="relative bg-card rounded-xl shadow-2xl w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold">
                {f.previewTitle.replace("{name}", draft.name)}
              </h2>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 bg-background rounded-b-xl">
              <FormWizard instanceConfig={draft.config} submitUrl={undefined} />
            </div>
          </div>
        </div>
      )}

      {/* History drawer */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex justify-end"
          onClick={() => setShowHistory(false)}
        >
          <div
            className="bg-card border-l border-border w-full max-w-md h-full flex flex-col shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">{f.versionHistory}</h3>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingVersions ? (
                <p className="text-sm text-muted-foreground text-center py-8">…</p>
              ) : versions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{f.noVersions}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {versions.map(v => (
                    <li key={v.id} className="px-4 py-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">
                          {new Date(v.createdAt).toLocaleString("fr-FR")}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewVersion(v.config as FormInstanceConfig)}
                            className="text-xs text-primary hover:underline cursor-pointer"
                          >
                            {f.versionPreviewBtn}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDraft(prev => ({ ...prev, config: v.config as FormInstanceConfig }));
                              setShowHistory(false);
                              toast.success(f.versionRestored);
                            }}
                            className="text-xs text-orange-600 hover:underline cursor-pointer"
                          >
                            {f.versionRestore}
                          </button>
                        </div>
                      </div>
                      {v.savedByEmail && (
                        <p className="text-xs text-muted-foreground">{v.savedByEmail}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Version preview modal */}
      {previewVersion && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-start justify-center overflow-y-auto py-8"
          onClick={() => setPreviewVersion(null)}
        >
          <div
            className="bg-card rounded-xl shadow-2xl w-full max-w-2xl mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold">{f.versionPreview}</h2>
              <button
                type="button"
                onClick={() => setPreviewVersion(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="p-6 bg-background rounded-b-xl">
              <FormWizard
                instanceConfig={previewVersion}
                submitUrl={undefined}
              />
            </div>
          </div>
        </div>
      )}

      <SubmissionExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        formInstanceId={draft.id}
        slug={draft.slug === "/" ? "root" : draft.slug}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// StatusesEditor — custom statuses per form instance
// ─────────────────────────────────────────────────────────

type CustomStatus = { value: string; label: string; color: string };

function slugifyValue(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40) || "statut";
}

interface StatusesEditorProps {
  customStatuses: CustomStatus[] | undefined;
  onChange: (statuses: CustomStatus[] | undefined) => void;
}

function StatusesEditor({ customStatuses, onChange }: StatusesEditorProps) {
  const tr = useTranslations();
  const f = tr.admin.config.forms;

  const DEFAULT_STATUSES: CustomStatus[] = [
    { value: "pending",      label: tr.status.pending,       color: "#6b7280" },
    { value: "in_progress",  label: tr.status.in_progress,   color: "#2563eb" },
    { value: "done",         label: tr.status.done,          color: "#059669" },
    { value: "waiting_user", label: tr.status.waiting_user,  color: "#d97706" },
  ];

  const hasCustom = Array.isArray(customStatuses) && customStatuses.length > 0;

  function addStatus() {
    const base: CustomStatus[] = hasCustom ? [...customStatuses!] : [];
    onChange([...base, { value: `statut_${Date.now()}`, label: "", color: "#6b7280" }]);
  }

  function updateStatus(i: number, patch: Partial<CustomStatus>) {
    if (!customStatuses) return;
    const next = [...customStatuses];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  function handleLabelChange(i: number, label: string) {
    if (!customStatuses) return;
    const current = customStatuses[i];
    // Auto-derive value from label only if value still matches the auto-pattern
    const wasAuto = current.value === slugifyValue(current.label) || current.value.startsWith("statut_");
    const value = wasAuto ? slugifyValue(label) : current.value;
    updateStatus(i, { label, value });
  }

  function removeStatus(i: number) {
    if (!customStatuses) return;
    const next = customStatuses.filter((_, idx) => idx !== i);
    onChange(next.length > 0 ? next : undefined);
  }

  function moveStatus(i: number, dir: -1 | 1) {
    if (!customStatuses) return;
    const next = [...customStatuses];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  function resetToDefaults() {
    onChange(undefined);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground mb-1">{f.statusesTitle}</p>
        <p className="text-xs text-muted-foreground">{f.statusesDesc}</p>
      </div>

      {/* Default statuses info */}
      {!hasCustom && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {f.defaultStatuses}
          </p>
          <div className="space-y-1.5">
            {DEFAULT_STATUSES.map(s => (
              <div key={s.value} className="flex items-center gap-2 text-sm text-foreground">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="font-medium">{s.label}</span>
                <span className="text-xs text-muted-foreground font-mono">({s.value})</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addStatus}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
          >
            + {f.customizeStatuses}
          </button>
        </div>
      )}

      {/* Custom statuses editor */}
      {hasCustom && (
        <div className="space-y-3">
          <div className="space-y-2">
            {customStatuses!.map((s, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background">
                {/* Move up/down */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveStatus(i, -1)}
                    disabled={i === 0}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStatus(i, 1)}
                    disabled={i === customStatuses!.length - 1}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Color swatch */}
                <input
                  type="color"
                  value={s.color}
                  onChange={e => updateStatus(i, { color: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border border-border p-0.5 bg-transparent shrink-0"
                />

                {/* Label */}
                <input
                  type="text"
                  value={s.label}
                  onChange={e => handleLabelChange(i, e.target.value)}
                  placeholder={f.name}
                  className="flex-1 border border-input rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                />

                {/* Value */}
                <input
                  type="text"
                  value={s.value}
                  onChange={e => updateStatus(i, { value: e.target.value.replace(/[^a-z0-9_]/g, "") })}
                  placeholder={f.slug}
                  className="w-20 sm:w-32 border border-input rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring bg-background text-muted-foreground"
                />

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => removeStatus(i)}
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  title={f.delete}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={addStatus}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
            >
              + {f.addStatus}
            </button>
            <button
              type="button"
              onClick={resetToDefaults}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {f.resetStatuses}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// FormsTab — list + create + edit
// ─────────────────────────────────────────────────────────

export function FormsTab(_props: FormsTabProps) {
  return (
    <div className="space-y-6">
      <FormsGlobalSettings />
    </div>
  );
}

