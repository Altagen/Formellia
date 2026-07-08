"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { FormConfig } from "@/types/config";
import type { FormInstance } from "@/types/formInstance";
import { PagesTab } from "@/components/admin/config/PagesTab";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslations } from "@/lib/context/LocaleContext";

interface Props {
  config:        FormConfig;
  formInstances: FormInstance[];
  pageId:        string;
}

export function ViewEditorClient({ config, formInstances, pageId }: Props) {
  const tr = useTranslations();
  const [draft, setDraft] = useState<FormConfig>(() => JSON.parse(JSON.stringify(config)));
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => JSON.stringify(config));
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const page = draft.admin.pages.find(pg => pg.id === pageId);
  const isDirty = savedSnapshot !== JSON.stringify(draft);
  const ve = tr.admin.viewEditor;

  // Toast survives the post-save hard reload (router.refresh is flaky for
  // the dashboard layout under Turbopack — a full reload is the only way
  // the sidebar picks up the renamed view). We stash a flag before reload
  // and consume it on remount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("view-editor-just-saved") === "1") {
      sessionStorage.removeItem("view-editor-just-saved");
      toast.success(tr.admin.config.toasts.saved, { duration: 1500 });
    }
  }, [tr.admin.config.toasts.saved]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const toastId = toast.loading(tr.admin.config.toasts.saving);
    try {
      const res = await fetch("/api/admin/config", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(draft),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? tr.admin.config.toasts.errorStatus.replace("{status}", String(res.status)), { id: toastId });
        setSaving(false);
        return;
      }
      toast.dismiss(toastId);
      // Reset dirty-tracking so the Save button greys out immediately.
      setSavedSnapshot(JSON.stringify(draft));
      // Force a full reload so the AdminSidebar (rendered by the dashboard
      // layout) picks up the new title / slug / widgets.
      sessionStorage.setItem("view-editor-just-saved", "1");
      window.location.reload();
    } catch {
      toast.error(tr.admin.config.toasts.networkError, { id: toastId });
      setSaving(false);
    }
  }, [draft, tr]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    const toastId = toast.loading(ve.deleteConfirm);
    try {
      const nextConfig: FormConfig = {
        ...draft,
        admin: {
          ...draft.admin,
          pages: draft.admin.pages.filter(pg => pg.id !== pageId),
          defaultPage: draft.admin.defaultPage === page?.slug ? undefined : draft.admin.defaultPage,
        },
      };
      const res = await fetch("/api/admin/config", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(nextConfig),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? ve.deleteError, { id: toastId });
        setDeleting(false);
        return;
      }
      toast.dismiss(toastId);
      toast.success(ve.deleteSuccess);
      // Full reload so the AdminSidebar picks up the removal.
      window.location.assign("/admin/views");
    } catch {
      toast.error(ve.deleteError, { id: toastId });
      setDeleting(false);
    }
  }, [draft, pageId, page, ve]);

  if (!page) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">{tr.admin.viewEditor.notFound}</p>
        <Link href="/admin/views" className="inline-flex items-center gap-1.5 mt-4 text-sm text-primary hover:underline">
          <ArrowLeft className="w-4 h-4" /> {tr.admin.viewEditor.backToList}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/admin/views"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" /> {tr.admin.viewEditor.backToList}
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <p className="text-sm font-semibold text-foreground truncate">{page.title}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isDirty && !saving && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 hidden sm:inline">
              {ve.unsavedHint}
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={saving || deleting}
            className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">{ve.deleteBtn}</span>
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={!isDirty || saving} className="gap-1.5">
            <Save className="w-4 h-4" />
            {saving ? tr.admin.config.toasts.saving : ve.save}
          </Button>
        </div>
      </div>

      <PagesTab
        variant="single"
        initialExpandedPageId={pageId}
        pages={draft.admin.pages}
        defaultPage={draft.admin.defaultPage}
        formSteps={formInstances.flatMap(inst => inst.config?.form?.steps ?? [])}
        formInstances={formInstances}
        features={draft.admin.features}
        autoGenerateView={draft.admin.autoGenerateView}
        tableColumns={draft.admin.tableColumns}
        onChangePages={(pages)  => setDraft({ ...draft, admin: { ...draft.admin, pages } })}
        onChangeDefault={(defaultPage) => setDraft({ ...draft, admin: { ...draft.admin, defaultPage } })}
        onChangeColumns={(cols) => setDraft({ ...draft, admin: { ...draft.admin, tableColumns: cols } })}
        onChangeFeatures={(features) => setDraft({ ...draft, admin: { ...draft.admin, features } })}
        onChangeAutoGenerateView={(v) => setDraft({ ...draft, admin: { ...draft.admin, autoGenerateView: v } })}
      />

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={ve.deleteConfirmTitle}
        description={ve.deleteConfirmDesc.replace("{title}", page.title)}
        confirmLabel={ve.deleteConfirm}
        cancelLabel={ve.deleteCancel}
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
