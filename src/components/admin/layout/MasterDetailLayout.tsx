"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";

export interface MasterDetailItem {
  id: string;
  label: string;
  icon?: ReactNode;
  pill?: string | number;
  danger?: boolean;
}

export interface MasterDetailSection {
  id: string;
  label: string;
  items: MasterDetailItem[];
}

interface MasterDetailLayoutProps {
  sections: MasterDetailSection[];
  activeId: string;
  onSelect: (id: string) => void;
  children: ReactNode;
  className?: string;
}

/**
 * Master/detail vertical layout : 240px sidebar with sections + content pane.
 *
 * Responsive behaviour :
 *   - ≥ lg (1024px) : sidebar visible, content fills remaining space
 *   - <  lg          : sidebar collapses to a picker dropdown, content takes full width
 *
 * Each section has an uppercase label + a list of items. Items can carry an
 * icon, optional pill (count / badge), and a `danger` flag for the red variant.
 */
export function MasterDetailLayout({
  sections,
  activeId,
  onSelect,
  children,
  className,
}: MasterDetailLayoutProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const tr = useTranslations();
  const md = tr.admin.masterDetail;

  const allItems = sections.flatMap((s) => s.items);
  const active = allItems.find((it) => it.id === activeId);

  function handleSelect(id: string) {
    onSelect(id);
    setPickerOpen(false);
  }

  return (
    <div className={`grid lg:grid-cols-[240px_minmax(0,1fr)] gap-6 ${className ?? ""}`}>
      {/* ─────────────────────────── Sidebar (lg+) ─────────────────────────── */}
      <aside className="hidden lg:block">
        <nav
          className="rounded-xl border border-border bg-card p-1.5 sticky top-4"
          aria-label={md.ariaLabel}
        >
          {sections.map((section, sIdx) => (
            <div key={section.id} className={sIdx > 0 ? "mt-1" : undefined}>
              <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.label}
              </div>
              {section.items.map((item) => (
                <ItemButton
                  key={item.id}
                  item={item}
                  active={item.id === activeId}
                  onClick={() => onSelect(item.id)}
                />
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* ─────────────────────────── Picker (mobile) ─────────────────────────── */}
      <div className="lg:hidden relative">
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card text-left"
          aria-expanded={pickerOpen}
          aria-haspopup="listbox"
        >
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
              {sections.find((s) => s.items.some((i) => i.id === activeId))?.label ?? ""}
            </span>
            <span className="block text-sm font-semibold text-foreground truncate">
              {active?.label ?? ""}
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${pickerOpen ? "rotate-180" : ""}`}
          />
        </button>
        {pickerOpen && (
          <>
            {/* scrim */}
            <div
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setPickerOpen(false)}
            />
            {/* sheet */}
            <div
              className="fixed left-0 right-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card shadow-xl"
              role="listbox"
            >
              <div className="px-4 pt-3 pb-2 flex items-center gap-3 border-b border-border sticky top-0 bg-card">
                <div className="mx-auto w-9 h-1 rounded-full bg-muted-foreground/40" />
              </div>
              <div className="p-1.5">
                {sections.map((section, sIdx) => (
                  <div key={section.id} className={sIdx > 0 ? "mt-1" : undefined}>
                    <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {section.label}
                    </div>
                    {section.items.map((item) => (
                      <ItemButton
                        key={item.id}
                        item={item}
                        active={item.id === activeId}
                        onClick={() => handleSelect(item.id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─────────────────────────── Content pane ─────────────────────────── */}
      <section className="min-w-0">{children}</section>
    </div>
  );
}

function ItemButton({
  item,
  active,
  onClick,
}: {
  item: MasterDetailItem;
  active: boolean;
  onClick: () => void;
}) {
  const baseClasses =
    "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-left transition-colors";
  const activeClasses = item.danger
    ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
    : "bg-accent text-accent-foreground";
  const idleClasses = item.danger
    ? "text-red-700/80 dark:text-red-300/80 hover:bg-red-50 dark:hover:bg-red-900/20"
    : "text-muted-foreground hover:text-foreground hover:bg-muted";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${active ? activeClasses : idleClasses}`}
      aria-current={active ? "page" : undefined}
    >
      {item.icon && (
        <span className="shrink-0 w-4 h-4 flex items-center justify-center">{item.icon}</span>
      )}
      <span className="flex-1 min-w-0 truncate">{item.label}</span>
      {item.pill !== undefined && (
        <span className="shrink-0 text-[11px] font-mono text-muted-foreground">{item.pill}</span>
      )}
      {active && !item.icon && <Check className="w-3.5 h-3.5 shrink-0" />}
    </button>
  );
}
