"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Download, Folder, FolderPlus, LayoutDashboard, LayoutGrid, List, Pencil, Pin, PinOff, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/lib/context/LocaleContext";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AdminFolder } from "@/types/config";
import { ViewImportModal } from "./ViewImportModal";
import { NewViewDialog } from "./NewViewDialog";

export interface ViewCardData {
  id: string;
  slug: string;
  title: string;
  icon: string | null;
  widgetCount: number;
  formInstanceId: string | null;
  folderId: string | null;
}

interface Props {
  views: ViewCardData[];
  folders: AdminFolder[];
}

type SortKey = "recent" | "name-asc" | "name-desc";

export function ViewsList({ views, folders: initialFolders }: Props) {
  const tr = useTranslations();
  const t = tr.admin.viewsList;
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentFolderId = searchParams.get("folder");

  const [folders, setFolders] = useState<AdminFolder[]>(initialFolders);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "global" | "form">("all");
  const [sort, setSort] = useState<SortKey>("name-asc");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newViewOpen, setNewViewOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<AdminFolder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminFolder | null>(null);
  const [hiddenPages, setHiddenPages] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/admin/account/sidebar-layout")
      .then(r => r.ok ? r.json() : null)
      .then((data: { hiddenPages?: string[] } | null) => {
        if (data?.hiddenPages) setHiddenPages(data.hiddenPages);
      })
      .catch(() => {});
  }, []);

  async function togglePin(viewId: string) {
    const next = hiddenPages.includes(viewId)
      ? hiddenPages.filter(id => id !== viewId)
      : [...hiddenPages, viewId];
    setHiddenPages(next);
    await fetch("/api/admin/account/sidebar-layout", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hiddenPages: next }),
    }).catch(() => {});
    router.refresh();
  }

  async function submitCreateView({ slug, title }: { slug: string; title: string }) {
    try {
      const res = await fetch("/api/admin/config", { credentials: "same-origin" });
      if (!res.ok) throw new Error("config-fetch");
      const { config } = await res.json();
      const pages = Array.isArray(config?.admin?.pages) ? config.admin.pages : [];
      if (pages.some((p: { slug?: string }) => p.slug === slug)) {
        toast.error(tr.admin.newView.duplicateSlug);
        return;
      }
      const id = `p-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
      const newPage = { id, slug, title, widgets: [] };
      const nextConfig = {
        ...config,
        admin: { ...config.admin, pages: [...pages, newPage] },
      };
      const put = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(nextConfig),
      });
      if (!put.ok) {
        const data = await put.json().catch(() => ({}));
        toast.error(data.error ?? tr.admin.newView.error);
        return;
      }
      // Hide the new view from the sidebar by default — the user pins it from
      // the card if they want it to appear there.
      const nextHidden = [...hiddenPages, id];
      setHiddenPages(nextHidden);
      await fetch("/api/admin/account/sidebar-layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenPages: nextHidden }),
      }).catch(() => {});
      toast.success(tr.admin.newView.created);
      setNewViewOpen(false);
      window.location.assign(`/admin/views/${encodeURIComponent(id)}/edit`);
    } catch {
      toast.error(tr.admin.newView.error);
    }
  }

  async function submitCreateFolder(name: string) {
    const res = await fetch("/api/admin/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind: "views", parentId: currentFolderId ?? undefined }),
    });
    if (!res.ok) {
      toast.error(t.folderCreateError);
      return;
    }
    const { folder } = await res.json();
    setFolders((prev) => [...prev, folder]);
    router.refresh();
  }

  async function submitRenameFolder(folder: AdminFolder, name: string) {
    if (name === folder.name) return;
    const res = await fetch(`/api/admin/folders?id=${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      toast.error(t.folderRenameError);
      return;
    }
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, name } : f)));
    router.refresh();
  }

  async function submitDeleteFolder(folder: AdminFolder) {
    const res = await fetch(`/api/admin/folders?id=${folder.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(t.folderDeleteError);
      return;
    }
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    router.refresh();
  }

  const currentFolder = folders.find((f) => f.id === currentFolderId) ?? null;
  const childFolders = folders.filter((f) => (f.parentId ?? null) === currentFolderId);
  const scopedViews = views.filter((v) => (v.folderId ?? null) === currentFolderId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedViews
      .filter((v) => {
        if (scopeFilter === "global" && v.formInstanceId) return false;
        if (scopeFilter === "form" && !v.formInstanceId) return false;
        if (!q) return true;
        return v.title.toLowerCase().includes(q) || v.slug.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (sort === "name-asc") return a.title.localeCompare(b.title);
        if (sort === "name-desc") return b.title.localeCompare(a.title);
        return 0;
      });
  }, [scopedViews, search, scopeFilter, sort]);

  const searchPlaceholder = currentFolder
    ? t.searchInFolder.replace("{folder}", currentFolder.name)
    : t.searchPlaceholder;

  return (
    <div className="space-y-4">
      {currentFolder && (
        <nav className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/admin/views" className="hover:text-foreground transition-colors">{t.breadcrumbBack}</Link>
          <span className="text-muted-foreground/60">/</span>
          <Link href="/admin/views" className="hover:text-foreground transition-colors">{t.breadcrumbAll}</Link>
          <span className="text-muted-foreground/60">/</span>
          <span className="font-medium text-foreground">{currentFolder.name}</span>
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md border border-border bg-muted/30 shrink-0">
          {(["all", "global", "form"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setScopeFilter(v)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${scopeFilter === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              aria-pressed={scopeFilter === v}
            >
              {v === "all" ? t.filterAll : v === "global" ? t.filterGlobal : t.filterForm}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label={t.sortBy}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option value="recent">{t.sortRecent}</option>
          <option value="name-asc">{t.sortNameAsc}</option>
          <option value="name-desc">{t.sortNameDesc}</option>
        </select>
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md border border-border bg-muted/30 shrink-0">
          <button type="button" onClick={() => setViewMode("list")} aria-label={t.viewList} aria-pressed={viewMode === "list"}
            className={`p-1 rounded transition-colors ${viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <List className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => setViewMode("grid")} aria-label={t.viewGrid} aria-pressed={viewMode === "grid"}
            className={`p-1 rounded transition-colors ${viewMode === "grid" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-background text-xs font-medium hover:bg-muted transition-colors">
          <FolderPlus className="w-3.5 h-3.5" />
          {t.newFolder}
        </button>
        <button type="button" onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-background text-xs font-medium hover:bg-muted transition-colors">
          <Upload className="w-3.5 h-3.5" />
          {t.importYaml}
        </button>
        <button type="button" onClick={() => setNewViewOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" />
          {tr.admin.newView.cta}
        </button>
      </div>

      {/* Folders inline */}
      {childFolders.length > 0 && (
        <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" : "flex flex-col gap-2"}>
          {childFolders.map((folder) => {
            const itemCount = views.filter((v) => v.folderId === folder.id).length;
            const subCount = folders.filter((f) => f.parentId === folder.id).length;
            return (
              <Link
                key={folder.id}
                href={`/admin/views?folder=${folder.id}`}
                className="group relative flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/30"
              >
                <span className="w-10 h-10 shrink-0 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 inline-flex items-center justify-center">
                  {folder.emoji ?? <Folder className="w-5 h-5" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate flex-1 min-w-0">{folder.name}</p>
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground">
                      {folder.parentId ? t.subfolder : t.folder}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {(itemCount === 1 ? t.folderMeta_one : t.folderMeta_other).replace("{n}", String(itemCount))}
                    {subCount > 0 && (
                      <> · {(subCount === 1 ? t.folderMetaSub_one : t.folderMetaSub_other).replace("{n}", String(subCount))}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRenameTarget(folder); }}
                    aria-label={t.rename}
                    title={t.rename}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(folder); }}
                    aria-label={t.delete}
                    title={t.delete}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
            );
          })}
        </div>
      )}

      {filtered.length === 0 && childFolders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {t.empty}
        </div>
      ) : (
        <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" : "flex flex-col gap-2"}>
          {filtered.map((view) => (
            <ViewCard key={view.id} view={view} folders={folders} onMoved={() => router.refresh()}
              tWidgetOne={t.widget_one} tWidgetOther={t.widget_other}
              tScopedToForm={t.scopedToForm} tAllSubmissions={t.allSubmissions}
              tMoveMenuTitle={t.moveMenuTitle} tMoveToRoot={t.moveToRoot}
              tExportYaml={t.exportYaml} tEditView={tr.admin.chart.editView}
              isPinned={!hiddenPages.includes(view.id)}
              onTogglePin={() => togglePin(view.id)}
              tPin={t.pin} tUnpin={t.unpin} />
          ))}
        </div>
      )}

      {importOpen && (
        <ViewImportModal
          onClose={() => setImportOpen(false)}
          onSuccess={() => {
            setImportOpen(false);
            router.refresh();
          }}
        />
      )}

      <PromptDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t.newFolder}
        description={t.newFolderPrompt}
        placeholder={t.newFolderPlaceholder}
        confirmLabel={t.confirmCreate}
        cancelLabel={t.cancel}
        onConfirm={submitCreateFolder}
      />

      <NewViewDialog
        open={newViewOpen}
        onOpenChange={setNewViewOpen}
        onCreate={submitCreateView}
      />

      <PromptDialog
        open={!!renameTarget}
        onOpenChange={(o) => !o && setRenameTarget(null)}
        title={t.renamePrompt}
        label={t.renamePromptLabel}
        defaultValue={renameTarget?.name ?? ""}
        confirmLabel={t.confirmRename}
        cancelLabel={t.cancel}
        onConfirm={(name) => renameTarget && submitRenameFolder(renameTarget, name)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t.deleteFolderTitle}
        description={deleteTarget ? t.deleteConfirm.replace("{name}", deleteTarget.name) : ""}
        confirmLabel={t.confirmDelete}
        cancelLabel={t.cancel}
        destructive
        onConfirm={() => deleteTarget && submitDeleteFolder(deleteTarget)}
      />
    </div>
  );
}

function ViewCard({
  view,
  folders,
  onMoved,
  tWidgetOne,
  tWidgetOther,
  tScopedToForm,
  tAllSubmissions,
  tMoveMenuTitle,
  tMoveToRoot,
  tExportYaml,
  tEditView,
  isPinned,
  onTogglePin,
  tPin,
  tUnpin,
}: {
  view: ViewCardData;
  folders: AdminFolder[];
  onMoved: () => void;
  tWidgetOne: string;
  tWidgetOther: string;
  tScopedToForm: string;
  tAllSubmissions: string;
  tMoveMenuTitle: string;
  tMoveToRoot: string;
  tExportYaml: string;
  tEditView: string;
  isPinned: boolean;
  onTogglePin: () => void;
  tPin: string;
  tUnpin: string;
}) {
  async function moveTo(folderId: string | null, e: React.ChangeEvent<HTMLSelectElement>) {
    e.preventDefault();
    await fetch("/api/admin/folders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemType: "view", itemId: view.id, folderId }),
    });
    onMoved();
  }

  return (
    <div className="group relative flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/30">
      <Link href={`/admin/${view.slug}`} className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={view.title}>
        <span className="sr-only">{view.title}</span>
      </Link>
      <span className="w-10 h-10 shrink-0 rounded-lg bg-accent text-accent-foreground inline-flex items-center justify-center">
        <LayoutDashboard className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{view.title}</p>
        <p className="text-xs font-mono text-muted-foreground truncate mt-0.5">/admin/{view.slug}</p>
        <p className="text-[11px] text-muted-foreground/80 mt-1.5">
          {view.widgetCount} {view.widgetCount === 1 ? tWidgetOne : tWidgetOther}
          {view.formInstanceId ? ` · ${tScopedToForm}` : ` · ${tAllSubmissions}`}
        </p>
      </div>
      <div className="relative z-10 flex items-center gap-1 shrink-0">
        <select
          onChange={(e) => moveTo(e.target.value || null, e)}
          value={view.folderId ?? ""}
          aria-label={tMoveMenuTitle}
          className="h-7 rounded border border-border bg-background px-1 text-[11px] text-muted-foreground w-0 opacity-0 pointer-events-none group-hover:w-[110px] group-hover:opacity-100 group-hover:pointer-events-auto focus-within:w-[110px] focus-within:opacity-100 focus-within:pointer-events-auto transition-all"
        >
          <option value="">{tMoveToRoot}</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(); }}
          aria-label={isPinned ? tUnpin : tPin}
          title={isPinned ? tUnpin : tPin}
          aria-pressed={isPinned}
          className={`inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-muted/40 transition-colors ${isPinned ? "text-primary hover:bg-muted" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >
          {isPinned ? <Pin className="w-[18px] h-[18px] fill-current" /> : <PinOff className="w-[18px] h-[18px]" />}
        </button>
        <Link
          href={`/admin/views/${encodeURIComponent(view.id)}/edit`}
          aria-label={tEditView}
          title={tEditView}
          className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-muted/40 text-foreground hover:bg-muted hover:text-primary transition-colors"
        >
          <Pencil className="w-[18px] h-[18px]" />
        </Link>
        <a
          href={`/api/admin/views/${view.id}/export`}
          download
          aria-label={tExportYaml}
          title={tExportYaml}
          className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-muted/40 text-foreground hover:bg-muted hover:text-primary transition-colors"
        >
          <Download className="w-[18px] h-[18px]" />
        </a>
      </div>
    </div>
  );
}
