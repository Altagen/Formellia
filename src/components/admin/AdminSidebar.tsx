"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUserPreferences } from "@/lib/context/UserPreferencesContext";
import { useUserRole, useUserCtx } from "@/lib/context/UserRoleContext";
import { useTranslations } from "@/lib/context/LocaleContext";
import {
  Settings2, LogOut,
  LayoutDashboard, Inbox, BarChart2, FileText, Info, Globe, User, ClipboardList,
  Link2, ChevronDown, ChevronRight, Pencil, Plus, Trash2, Check, X, FolderPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
  useDroppable,
  type DragStartEvent, type DragOverEvent, type DragEndEvent, type CollisionDetection,
} from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AdminPage, AdminFeatures, AdminBrandingConfig } from "@/types/config";
import type { SidebarLayout, SidebarCustomLink, SidebarCategory } from "@/types/sidebarLayout";
import type { FormInstance } from "@/types/formInstance";

const UNCAT = "__uncategorized__";

/** Defense-in-depth: strip any non-http/https/relative href before rendering. */
function safeHref(href: string): string {
  return /^(https?:\/\/|\/)/i.test(href) ? href : "/";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the display-ordered list of prefixed item IDs for a category. */
function getItemOrder(cat: SidebarCategory): string[] {
  if (cat.itemOrder?.length) return cat.itemOrder;
  return [
    ...(cat.pageIds ?? []).map(id => `page:${id}`),
    ...cat.formIds.map(id => `form:${id}`),
    ...(cat.linkIds ?? []).map(id => `link:${id}`),
  ];
}

/** Returns the category ID that contains the given prefixed item ID, or null if uncategorized. */
function findItemCatId(prefixedId: string, cats: SidebarCategory[]): string | null {
  for (const cat of cats) {
    if (getItemOrder(cat).includes(prefixedId)) return cat.id;
  }
  return null;
}

// ── PageIcon ──────────────────────────────────────────────────────────────────

function PageIcon({ name, className }: { name?: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    "layout-dashboard": <LayoutDashboard className={className} />,
    "inbox":            <Inbox className={className} />,
    "bar-chart-2":      <BarChart2 className={className} />,
    "file-text":        <FileText className={className} />,
    "info":             <Info className={className} />,
    "clipboard-list":   <ClipboardList className={className} />,
    "link":             <Link2 className={className} />,
    "link-2":           <Link2 className={className} />,
    "globe":            <Globe className={className} />,
    "settings":         <Settings2 className={className} />,
  };
  return (icons[name ?? ""] ?? <LayoutDashboard className={className} />) as React.ReactElement;
}

// ── Edit: droppable zone ──────────────────────────────────────────────────────

function DroppableZone({ id, collapsed, children }: { id: string; collapsed: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("rounded transition-colors", isOver && "bg-primary/10 ring-1 ring-inset ring-primary/20", collapsed && "h-1.5")}>
      {!collapsed && children}
    </div>
  );
}

// ── Edit: sortable item row (whole row is the drag handle) ────────────────────

function SortableItemRow({ dragId, icon, label, onRemove }: {
  dragId: string; icon: React.ReactNode; label: string; onRemove: () => void;
}) {
  const { setNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({ id: dragId });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, touchAction: "none" }}
      {...listeners}
      {...attributes}
      className={cn(
        "group/item flex items-center gap-1.5 px-2 py-1 rounded text-sm hover:bg-accent/40 cursor-grab active:cursor-grabbing transition-colors select-none",
        isDragging && "opacity-40"
      )}
    >
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="flex-1 truncate text-xs leading-tight">{label}</span>
      <button
        type="button"
        onMouseDown={e => e.stopPropagation()}
        onClick={onRemove}
        className="shrink-0 opacity-0 group-hover/item:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Edit: sortable category block ─────────────────────────────────────────────

interface OrderedItem {
  dragId: string;
  icon: React.ReactNode;
  label: string;
  onRemove: () => void;
}

interface SortableCatBlockProps {
  cat: SidebarCategory;
  itemOrderIds: string[];
  orderedItems: OrderedItem[];
  isRenaming: boolean;
  renameDraft: { emoji: string; name: string };
  onRenameDraftChange: (d: { emoji: string; name: string }) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onRemoveCategory: () => void;
  isAddOpen: boolean;
  onToggleAdd: () => void;
  addPanel: React.ReactNode;
  collapsed: boolean;
  onToggleCollapse: () => void;
  inputClass: string;
}

function SortableCatBlock(props: SortableCatBlockProps) {
  const {
    cat, itemOrderIds, orderedItems,
    isRenaming, renameDraft, onRenameDraftChange, onSaveRename, onCancelRename, onStartRename,
    onRemoveCategory, isAddOpen, onToggleAdd, addPanel,
    collapsed, onToggleCollapse, inputClass,
  } = props;

  const { setNodeRef, listeners, attributes, transform, transition, isDragging } =
    useSortable({ id: `cat:${cat.id}` });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div ref={setNodeRef} style={style} className={cn("select-none", isDragging && "opacity-40")}>
      {/* Header — whole row is the category drag handle */}
      <div
        {...listeners}
        {...attributes}
        style={{ touchAction: "none" }}
        className="group/ch flex items-center gap-1 px-1 py-1 rounded cursor-grab active:cursor-grabbing hover:bg-accent/20 transition-colors"
      >
        <button type="button" onMouseDown={stop} onClick={onToggleCollapse}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {isRenaming ? (
          <>
            <input autoFocus className={cn(inputClass, "w-7 text-center px-0.5")}
              value={renameDraft.emoji} maxLength={2}
              onMouseDown={stop}
              onChange={e => onRenameDraftChange({ ...renameDraft, emoji: e.target.value })} />
            <input className={cn(inputClass, "flex-1 min-w-0")}
              value={renameDraft.name}
              onMouseDown={stop}
              onChange={e => onRenameDraftChange({ ...renameDraft, name: e.target.value })}
              onKeyDown={e => { if (e.key === "Enter") onSaveRename(); if (e.key === "Escape") onCancelRename(); }}
              placeholder="Nom" />
            <button type="button" onMouseDown={stop} onClick={onSaveRename} className="shrink-0 p-0.5 rounded text-green-600 hover:bg-accent/50"><Check className="w-3.5 h-3.5" /></button>
            <button type="button" onMouseDown={stop} onClick={onCancelRename} className="shrink-0 p-0.5 rounded text-muted-foreground hover:bg-accent/50"><X className="w-3.5 h-3.5" /></button>
          </>
        ) : (
          <>
            <span className="text-xs shrink-0">{cat.emoji}</span>
            <span className="flex-1 truncate text-xs font-semibold text-muted-foreground uppercase tracking-wide">{cat.name}</span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover/ch:opacity-100 transition-opacity">
              <button type="button" onMouseDown={stop} onClick={onStartRename} className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"><Pencil className="w-3 h-3" /></button>
              <button type="button" onMouseDown={stop} onClick={onRemoveCategory} className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-accent/50 transition-colors"><Trash2 className="w-3 h-3" /></button>
            </div>
          </>
        )}

        <button type="button" onMouseDown={stop} onClick={onToggleAdd}
          className="shrink-0 opacity-0 group-hover/ch:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Items — droppable zone + sortable items */}
      <DroppableZone id={cat.id} collapsed={collapsed}>
        <SortableContext items={itemOrderIds} strategy={verticalListSortingStrategy}>
          <div className="pl-4 space-y-0.5 pb-1">
            {orderedItems.map(item => (
              <SortableItemRow key={item.dragId} dragId={item.dragId}
                icon={item.icon} label={item.label} onRemove={item.onRemove} />
            ))}
            {orderedItems.length === 0 && !isAddOpen && (
              <p className="px-2 py-0.5 text-xs text-muted-foreground/50 italic">Vide</p>
            )}
            {isAddOpen && addPanel}
          </div>
        </SortableContext>
      </DroppableZone>
    </div>
  );
}

// ── Edit: add item panel ──────────────────────────────────────────────────────

function AddItemPanel({ availablePages, availableForms, onAddPage, onAddForm, onAddLink, onClose, inputClass }: {
  availablePages: AdminPage[];
  availableForms: FormInstance[];
  onAddPage: (id: string) => void;
  onAddForm: (id: string) => void;
  onAddLink: (d: { label: string; href: string }) => void;
  onClose: () => void;
  inputClass: string;
}) {
  const [mode, setMode] = useState<"pick" | "page" | "form" | "link">("pick");
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");

  if (mode === "pick") return (
    <div className="flex flex-wrap items-center gap-1 py-1">
      {availablePages.length > 0 && (
        <button type="button" onMouseDown={e => e.stopPropagation()} onClick={() => setMode("page")}
          className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-border hover:bg-accent/50 transition-colors">
          <LayoutDashboard className="w-3 h-3" /> Page
        </button>
      )}
      <button type="button" onMouseDown={e => e.stopPropagation()} disabled={availableForms.length === 0} onClick={() => setMode("form")}
        className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-border hover:bg-accent/50 disabled:opacity-40 transition-colors">
        <FileText className="w-3 h-3" /> Form
      </button>
      <button type="button" onMouseDown={e => e.stopPropagation()} onClick={() => setMode("link")}
        className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-border hover:bg-accent/50 transition-colors">
        <Link2 className="w-3 h-3" /> Lien
      </button>
      <button type="button" onMouseDown={e => e.stopPropagation()} onClick={onClose} className="ml-auto p-0.5 rounded text-muted-foreground hover:bg-accent/50"><X className="w-3 h-3" /></button>
    </div>
  );

  if (mode === "page") return (
    <div className="flex items-center gap-1 py-1">
      <select autoFocus className={cn(inputClass, "flex-1 text-xs h-6")} defaultValue=""
        onMouseDown={e => e.stopPropagation()}
        onChange={e => { if (e.target.value) { onAddPage(e.target.value); onClose(); } }}>
        <option value="" disabled>Choisir…</option>
        {availablePages.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select>
      <button type="button" onMouseDown={e => e.stopPropagation()} onClick={onClose} className="shrink-0 p-0.5 rounded text-muted-foreground hover:bg-accent/50"><X className="w-3 h-3" /></button>
    </div>
  );

  if (mode === "form") return (
    <div className="flex items-center gap-1 py-1">
      <select autoFocus className={cn(inputClass, "flex-1 text-xs h-6")} defaultValue=""
        onMouseDown={e => e.stopPropagation()}
        onChange={e => { if (e.target.value) { onAddForm(e.target.value); onClose(); } }}>
        <option value="" disabled>Choisir…</option>
        {availableForms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <button type="button" onMouseDown={e => e.stopPropagation()} onClick={onClose} className="shrink-0 p-0.5 rounded text-muted-foreground hover:bg-accent/50"><X className="w-3 h-3" /></button>
    </div>
  );

  return (
    <div className="space-y-1 py-1">
      <input autoFocus className={cn(inputClass, "w-full text-xs h-6")} placeholder="Label"
        onMouseDown={e => e.stopPropagation()} value={label} onChange={e => setLabel(e.target.value)} />
      <div className="flex gap-1">
        <input className={cn(inputClass, "flex-1 text-xs h-6")} placeholder="URL"
          onMouseDown={e => e.stopPropagation()} value={href} onChange={e => setHref(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && label && href) { onAddLink({ label, href }); onClose(); } }} />
        <button type="button" onMouseDown={e => e.stopPropagation()} disabled={!label.trim() || !href.trim()}
          onClick={() => { onAddLink({ label, href }); onClose(); }}
          className="shrink-0 p-0.5 rounded text-green-600 hover:bg-accent/50 disabled:opacity-40"><Check className="w-3.5 h-3.5" /></button>
        <button type="button" onMouseDown={e => e.stopPropagation()} onClick={onClose} className="shrink-0 p-0.5 rounded text-muted-foreground hover:bg-accent/50"><X className="w-3 h-3" /></button>
      </div>
    </div>
  );
}

// ── AdminSidebar ──────────────────────────────────────────────────────────────

interface AdminSidebarProps {
  userEmail: string;
  pages: AdminPage[];
  features?: AdminFeatures;
  branding?: AdminBrandingConfig;
  initialSidebarLayout?: SidebarLayout | null;
  pinnedFormMeta?: { id: string; name: string; slug: string }[];
  onClose?: () => void;
}

export function AdminSidebar({
  userEmail, pages = [], features, branding,
  initialSidebarLayout, pinnedFormMeta = [], onClose,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const { themeMode } = useUserPreferences();
  const role = useUserRole();
  const { hasEmail, hasRecoveryCodes, accessibleFormIds } = useUserCtx();
  const tr = useTranslations();

  const [layout, setLayout] = useState<SidebarLayout>(initialSidebarLayout ?? {});
  const [editMode, setEditMode] = useState(false);
  const [allFormsMeta, setAllFormsMeta] = useState<FormInstance[]>([]);

  // Edit UI state
  const [renamingCatId, setRenamingCatId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState({ emoji: "", name: "" });
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [editCollapsed, setEditCollapsed] = useState<Record<string, boolean>>({});
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // View UI state
  const [viewCollapsed, setViewCollapsed] = useState<Record<string, boolean>>({});

  // Pre-drag snapshot for cancel/revert
  const preDragLayoutRef = useRef<SidebarLayout | null>(null);

  // ── Persist ────────────────────────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((next: SidebarLayout) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/account/sidebar-layout", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (res.ok) toast.success(tr.admin.config.sidebar.saved, { duration: 1200 });
      } catch { /* silent */ }
    }, 400);
  }, [tr.admin.config.sidebar.saved]);

  function update(next: SidebarLayout) { setLayout(next); persist(next); }

  const enterEdit = useCallback(async () => {
    setEditMode(true);
    if (allFormsMeta.length === 0) {
      const res = await fetch("/api/admin/forms").catch(() => null);
      if (res?.ok) {
        const data: FormInstance[] = await res.json().catch(() => []);
        setAllFormsMeta(data);
      }
    }
  }, [allFormsMeta.length]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const pinnedForms = layout.pinnedForms ?? [];
  const customLinks = layout.customLinks ?? [];
  const categories  = layout.categories  ?? [];

  const formMetaById: Record<string, { id: string; name: string; slug: string }> = {};
  for (const f of pinnedFormMeta) formMetaById[f.id] = f;
  for (const f of allFormsMeta)   formMetaById[f.id] = { id: f.id, name: f.name, slug: f.slug };
  const linkById = Object.fromEntries(customLinks.map(l => [l.id, l]));
  const pageById = Object.fromEntries(pages.map(p => [p.id, p]));

  const catFormIds = new Set(categories.flatMap(c => c.formIds));
  const catLinkIds = new Set(categories.flatMap(c => c.linkIds ?? []));
  const catPageIds = new Set(categories.flatMap(c => c.pageIds ?? []));

  const uncatFormIds = pinnedForms.filter(id => !catFormIds.has(id));
  const uncatLinks   = customLinks.filter(l => !catLinkIds.has(l.id));

  const visiblePages = accessibleFormIds === "all"
    ? pages
    : pages.filter(p => !p.formInstanceId || accessibleFormIds.includes(p.formInstanceId));

  const uncatPages = visiblePages.filter(p => !catPageIds.has(p.id));

  const availableForms = allFormsMeta.filter(f => !pinnedForms.includes(f.id));

  const resolvedPinnedMeta = pinnedForms
    .map(id => formMetaById[id])
    .filter(Boolean) as { id: string; name: string; slug: string }[];

  const hasPinnedSection = pinnedForms.length > 0 || customLinks.length > 0 || catPageIds.size > 0;

  const appName = branding?.appName || "Formellia";
  const logoUrl = themeMode === "dark"
    ? (branding?.logoDarkUrl || branding?.logoUrl)
    : (branding?.logoLightUrl || branding?.logoUrl);

  function isActive(href: string) { return pathname === href || pathname.startsWith(href + "/"); }

  // ── Mutations ──────────────────────────────────────────────────────────────

  function addPageToCategory(catId: string, pageId: string) {
    let cats = categories.map(c => {
      const order = getItemOrder(c).filter(id => id !== `page:${pageId}`);
      return { ...c, pageIds: (c.pageIds ?? []).filter(p => p !== pageId), itemOrder: order };
    });
    if (catId !== UNCAT) {
      cats = cats.map(c => c.id === catId ? {
        ...c,
        pageIds: [...(c.pageIds ?? []), pageId],
        itemOrder: [...getItemOrder(c).filter(id => id !== `page:${pageId}`), `page:${pageId}`],
      } : c);
    }
    update({ ...layout, categories: cats });
  }

  function addFormToCategory(catId: string, formId: string) {
    const nextPinned = pinnedForms.includes(formId) ? pinnedForms : [...pinnedForms, formId];
    const nextCats = catId === UNCAT
      ? categories
      : categories.map(c => c.id === catId ? {
          ...c,
          formIds: [...c.formIds, formId],
          itemOrder: [...getItemOrder(c), `form:${formId}`],
        } : c);
    update({ ...layout, pinnedForms: nextPinned, categories: nextCats });
  }

  function addLinkToCategory(catId: string, d: { label: string; href: string }) {
    const newLink: SidebarCustomLink = { id: crypto.randomUUID(), label: d.label.trim(), href: d.href.trim() };
    const nextLinks = [...customLinks, newLink];
    const nextCats = catId === UNCAT
      ? categories
      : categories.map(c => c.id === catId ? {
          ...c,
          linkIds: [...(c.linkIds ?? []), newLink.id],
          itemOrder: [...getItemOrder(c), `link:${newLink.id}`],
        } : c);
    update({ ...layout, customLinks: nextLinks, categories: nextCats });
  }

  function removePageFromCategory(pageId: string) {
    update({
      ...layout,
      categories: categories.map(c => ({
        ...c,
        pageIds: (c.pageIds ?? []).filter(p => p !== pageId),
        itemOrder: getItemOrder(c).filter(id => id !== `page:${pageId}`),
      })),
    });
  }

  function removeForm(formId: string) {
    update({
      ...layout,
      pinnedForms: pinnedForms.filter(f => f !== formId),
      categories: categories.map(c => ({
        ...c,
        formIds: c.formIds.filter(f => f !== formId),
        itemOrder: getItemOrder(c).filter(id => id !== `form:${formId}`),
      })),
    });
  }

  function removeLink(linkId: string) {
    update({
      ...layout,
      customLinks: customLinks.filter(l => l.id !== linkId),
      categories: categories.map(c => ({
        ...c,
        linkIds: (c.linkIds ?? []).filter(l => l !== linkId),
        itemOrder: getItemOrder(c).filter(id => id !== `link:${linkId}`),
      })),
    });
  }

  function addCategory() {
    const newCat: SidebarCategory = {
      id: crypto.randomUUID(),
      name: tr.admin.config.sidebar.newCategoryName,
      emoji: tr.admin.config.sidebar.emojiPlaceholder,
      formIds: [], linkIds: [], pageIds: [], itemOrder: [],
    };
    update({ ...layout, categories: [...categories, newCat] });
    setRenamingCatId(newCat.id);
    setRenameDraft({ emoji: newCat.emoji, name: newCat.name });
  }

  function saveRename() {
    if (!renamingCatId) return;
    update({
      ...layout,
      categories: categories.map(c =>
        c.id === renamingCatId
          ? { ...c, emoji: renameDraft.emoji.trim() || "📁", name: renameDraft.name.trim() || c.name }
          : c
      ),
    });
    setRenamingCatId(null);
  }

  function removeCategory(catId: string) {
    update({ ...layout, categories: categories.filter(c => c.id !== catId) });
  }

  // ── DnD ───────────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const activeId = args.active.id.toString();
    if (activeId.startsWith("cat:")) {
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(d => d.id.toString().startsWith("cat:")) });
    }
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(d => !d.id.toString().startsWith("cat:")) });
  }, []);

  function onDragStart({ active }: DragStartEvent) {
    setActiveDragId(active.id.toString());
    preDragLayoutRef.current = layout;
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeId = active.id.toString();
    const overId   = over.id.toString();
    if (activeId === overId) return;
    if (activeId.startsWith("cat:")) return;

    const cats = layout.categories ?? [];

    const activeCatId = findItemCatId(activeId, cats) ?? UNCAT;
    const overIsItem  = overId.startsWith("page:") || overId.startsWith("form:") || overId.startsWith("link:");
    const overCatId   = overIsItem ? (findItemCatId(overId, cats) ?? UNCAT) : overId;

    if (activeCatId === overCatId) {
      // ── Same container ──────────────────────────────────────────────────
      if (activeCatId === UNCAT) {
        // Within UNCAT: reorder same-type arrays
        if (activeId.startsWith("form:") && overId.startsWith("form:")) {
          setLayout(prev => {
            const pins = prev.pinnedForms ?? [];
            const ai = pins.indexOf(activeId.slice(5));
            const bi = pins.indexOf(overId.slice(5));
            if (ai === -1 || bi === -1) return prev;
            return { ...prev, pinnedForms: arrayMove(pins, ai, bi) };
          });
        } else if (activeId.startsWith("link:") && overId.startsWith("link:")) {
          setLayout(prev => {
            const links = prev.customLinks ?? [];
            const ai = links.findIndex(l => `link:${l.id}` === activeId);
            const bi = links.findIndex(l => `link:${l.id}` === overId);
            if (ai === -1 || bi === -1) return prev;
            return { ...prev, customLinks: arrayMove(links, ai, bi) };
          });
        }
        return;
      }
      // Within a category: reorder itemOrder
      if (!overIsItem) return; // hovering empty zone, skip
      setLayout(prev => {
        const prevCats = prev.categories ?? [];
        const newCats = prevCats.map(c => {
          if (c.id !== activeCatId) return c;
          const order = getItemOrder(c);
          const ai = order.indexOf(activeId);
          const bi = order.indexOf(overId);
          if (ai === -1 || bi === -1) return c;
          return { ...c, itemOrder: arrayMove(order, ai, bi) };
        });
        return { ...prev, categories: newCats };
      });
      return;
    }

    // ── Cross-container ───────────────────────────────────────────────────
    const type  = activeId.startsWith("page:") ? "page" : activeId.startsWith("form:") ? "form" : "link";
    const rawId = activeId.slice(5);

    setLayout(prev => {
      const prevCats = prev.categories ?? [];
      let newCats = prevCats.map(c => {
        // Remove from source
        if (c.id === activeCatId) {
          return {
            ...c,
            pageIds:   type === "page" ? (c.pageIds ?? []).filter(id => id !== rawId) : (c.pageIds ?? []),
            formIds:   type === "form" ? c.formIds.filter(id => id !== rawId) : c.formIds,
            linkIds:   type === "link" ? (c.linkIds ?? []).filter(id => id !== rawId) : (c.linkIds ?? []),
            itemOrder: getItemOrder(c).filter(id => id !== activeId),
          };
        }
        // Add to target category
        if (c.id === overCatId) {
          const order   = getItemOrder(c).filter(id => id !== activeId);
          const insertAt = overIsItem ? order.indexOf(overId) : -1;
          const newOrder = insertAt >= 0
            ? [...order.slice(0, insertAt), activeId, ...order.slice(insertAt)]
            : [...order, activeId];
          return {
            ...c,
            pageIds:   type === "page" ? [...(c.pageIds ?? []), rawId] : (c.pageIds ?? []),
            formIds:   type === "form" ? [...c.formIds, rawId] : c.formIds,
            linkIds:   type === "link" ? [...(c.linkIds ?? []), rawId] : (c.linkIds ?? []),
            itemOrder: newOrder,
          };
        }
        return c;
      });

      // If target is UNCAT: item just falls out of its source category — no explicit UNCAT order
      // (already handled above by removing from source)

      return { ...prev, categories: newCats };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveDragId(null);
    const preDrag = preDragLayoutRef.current;
    preDragLayoutRef.current = null;

    if (!over) {
      if (preDrag) setLayout(preDrag);
      return;
    }

    const activeId = active.id.toString();
    const overId   = over.id.toString();

    if (activeId.startsWith("cat:") && overId.startsWith("cat:")) {
      // Category reorder: onDragOver didn't touch layout, do it here
      setLayout(prev => {
        const cats = prev.categories ?? [];
        const from = cats.findIndex(c => `cat:${c.id}` === activeId);
        const to   = cats.findIndex(c => `cat:${c.id}` === overId);
        if (from === -1 || to === -1) return prev;
        const next = { ...prev, categories: arrayMove(cats, from, to) };
        persist(next);
        return next;
      });
      return;
    }

    // Item drag: layout already updated live in onDragOver — just persist
    setLayout(current => {
      persist(current);
      return current;
    });
  }

  function onDragCancel() {
    setActiveDragId(null);
    const preDrag = preDragLayoutRef.current;
    preDragLayoutRef.current = null;
    if (preDrag) setLayout(preDrag);
  }

  function renderOverlay() {
    if (!activeDragId) return null;
    if (activeDragId.startsWith("cat:")) {
      const cat = categories.find(c => `cat:${c.id}` === activeDragId);
      if (!cat) return null;
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-card border border-border shadow-lg text-xs font-semibold uppercase tracking-wide cursor-grabbing">
          <span>{cat.emoji}</span><span>{cat.name}</span>
        </div>
      );
    }
    const isPage = activeDragId.startsWith("page:");
    const isForm = activeDragId.startsWith("form:");
    const rawId  = activeDragId.slice(5);
    const label  = isPage ? (pageById[rawId]?.title ?? rawId)
                 : isForm ? (formMetaById[rawId]?.name ?? rawId)
                 : (linkById[rawId]?.label ?? rawId);
    const icon = isPage
      ? <PageIcon name={pageById[rawId]?.icon} className="w-3.5 h-3.5 text-muted-foreground" />
      : isForm
        ? <FileText className="w-3.5 h-3.5 text-muted-foreground" />
        : <Link2 className="w-3.5 h-3.5 text-muted-foreground" />;
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-card border border-border shadow-lg text-xs cursor-grabbing">
        {icon}<span className="truncate max-w-[140px]">{label}</span>
      </div>
    );
  }

  const inputClass = "h-6 px-1.5 text-xs border border-input rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50";

  // ── Render helpers ─────────────────────────────────────────────────────────

  /** Build ordered item list for a category (edit mode). */
  function buildOrderedItems(cat: SidebarCategory): OrderedItem[] {
    const order = getItemOrder(cat);
    return order.flatMap(pid => {
      if (pid.startsWith("page:")) {
        const p = pageById[pid.slice(5)];
        if (!p) return [];
        return [{ dragId: pid, icon: <PageIcon name={p.icon} className="w-3.5 h-3.5 text-muted-foreground" />, label: p.title, onRemove: () => removePageFromCategory(p.id) }];
      }
      if (pid.startsWith("form:")) {
        const f = formMetaById[pid.slice(5)];
        if (!f) return [];
        return [{ dragId: pid, icon: <FileText className="w-3.5 h-3.5 text-muted-foreground" />, label: f.name, onRemove: () => removeForm(f.id) }];
      }
      if (pid.startsWith("link:")) {
        const l = linkById[pid.slice(5)];
        if (!l) return [];
        return [{ dragId: pid, icon: <Link2 className="w-3.5 h-3.5 text-muted-foreground" />, label: l.label, onRemove: () => removeLink(l.id) }];
      }
      return [];
    });
  }

  /** Build ordered item list for view mode (a category). */
  function buildViewItems(cat: SidebarCategory): Array<
    | { type: "page"; item: AdminPage }
    | { type: "form"; item: { id: string; name: string; slug: string } }
    | { type: "link"; item: SidebarCustomLink }
  > {
    const order = getItemOrder(cat);
    const result: Array<
      | { type: "page"; item: AdminPage }
      | { type: "form"; item: { id: string; name: string; slug: string } }
      | { type: "link"; item: SidebarCustomLink }
    > = [];
    for (const pid of order) {
      if (pid.startsWith("page:")) {
        const p = pageById[pid.slice(5)];
        if (p) result.push({ type: "page", item: p });
      } else if (pid.startsWith("form:")) {
        const f = formMetaById[pid.slice(5)];
        if (f) result.push({ type: "form", item: f });
      } else if (pid.startsWith("link:")) {
        const l = linkById[pid.slice(5)];
        if (l) result.push({ type: "link", item: l });
      }
    }
    return result;
  }

  // UNCAT item IDs for SortableContext
  const uncatItemIds = [
    ...uncatPages.map(p => `page:${p.id}`),
    ...uncatFormIds.map(id => `form:${id}`),
    ...uncatLinks.map(l => `link:${l.id}`),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <aside className="flex flex-col w-56 shrink-0 h-screen border-r border-border bg-card overflow-hidden">

      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 h-14 shrink-0 border-b border-border">
        {logoUrl ? (
          <Image src={logoUrl} alt={appName} width={28} height={28} unoptimized
            style={{ width: "28px", height: "28px", objectFit: "contain" }} className="shrink-0" />
        ) : (
          <Image src="/formellia-logo-transparent.png" alt={appName} width={28} height={28}
            style={{ width: "28px", height: "28px" }} className="shrink-0" />
        )}
        <span className="font-semibold text-sm tracking-tight flex-1 truncate">{appName}</span>
        {role !== "viewer" && (
          <button type="button" onClick={editMode ? () => setEditMode(false) : enterEdit}
            title={editMode ? "Terminer" : tr.admin.config.sidebar.tab}
            className={cn("p-1 rounded transition-colors shrink-0",
              editMode ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
            {editMode ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* ── Edit mode ─────────────────────────────────────────────────────── */}
      {editMode ? (
        <DndContext sensors={sensors} collisionDetection={collisionDetection}
          modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
          onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">

            {/* Uncategorized */}
            {(uncatPages.length > 0 || uncatFormIds.length > 0 || uncatLinks.length > 0 || categories.length === 0) && (
              <div className="mb-1">
                <div className="group/uch flex items-center gap-1 px-1 py-1">
                  <button type="button" onClick={() => setEditCollapsed(p => ({ ...p, [UNCAT]: !p[UNCAT] }))}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                    {editCollapsed[UNCAT] ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  <span className="flex-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Uncategorized</span>
                  <button type="button" onClick={() => setAddingTo(addingTo === UNCAT ? null : UNCAT)}
                    className="shrink-0 opacity-0 group-hover/uch:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <DroppableZone id={UNCAT} collapsed={!!editCollapsed[UNCAT]}>
                  <SortableContext items={uncatItemIds} strategy={verticalListSortingStrategy}>
                    <div className="pl-4 space-y-0.5 pb-1">
                      {uncatPages.map(p => (
                        <SortableItemRow key={`page:${p.id}`} dragId={`page:${p.id}`}
                          icon={<PageIcon name={p.icon} className="w-3.5 h-3.5 text-muted-foreground" />}
                          label={p.title} onRemove={() => removePageFromCategory(p.id)} />
                      ))}
                      {uncatFormIds.map(fid => {
                        const f = formMetaById[fid];
                        if (!f) return null;
                        return <SortableItemRow key={`form:${fid}`} dragId={`form:${fid}`}
                          icon={<FileText className="w-3.5 h-3.5 text-muted-foreground" />}
                          label={f.name} onRemove={() => removeForm(fid)} />;
                      })}
                      {uncatLinks.map(l => (
                        <SortableItemRow key={`link:${l.id}`} dragId={`link:${l.id}`}
                          icon={<Link2 className="w-3.5 h-3.5 text-muted-foreground" />}
                          label={l.label} onRemove={() => removeLink(l.id)} />
                      ))}
                      {uncatPages.length === 0 && uncatFormIds.length === 0 && uncatLinks.length === 0 && addingTo !== UNCAT && (
                        <p className="px-2 py-0.5 text-xs text-muted-foreground/50 italic">Vide</p>
                      )}
                      {addingTo === UNCAT && (
                        <AddItemPanel
                          availablePages={visiblePages.filter(p => !catPageIds.has(p.id))}
                          availableForms={availableForms}
                          onAddPage={pid => { addPageToCategory(UNCAT, pid); setAddingTo(null); }}
                          onAddForm={fid => { addFormToCategory(UNCAT, fid); setAddingTo(null); }}
                          onAddLink={d => { addLinkToCategory(UNCAT, d); setAddingTo(null); }}
                          onClose={() => setAddingTo(null)}
                          inputClass={inputClass}
                        />
                      )}
                    </div>
                  </SortableContext>
                </DroppableZone>
              </div>
            )}

            {/* Sortable categories */}
            <SortableContext items={categories.map(c => `cat:${c.id}`)} strategy={verticalListSortingStrategy}>
              {categories.map(cat => {
                const itemOrderIds  = getItemOrder(cat);
                const orderedItems  = buildOrderedItems(cat);
                const availPagesForCat = visiblePages.filter(p => !(cat.pageIds ?? []).includes(p.id));
                return (
                  <SortableCatBlock
                    key={cat.id}
                    cat={cat}
                    itemOrderIds={itemOrderIds}
                    orderedItems={orderedItems}
                    isRenaming={renamingCatId === cat.id}
                    renameDraft={renameDraft}
                    onRenameDraftChange={setRenameDraft}
                    onSaveRename={saveRename}
                    onCancelRename={() => setRenamingCatId(null)}
                    onStartRename={() => { setRenamingCatId(cat.id); setRenameDraft({ emoji: cat.emoji, name: cat.name }); }}
                    onRemoveCategory={() => removeCategory(cat.id)}
                    isAddOpen={addingTo === cat.id}
                    onToggleAdd={() => setAddingTo(addingTo === cat.id ? null : cat.id)}
                    addPanel={
                      <AddItemPanel
                        availablePages={availPagesForCat}
                        availableForms={availableForms}
                        onAddPage={pid => { addPageToCategory(cat.id, pid); setAddingTo(null); }}
                        onAddForm={fid => { addFormToCategory(cat.id, fid); setAddingTo(null); }}
                        onAddLink={d => { addLinkToCategory(cat.id, d); setAddingTo(null); }}
                        onClose={() => setAddingTo(null)}
                        inputClass={inputClass}
                      />
                    }
                    collapsed={!!editCollapsed[cat.id]}
                    onToggleCollapse={() => setEditCollapsed(p => ({ ...p, [cat.id]: !p[cat.id] }))}
                    inputClass={inputClass}
                  />
                );
              })}
            </SortableContext>

            <button type="button" onClick={addCategory}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-foreground/30 hover:bg-accent/20 transition-colors">
              <FolderPlus className="w-3.5 h-3.5" />
              {tr.admin.config.sidebar.addCategory}
            </button>
          </div>

          <DragOverlay dropAnimation={{ duration: 120, easing: "ease" }}>
            {renderOverlay()}
          </DragOverlay>
        </DndContext>

      ) : (
        /* ── View mode ──────────────────────────────────────────────────── */
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">

          {/* Pages not in any category */}
          {uncatPages.map(page => {
            const href = `/admin/${page.slug}`;
            const active = isActive(href);
            return (
              <Link key={page.id} href={href} onClick={onClose}
                className={cn("flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                  active ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
                <PageIcon name={page.icon} className="w-4 h-4 shrink-0" />
                <span className="truncate">{page.title}</span>
              </Link>
            );
          })}

          {/* Pinned section: categories + uncategorized forms/links */}
          {hasPinnedSection && (
            <>
              {(uncatPages.length > 0) && <div className="my-1 border-t border-border/50" />}

              {categories.map(cat => {
                const viewItems = buildViewItems(cat);
                if (viewItems.length === 0) return null;
                const collapsed = viewCollapsed[cat.id];
                return (
                  <div key={cat.id}>
                    <button type="button" onClick={() => setViewCollapsed(p => ({ ...p, [cat.id]: !p[cat.id] }))}
                      className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors">
                      <span>{cat.emoji}</span>
                      <span className="truncate flex-1 text-left">{cat.name}</span>
                      {collapsed ? <ChevronRight className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                    </button>
                    {!collapsed && (
                      <div className="space-y-0.5">
                        {viewItems.map(entry => {
                          if (entry.type === "page") {
                            const p = entry.item;
                            return (
                              <Link key={`page:${p.id}`} href={`/admin/${p.slug}`} onClick={onClose}
                                className={cn("flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors pl-6",
                                  isActive(`/admin/${p.slug}`) ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
                                <PageIcon name={p.icon} className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{p.title}</span>
                              </Link>
                            );
                          }
                          if (entry.type === "form") {
                            const f = entry.item;
                            return (
                              <Link key={`form:${f.id}`} href={`/${f.slug === "/" ? "" : f.slug}`} onClick={onClose}
                                className={cn("flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors pl-6",
                                  isActive(`/${f.slug}`) ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{f.name}</span>
                              </Link>
                            );
                          }
                          // link
                          const l = entry.item;
                          return (
                            <Link key={`link:${l.id}`} href={safeHref(l.href)} onClick={onClose}
                              target={l.href.startsWith("http") ? "_blank" : undefined}
                              rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
                              className={cn("flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors pl-6",
                                isActive(l.href) ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
                              <PageIcon name={l.icon} className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{l.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Uncategorized pinned forms */}
              {resolvedPinnedMeta.filter(f => !catFormIds.has(f.id)).map(f => (
                <Link key={f.id} href={`/${f.slug === "/" ? "" : f.slug}`} onClick={onClose}
                  className={cn("flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                    isActive(`/${f.slug}`) ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="truncate">{f.name}</span>
                </Link>
              ))}

              {/* Uncategorized custom links */}
              {customLinks.filter(l => !catLinkIds.has(l.id)).map(l => (
                <Link key={l.id} href={safeHref(l.href)} onClick={onClose}
                  target={l.href.startsWith("http") ? "_blank" : undefined}
                  rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className={cn("flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                    isActive(l.href) ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
                  <PageIcon name={l.icon} className="w-4 h-4 shrink-0" />
                  <span className="truncate">{l.label}</span>
                </Link>
              ))}
            </>
          )}

          <div className="my-1 border-t border-border/50" />

          {features?.globalView && (
            <Link href="/admin/global" onClick={onClose}
              className={cn("flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                isActive("/admin/global") ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
              <Globe className="w-4 h-4 shrink-0" /><span>{tr.admin.nav.globalView}</span>
            </Link>
          )}

          {role !== "viewer" && role !== "agent" && (
            <Link href="/admin/configuration" onClick={onClose}
              className={cn("flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                isActive("/admin/configuration") ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
              <Settings2 className="w-4 h-4 shrink-0" /><span>{tr.admin.nav.configuration}</span>
            </Link>
          )}

          {features?.auditLog && role !== "viewer" && role !== "agent" && (
            <Link href="/admin/audit" onClick={onClose}
              className={cn("flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                isActive("/admin/audit") ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
              <ClipboardList className="w-4 h-4 shrink-0" /><span>{tr.admin.nav.auditLog}</span>
            </Link>
          )}
        </nav>
      )}

      {/* Bottom */}
      <div className="border-t border-border p-3 space-y-2 shrink-0">
        <div className="px-2 py-1">
          <p className="text-xs text-muted-foreground truncate" title={userEmail}>{userEmail}</p>
        </div>
        <Link href="/admin/profile" onClick={onClose}
          className={cn("flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm transition-colors",
            isActive("/admin/profile") ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50")}>
          <User className="w-4 h-4" />
          <span>{tr.admin.nav.profile}</span>
          {(!hasEmail || !hasRecoveryCodes) && <span className="ml-auto w-2 h-2 rounded-full bg-orange-500 shrink-0" />}
        </Link>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors cursor-pointer">
            <LogOut className="w-4 h-4" /><span>{tr.admin.nav.logout}</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
