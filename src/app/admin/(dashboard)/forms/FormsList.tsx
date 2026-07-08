"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Download, FileText, Folder, FolderPlus, LayoutGrid, List, Pencil, Plus, Search, Star, Trash2, Upload, Sheet } from "lucide-react";
import { ExportDataButton } from "@/components/admin/ExportDataButton";
import { toast } from "sonner";
import { useTranslations } from "@/lib/context/LocaleContext";
import { ImportModal } from "@/components/admin/config/ImportModal";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NewFormDialog } from "./NewFormDialog";
import type { AdminFolder } from "@/types/config";

export interface FormCardData {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
  active: boolean;
  updatedAt: string;
  folderId: string | null;
}

interface Props {
  instances: FormCardData[];
  folders: AdminFolder[];
}

type SortKey = "recent" | "name-asc" | "name-desc";

export function FormsList({ instances, folders: initialFolders }: Props) {
  const tr = useTranslations();
  const t = tr.admin.formsList;
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentFolderId = searchParams.get("folder");

  const [favorites, setFavorites] = useState<string[]>([]);
  const [folders, setFolders] = useState<AdminFolder[]>(initialFolders);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFormOpen, setNewFormOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<AdminFolder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminFolder | null>(null);

  useEffect(() => {
    fetch("/api/admin/account/sidebar-layout")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.favorites) setFavorites(data.favorites); })
      .catch(() => {});
  }, []);

  async function toggleFavorite(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    setFavorites(next);
    await fetch("/api/admin/account/sidebar-layout", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorites: next }),
    }).catch(() => {});
  }

  async function submitCreateForm({ slug, name }: { slug: string; name: string }) {
    const res = await fetch("/api/admin/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? tr.admin.newForm.error);
      return;
    }
    const instance = await res.json();
    toast.success(tr.admin.newForm.created);
    setNewFormOpen(false);
    window.location.assign(`/admin/forms/${encodeURIComponent(instance.slug)}`);
  }

  async function submitCreateFolder(name: string) {
    const res = await fetch("/api/admin/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind: "forms", parentId: currentFolderId ?? undefined }),
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
  const scopedInstances = instances.filter((i) => (i.folderId ?? null) === currentFolderId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedInstances
      .filter((i) => {
        if (statusFilter === "active" && !i.active) return false;
        if (statusFilter === "inactive" && i.active) return false;
        if (!q) return true;
        return i.name.toLowerCase().includes(q) || i.slug.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const aFav = favorites.includes(a.id) ? 0 : 1;
        const bFav = favorites.includes(b.id) ? 0 : 1;
        if (aFav !== bFav) return aFav - bFav;
        if (sort === "name-asc") return a.name.localeCompare(b.name);
        if (sort === "name-desc") return b.name.localeCompare(a.name);
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [scopedInstances, favorites, search, statusFilter, sort]);

  const searchPlaceholder = currentFolder
    ? t.searchInFolder.replace("{folder}", currentFolder.name)
    : t.searchPlaceholder;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      {currentFolder && (
        <nav className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/admin/forms" className="hover:text-foreground transition-colors">
            {t.breadcrumbBack}
          </Link>
          <span className="text-muted-foreground/60">/</span>
          <Link href="/admin/forms" className="hover:text-foreground transition-colors">
            {t.breadcrumbAll}
          </Link>
          <span className="text-muted-foreground/60">/</span>
          <span className="font-medium text-foreground">{currentFolder.name}</span>
        </nav>
      )}

      {/* Toolbar */}
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
          {(["all", "active", "inactive"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatusFilter(v)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${statusFilter === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              aria-pressed={statusFilter === v}
            >
              {v === "all" ? t.filterAll : v === "active" ? t.filterActive : t.filterInactive}
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
        <button type="button" onClick={() => setNewFormOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" />
          {tr.admin.newForm.cta}
        </button>
      </div>

      {/* Folders inline */}
      {childFolders.length > 0 && (
        <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" : "flex flex-col gap-2"}>
          {childFolders.map((folder) => {
            const itemCount = instances.filter((i) => i.folderId === folder.id).length;
            const subCount = folders.filter((f) => f.parentId === folder.id).length;
            return (
              <Link
                key={folder.id}
                href={`/admin/forms?folder=${folder.id}`}
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

      {/* Cards grid */}
      {filtered.length === 0 && childFolders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {t.empty}
        </div>
      ) : (
        <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" : "flex flex-col gap-2"}>
          {filtered.map((inst) => (
            <FormCard
              key={inst.id}
              instance={inst}
              pinned={favorites.includes(inst.id)}
              onTogglePin={(e) => toggleFavorite(inst.id, e)}
              folders={folders}
              onMoved={() => router.refresh()}
              tActiveBadge={t.statusActive}
              tInactiveBadge={t.statusInactive}
              tMoveMenuTitle={t.moveMenuTitle}
              tMoveToRoot={t.moveToRoot}
              tExportYaml={t.exportYaml}
              tExportData={t.exportData}
            />
          ))}
        </div>
      )}

      {importOpen && (
        <ImportModal
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

      <NewFormDialog
        open={newFormOpen}
        onOpenChange={setNewFormOpen}
        onCreate={submitCreateForm}
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

function FormCard({
  instance,
  pinned,
  onTogglePin,
  folders,
  onMoved,
  tActiveBadge,
  tInactiveBadge,
  tMoveMenuTitle,
  tMoveToRoot,
  tExportYaml,
  tExportData,
}: {
  instance: FormCardData;
  pinned: boolean;
  onTogglePin: (e: React.MouseEvent) => void;
  folders: AdminFolder[];
  onMoved: () => void;
  tActiveBadge: string;
  tInactiveBadge: string;
  tMoveMenuTitle: string;
  tMoveToRoot: string;
  tExportYaml: string;
  tExportData: string;
}) {
  async function moveTo(folderId: string | null, e: React.ChangeEvent<HTMLSelectElement>) {
    e.preventDefault();
    await fetch("/api/admin/folders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemType: "form", itemId: instance.id, folderId }),
    });
    onMoved();
  }

  return (
    <div className="group relative flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/30">
      <Link
        href={`/admin/forms/${instance.slug === "/" ? "_root" : instance.slug}`}
        className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={instance.name}
      >
        <span className="sr-only">{instance.name}</span>
      </Link>
      <span className="w-10 h-10 shrink-0 rounded-lg bg-accent text-accent-foreground inline-flex items-center justify-center text-base">
        {instance.emoji ?? <FileText className="w-5 h-5" />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate flex-1 min-w-0">{instance.name}</p>
          <span
            className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${instance.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}
          >
            {instance.active ? tActiveBadge : tInactiveBadge}
          </span>
        </div>
        <p className="text-xs font-mono text-muted-foreground truncate mt-0.5">
          {instance.slug === "/" ? "/" : `/${instance.slug}`}
        </p>
      </div>
      <div className="relative z-10 flex items-center gap-1 shrink-0">
        <select
          onChange={(e) => moveTo(e.target.value || null, e)}
          value={instance.folderId ?? ""}
          aria-label={tMoveMenuTitle}
          className="h-7 rounded border border-border bg-background px-1 text-[11px] text-muted-foreground w-0 opacity-0 pointer-events-none group-hover:w-[110px] group-hover:opacity-100 group-hover:pointer-events-auto focus-within:w-[110px] focus-within:opacity-100 focus-within:pointer-events-auto transition-all"
          title={tMoveMenuTitle}
        >
          <option value="">{tMoveToRoot}</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <a
          href={`/api/admin/forms/${instance.id}/export`}
          download
          aria-label={tExportYaml}
          title={tExportYaml}
          className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-muted/40 text-foreground hover:bg-muted hover:text-primary transition-colors"
        >
          <Download className="w-[18px] h-[18px]" />
        </a>
        <ExportDataButton
          formInstanceId={instance.id}
          slug={instance.slug === "/" ? "root" : instance.slug}
          label={tExportData}
        />
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={pinned ? "Unpin" : "Pin"}
          className={`p-1.5 rounded-md transition-colors ${pinned ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"}`}
        >
          <Star className={`w-4 h-4 ${pinned ? "fill-current" : ""}`} />
        </button>
      </div>
    </div>
  );
}
