"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
  useDroppable, useDraggable,
  type DragStartEvent, type DragEndEvent, type CollisionDetection,
} from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Trash2, Plus, Pencil, Check, X, ChevronDown, ChevronRight,
  FileText, Link2, FolderPlus, GripVertical,
} from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";
import type { FormInstance } from "@/types/formInstance";
import type { SidebarLayout, SidebarCustomLink, SidebarCategory } from "@/types/sidebarLayout";

const UNCATEGORIZED = "__uncategorized__";

// ── Droppable zone (items area inside a category) ───────────────────────────

function DroppableArea({ id, isEmpty, children }: { id: string; isEmpty: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-8 rounded transition-colors ${isOver ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""}`}
    >
      {isEmpty && !isOver && (
        <p className="px-3 py-2 text-xs text-muted-foreground italic">
          No items — click + to add
        </p>
      )}
      {children}
    </div>
  );
}

// ── Draggable item row ───────────────────────────────────────────────────────

interface DraggableItemProps {
  dragId: string;
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onRemove: () => void;
  onEdit?: () => void;
  editContent?: React.ReactNode;
  iconBtn: string;
}

function DraggableItem({ dragId, icon, label, sublabel, onRemove, onEdit, editContent, iconBtn }: DraggableItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId });

  if (editContent) return <div ref={setNodeRef}>{editContent}</div>;

  return (
    <div
      ref={setNodeRef}
      className={`group flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-accent/40 transition-colors ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        style={{ touchAction: "none" }}
        className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="flex-1 text-sm truncate">{label}</span>
      {sublabel && (
        <span className="text-xs text-muted-foreground font-mono truncate max-w-[100px]">{sublabel}</span>
      )}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {onEdit && (
          <button type="button" onClick={onEdit} className={iconBtn} title="Modifier">
            <Pencil className="w-3 h-3" />
          </button>
        )}
        <button type="button" onClick={onRemove} className={iconBtn} title="Retirer">
          <Trash2 className="w-3 h-3 text-destructive/70 hover:text-destructive" />
        </button>
      </div>
    </div>
  );
}

// ── Drag overlay pill (shown while dragging) ─────────────────────────────────

function DragPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card shadow-lg text-sm cursor-grabbing">
      <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="truncate max-w-[180px]">{label}</span>
    </div>
  );
}

// ── Sortable category card ───────────────────────────────────────────────────

interface SortableCategoryCardProps {
  cat: SidebarCategory;
  formItems: FormInstance[];
  linkItems: SidebarCustomLink[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isRenamingThis: boolean;
  renameDraft: { emoji: string; name: string };
  onRenameDraftChange: (d: { emoji: string; name: string }) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onRemoveCategory: () => void;
  isAddOpen: boolean;
  onToggleAdd: () => void;
  addPanel: React.ReactNode;
  editingLinkId: string | null;
  editLinkDraft: { label: string; href: string; icon: string };
  onEditLink: (id: string) => void;
  onEditLinkDraftChange: (d: { label: string; href: string; icon: string }) => void;
  onSaveEditLink: () => void;
  onCancelEditLink: () => void;
  onRemoveForm: (id: string) => void;
  onRemoveLink: (id: string) => void;
  inputClass: string;
  iconBtn: string;
}

function SortableCategoryCard(props: SortableCategoryCardProps) {
  const {
    cat, formItems, linkItems, isCollapsed, onToggleCollapse,
    isRenamingThis, renameDraft, onRenameDraftChange, onSaveRename, onCancelRename, onStartRename,
    onRemoveCategory, isAddOpen, onToggleAdd, addPanel,
    editingLinkId, editLinkDraft, onEditLink, onEditLinkDraftChange, onSaveEditLink, onCancelEditLink,
    onRemoveForm, onRemoveLink, inputClass, iconBtn,
  } = props;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `cat:${cat.id}` });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const total = formItems.length + linkItems.length;

  return (
    <div ref={setNodeRef} style={style} className={`rounded-lg border border-border bg-card overflow-hidden ${isDragging ? "opacity-50 shadow-lg" : ""}`}>
      {/* Header */}
      <div className="group/hdr flex items-center gap-1.5 px-3 py-2 bg-muted/40">
        {/* Collapse */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="shrink-0 p-0.5 rounded hover:bg-accent/50 transition-colors"
        >
          {isCollapsed
            ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          }
        </button>

        {/* Name / rename */}
        {isRenamingThis ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <input
              autoFocus
              className={`${inputClass} w-10 text-center px-1`}
              value={renameDraft.emoji}
              onChange={e => onRenameDraftChange({ ...renameDraft, emoji: e.target.value })}
              maxLength={2}
            />
            <input
              className={`${inputClass} flex-1 min-w-0`}
              value={renameDraft.name}
              onChange={e => onRenameDraftChange({ ...renameDraft, name: e.target.value })}
              onKeyDown={e => { if (e.key === "Enter") onSaveRename(); if (e.key === "Escape") onCancelRename(); }}
              placeholder="Category name"
            />
            <button type="button" onClick={onSaveRename} className={iconBtn}>
              <Check className="w-3.5 h-3.5 text-green-600" />
            </button>
            <button type="button" onClick={onCancelRename} className={iconBtn}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="shrink-0">{cat.emoji}</span>
            <span className="text-sm font-medium truncate flex-1">{cat.name}</span>
            {total > 0 && <span className="text-xs text-muted-foreground shrink-0">({total})</span>}
            <div className="flex items-center gap-0.5 opacity-0 group-hover/hdr:opacity-100 transition-opacity shrink-0">
              <button type="button" onClick={onStartRename} className={iconBtn} title="Rename">
                <Pencil className="w-3 h-3" />
              </button>
              <button type="button" onClick={onRemoveCategory} className={iconBtn} title="Delete">
                <Trash2 className="w-3 h-3 text-destructive/70" />
              </button>
            </div>
          </div>
        )}

        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          style={{ touchAction: "none" }}
          className="shrink-0 cursor-grab active:cursor-grabbing p-1 rounded text-muted-foreground opacity-0 group-hover/hdr:opacity-100 hover:bg-accent/50 transition-opacity"
          title="Reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        {/* Add item */}
        <button
          type="button"
          onClick={onToggleAdd}
          className={`${iconBtn} shrink-0`}
          title="Add"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Items */}
      {!isCollapsed && (
        <div className="py-1">
          <DroppableArea id={cat.id} isEmpty={total === 0 && !isAddOpen}>
            {formItems.map(f => (
              <DraggableItem
                key={f.id}
                dragId={`form:${f.id}`}
                icon={<FileText className="w-3.5 h-3.5" />}
                label={f.name}
                sublabel={`/${f.slug === "/" ? "" : f.slug}`}
                onRemove={() => onRemoveForm(f.id)}
                iconBtn={iconBtn}
              />
            ))}
            {linkItems.map(l => (
              <DraggableItem
                key={l.id}
                dragId={`link:${l.id}`}
                icon={<Link2 className="w-3.5 h-3.5" />}
                label={l.label}
                sublabel={l.href}
                onRemove={() => onRemoveLink(l.id)}
                onEdit={() => onEditLink(l.id)}
                iconBtn={iconBtn}
                editContent={editingLinkId === l.id ? (
                  <div className="px-3 py-2 space-y-1.5 border-l-2 border-primary/50 ml-3">
                    <div className="flex gap-1.5">
                      <input autoFocus className={`${inputClass} flex-1`} value={editLinkDraft.label}
                        onChange={e => onEditLinkDraftChange({ ...editLinkDraft, label: e.target.value })}
                        placeholder="Label" />
                      <input className={`${inputClass} flex-1`} value={editLinkDraft.href}
                        onChange={e => onEditLinkDraftChange({ ...editLinkDraft, href: e.target.value })}
                        placeholder="URL" />
                    </div>
                    <div className="flex gap-1.5 items-center">
                      <input className={`${inputClass} w-32`} value={editLinkDraft.icon}
                        onChange={e => onEditLinkDraftChange({ ...editLinkDraft, icon: e.target.value })}
                        placeholder="Icon (optional)" />
                      <button type="button" onClick={onSaveEditLink} className={iconBtn}>
                        <Check className="w-3.5 h-3.5 text-green-600" />
                      </button>
                      <button type="button" onClick={onCancelEditLink} className={iconBtn}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : undefined}
              />
            ))}
          </DroppableArea>
          {isAddOpen && addPanel}
        </div>
      )}
    </div>
  );
}

// ── AddPanel ─────────────────────────────────────────────────────────────────

interface AddPanelProps {
  availableForms: FormInstance[];
  onAddForm: (id: string) => void;
  onAddLink: (link: { label: string; href: string; icon?: string }) => void;
  onClose: () => void;
  inputClass: string;
  iconBtn: string;
}

function AddPanel({ availableForms, onAddForm, onAddLink, onClose, inputClass, iconBtn }: AddPanelProps) {
  const [mode, setMode] = useState<"pick" | "form" | "link">("pick");
  const [linkDraft, setLinkDraft] = useState({ label: "", href: "", icon: "" });

  if (mode === "pick") {
    return (
      <div className="flex gap-2 px-3 py-2 border-t border-border/50">
        <button type="button" onClick={() => setMode("form")} disabled={availableForms.length === 0}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent/50 transition-colors disabled:opacity-40">
          <FileText className="w-3 h-3" /> Formulaire
        </button>
        <button type="button" onClick={() => setMode("link")}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent/50 transition-colors">
          <Link2 className="w-3 h-3" /> Lien
        </button>
        <button type="button" onClick={onClose} className={`${iconBtn} ml-auto`}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (mode === "form") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border/50">
        <select autoFocus className={`${inputClass} flex-1`} defaultValue=""
          onChange={e => { if (e.target.value) { onAddForm(e.target.value); onClose(); } }}>
          <option value="" disabled>Choisir un formulaire…</option>
          {availableForms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button type="button" onClick={() => setMode("pick")} className={iconBtn}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-t border-border/50 space-y-1.5">
      <div className="flex gap-1.5">
        <input autoFocus className={`${inputClass} flex-1`} placeholder="Label" value={linkDraft.label}
          onChange={e => setLinkDraft(p => ({ ...p, label: e.target.value }))} />
        <input className={`${inputClass} flex-1`} placeholder="URL (https://…)" value={linkDraft.href}
          onChange={e => setLinkDraft(p => ({ ...p, href: e.target.value }))}
          onKeyDown={e => { if (e.key === "Enter" && linkDraft.label && linkDraft.href) { onAddLink(linkDraft); onClose(); } }} />
      </div>
      <div className="flex gap-1.5 items-center">
        <input className={`${inputClass} w-36`} placeholder="Lucide icon (optional)" value={linkDraft.icon}
          onChange={e => setLinkDraft(p => ({ ...p, icon: e.target.value }))} />
        <button type="button" disabled={!linkDraft.label.trim() || !linkDraft.href.trim()}
          onClick={() => { onAddLink(linkDraft); onClose(); }}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
          <Check className="w-3 h-3" /> Ajouter
        </button>
        <button type="button" onClick={() => setMode("pick")} className={iconBtn}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface SidebarTabProps {
  formInstances: FormInstance[];
  onLayoutChange?: (layout: SidebarLayout) => void;
}

export function SidebarTab({ formInstances, onLayoutChange }: SidebarTabProps) {
  const tr = useTranslations();
  const s = tr.admin.config.sidebar;

  const [layout, setLayout] = useState<SidebarLayout>({
    favorites: [], formOrder: [], pinnedForms: [], customLinks: [], categories: [],
  });
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // UI state
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editLinkDraft, setEditLinkDraft] = useState({ label: "", href: "", icon: "" });
  const [renamingCatId, setRenamingCatId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState({ emoji: "", name: "" });

  // Active drag ID (for DragOverlay)
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/account/sidebar-layout")
      .then(r => r.ok ? r.json() : null)
      .then((data: SidebarLayout | null) => {
        if (data) setLayout({ favorites: [], formOrder: [], pinnedForms: [], customLinks: [], categories: [], ...data });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback((next: SidebarLayout) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/account/sidebar-layout", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (res.ok) {
          toast.success(s.saved, { duration: 1200 });
          onLayoutChange?.(next);
        }
      } catch { /* silent */ }
    }, 400);
  }, [s.saved, onLayoutChange]);

  function update(next: SidebarLayout) {
    setLayout(next);
    persist(next);
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const pinnedForms = layout.pinnedForms ?? [];
  const customLinks = layout.customLinks ?? [];
  const categories  = layout.categories ?? [];

  const formById = Object.fromEntries(formInstances.map(f => [f.id, f]));
  const linkById = Object.fromEntries(customLinks.map(l => [l.id, l]));

  const catFormIds = new Set(categories.flatMap(c => c.formIds));
  const catLinkIds = new Set(categories.flatMap(c => c.linkIds ?? []));

  const uncatFormIds = pinnedForms.filter(id => !catFormIds.has(id));
  const uncatLinks   = customLinks.filter(l => !catLinkIds.has(l.id));

  const availableForms = formInstances.filter(f => !pinnedForms.includes(f.id));

  // Map drag IDs → container ID (for onDragEnd lookups)
  const containerOf: Record<string, string> = {};
  for (const id of uncatFormIds) containerOf[`form:${id}`] = UNCATEGORIZED;
  for (const l of uncatLinks)    containerOf[`link:${l.id}`] = UNCATEGORIZED;
  for (const cat of categories) {
    for (const id of cat.formIds) containerOf[`form:${id}`] = cat.id;
    for (const id of cat.linkIds ?? []) containerOf[`link:${id}`] = cat.id;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  function addFormToCategory(catId: string, formId: string) {
    const nextPinned = pinnedForms.includes(formId) ? pinnedForms : [...pinnedForms, formId];
    const nextCats = catId === UNCATEGORIZED
      ? categories
      : categories.map(c => c.id === catId ? { ...c, formIds: [...c.formIds, formId] } : c);
    update({ ...layout, pinnedForms: nextPinned, categories: nextCats });
  }

  function addLinkToCategory(catId: string, draft: { label: string; href: string; icon?: string }) {
    const newLink: SidebarCustomLink = {
      id: crypto.randomUUID(),
      label: draft.label.trim(),
      href: draft.href.trim(),
      ...(draft.icon?.trim() ? { icon: draft.icon.trim() } : {}),
    };
    const nextLinks = [...customLinks, newLink];
    const nextCats = catId === UNCATEGORIZED
      ? categories
      : categories.map(c => c.id === catId ? { ...c, linkIds: [...(c.linkIds ?? []), newLink.id] } : c);
    update({ ...layout, customLinks: nextLinks, categories: nextCats });
  }

  function moveItemToContainer(itemDragId: string, toCatId: string) {
    const isForm = itemDragId.startsWith("form:");
    const rawId  = itemDragId.slice(5); // "form:" and "link:" are both 5 chars

    let cats = categories.map(c => ({
      ...c,
      formIds: isForm ? c.formIds.filter(f => f !== rawId) : c.formIds,
      linkIds: !isForm ? (c.linkIds ?? []).filter(l => l !== rawId) : (c.linkIds ?? []),
    }));

    if (toCatId !== UNCATEGORIZED) {
      cats = cats.map(c => c.id === toCatId ? {
        ...c,
        formIds: isForm ? [...c.formIds, rawId] : c.formIds,
        linkIds: !isForm ? [...(c.linkIds ?? []), rawId] : (c.linkIds ?? []),
      } : c);
    }
    update({ ...layout, categories: cats });
  }

  function removeForm(formId: string) {
    update({
      ...layout,
      pinnedForms: pinnedForms.filter(f => f !== formId),
      categories: categories.map(c => ({ ...c, formIds: c.formIds.filter(f => f !== formId) })),
    });
  }

  function removeLink(linkId: string) {
    update({
      ...layout,
      customLinks: customLinks.filter(l => l.id !== linkId),
      categories: categories.map(c => ({ ...c, linkIds: (c.linkIds ?? []).filter(l => l !== linkId) })),
    });
  }

  function addCategory() {
    const newCat: SidebarCategory = {
      id: crypto.randomUUID(), name: s.newCategoryName, emoji: s.emojiPlaceholder, formIds: [], linkIds: [],
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

  function saveEditLink() {
    if (!editingLinkId) return;
    update({
      ...layout,
      customLinks: customLinks.map(l =>
        l.id === editingLinkId
          ? { ...l, label: editLinkDraft.label.trim(), href: editLinkDraft.href.trim(), ...(editLinkDraft.icon.trim() ? { icon: editLinkDraft.icon.trim() } : { icon: undefined }) }
          : l
      ),
    });
    setEditingLinkId(null);
  }

  // ── DnD ───────────────────────────────────────────────────────────────────

  const sensors = useSensors(
    // MouseSensor calls event.preventDefault() on mousedown immediately,
    // preventing browser scroll before drag activates (unlike PointerSensor).
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Custom collision: categories only match cat: droppables; items only match DroppableAreas.
  // This prevents a dragged category from landing inside the items zone of the card below.
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const activeId = args.active.id.toString();
    if (activeId.startsWith("cat:")) {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(d => d.id.toString().startsWith("cat:")),
      });
    }
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(d => !d.id.toString().startsWith("cat:")),
    });
  }, []);

  function onDragStart({ active }: DragStartEvent) {
    setActiveDragId(active.id.toString());
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    const activeId = active.id.toString();
    const overId   = over.id.toString();

    // ── Category reorder ──────────────────────────────────────────────────
    if (activeId.startsWith("cat:") && overId.startsWith("cat:")) {
      const fromIdx = categories.findIndex(c => `cat:${c.id}` === activeId);
      const toIdx   = categories.findIndex(c => `cat:${c.id}` === overId);
      if (fromIdx !== -1 && toIdx !== -1) {
        update({ ...layout, categories: arrayMove(categories, fromIdx, toIdx) });
      }
      return;
    }

    // ── Item cross-container move ─────────────────────────────────────────
    if (!activeId.startsWith("cat:")) {
      const fromCatId = containerOf[activeId];
      if (!fromCatId) return;

      // Determine target container:
      //   over is a DroppableArea → overId is a catId or UNCATEGORIZED
      //   over is a SortableCategory card → overId is "cat:${id}"
      let toCatId: string;
      if (overId.startsWith("cat:")) {
        toCatId = overId.slice(4);
      } else {
        // overId is a droppable container ID (actual catId or UNCATEGORIZED)
        toCatId = overId;
      }

      if (fromCatId !== toCatId) {
        moveItemToContainer(activeId, toCatId);
      }
    }
  }

  // ── Drag overlay content ──────────────────────────────────────────────────

  function renderOverlay() {
    if (!activeDragId) return null;
    if (activeDragId.startsWith("cat:")) {
      const cat = categories.find(c => `cat:${c.id}` === activeDragId);
      if (!cat) return null;
      return (
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card shadow-xl text-sm font-medium cursor-grabbing">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span>{cat.emoji}</span>
          <span>{cat.name}</span>
        </div>
      );
    }
    if (activeDragId.startsWith("form:")) {
      const f = formById[activeDragId.slice(5)];
      return f ? <DragPill icon={<FileText className="w-3.5 h-3.5" />} label={f.name} /> : null;
    }
    if (activeDragId.startsWith("link:")) {
      const l = linkById[activeDragId.slice(5)];
      return l ? <DragPill icon={<Link2 className="w-3.5 h-3.5" />} label={l.label} /> : null;
    }
    return null;
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputClass = "h-7 px-2 text-sm border border-input rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50";
  const iconBtn = "p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-30 cursor-pointer";

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Chargement…</div>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="space-y-2">

        {/* Uncategorized block (not sortable, always at top when needed) */}
        {(uncatFormIds.length > 0 || uncatLinks.length > 0 || categories.length === 0) && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/40">
              <button
                type="button"
                onClick={() => setCollapsed(p => ({ ...p, [UNCATEGORIZED]: !p[UNCATEGORIZED] }))}
                className="shrink-0 p-0.5 rounded hover:bg-accent/50 transition-colors"
              >
                {collapsed[UNCATEGORIZED]
                  ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                }
              </button>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">
                Uncategorized
              </span>
              <button
                type="button"
                onClick={() => setAddingTo(addingTo === UNCATEGORIZED ? null : UNCATEGORIZED)}
                className={`${iconBtn} shrink-0`}
                title="Add"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {!collapsed[UNCATEGORIZED] && (
              <div className="py-1">
                <DroppableArea id={UNCATEGORIZED} isEmpty={uncatFormIds.length === 0 && uncatLinks.length === 0 && addingTo !== UNCATEGORIZED}>
                  {uncatFormIds.map(fid => {
                    const f = formById[fid];
                    if (!f) return null;
                    return (
                      <DraggableItem key={fid} dragId={`form:${fid}`}
                        icon={<FileText className="w-3.5 h-3.5" />}
                        label={f.name}
                        sublabel={`/${f.slug === "/" ? "" : f.slug}`}
                        onRemove={() => removeForm(fid)}
                        iconBtn={iconBtn}
                      />
                    );
                  })}
                  {uncatLinks.map(l => (
                    <DraggableItem key={l.id} dragId={`link:${l.id}`}
                      icon={<Link2 className="w-3.5 h-3.5" />}
                      label={l.label}
                      sublabel={l.href}
                      onRemove={() => removeLink(l.id)}
                      onEdit={() => { setEditingLinkId(l.id); setEditLinkDraft({ label: l.label, href: l.href, icon: l.icon ?? "" }); }}
                      iconBtn={iconBtn}
                      editContent={editingLinkId === l.id ? (
                        <div className="px-3 py-2 space-y-1.5 border-l-2 border-primary/50 ml-3">
                          <div className="flex gap-1.5">
                            <input autoFocus className={`${inputClass} flex-1`} value={editLinkDraft.label}
                              onChange={e => setEditLinkDraft(p => ({ ...p, label: e.target.value }))} placeholder="Label" />
                            <input className={`${inputClass} flex-1`} value={editLinkDraft.href}
                              onChange={e => setEditLinkDraft(p => ({ ...p, href: e.target.value }))} placeholder="URL" />
                          </div>
                          <div className="flex gap-1.5 items-center">
                            <input className={`${inputClass} w-32`} value={editLinkDraft.icon}
                              onChange={e => setEditLinkDraft(p => ({ ...p, icon: e.target.value }))} placeholder="Icon (optional)" />
                            <button type="button" onClick={saveEditLink} className={iconBtn}>
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            </button>
                            <button type="button" onClick={() => setEditingLinkId(null)} className={iconBtn}>
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : undefined}
                    />
                  ))}
                </DroppableArea>
                {addingTo === UNCATEGORIZED && (
                  <AddPanel
                    availableForms={availableForms}
                    onAddForm={fid => addFormToCategory(UNCATEGORIZED, fid)}
                    onAddLink={draft => addLinkToCategory(UNCATEGORIZED, draft)}
                    onClose={() => setAddingTo(null)}
                    inputClass={inputClass}
                    iconBtn={iconBtn}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Sortable categories */}
        <SortableContext items={categories.map(c => `cat:${c.id}`)} strategy={verticalListSortingStrategy}>
          {categories.map(cat => {
            const catFormItems = cat.formIds.map(id => formById[id]).filter(Boolean) as FormInstance[];
            const catLinkItems = (cat.linkIds ?? []).map(id => linkById[id]).filter(Boolean) as SidebarCustomLink[];
            return (
              <SortableCategoryCard
                key={cat.id}
                cat={cat}
                formItems={catFormItems}
                linkItems={catLinkItems}
                isCollapsed={!!collapsed[cat.id]}
                onToggleCollapse={() => setCollapsed(p => ({ ...p, [cat.id]: !p[cat.id] }))}
                isRenamingThis={renamingCatId === cat.id}
                renameDraft={renameDraft}
                onRenameDraftChange={setRenameDraft}
                onSaveRename={saveRename}
                onCancelRename={() => setRenamingCatId(null)}
                onStartRename={() => { setRenamingCatId(cat.id); setRenameDraft({ emoji: cat.emoji, name: cat.name }); }}
                onRemoveCategory={() => removeCategory(cat.id)}
                isAddOpen={addingTo === cat.id}
                onToggleAdd={() => setAddingTo(addingTo === cat.id ? null : cat.id)}
                addPanel={
                  <AddPanel
                    availableForms={availableForms}
                    onAddForm={fid => addFormToCategory(cat.id, fid)}
                    onAddLink={draft => addLinkToCategory(cat.id, draft)}
                    onClose={() => setAddingTo(null)}
                    inputClass={inputClass}
                    iconBtn={iconBtn}
                  />
                }
                editingLinkId={editingLinkId}
                editLinkDraft={editLinkDraft}
                onEditLink={id => { setEditingLinkId(id); const l = linkById[id]; if (l) setEditLinkDraft({ label: l.label, href: l.href, icon: l.icon ?? "" }); }}
                onEditLinkDraftChange={setEditLinkDraft}
                onSaveEditLink={saveEditLink}
                onCancelEditLink={() => setEditingLinkId(null)}
                onRemoveForm={removeForm}
                onRemoveLink={removeLink}
                inputClass={inputClass}
                iconBtn={iconBtn}
              />
            );
          })}
        </SortableContext>

        {/* Add category */}
        <button
          type="button"
          onClick={addCategory}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-accent/20 transition-colors"
        >
          <FolderPlus className="w-4 h-4" />
          {s.addCategory}
        </button>
      </div>

      <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
        {renderOverlay()}
      </DragOverlay>
    </DndContext>
  );
}
