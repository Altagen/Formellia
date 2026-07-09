"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";

export interface FormContextTab {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  /** If true, opens in a new tab with an external-link icon. */
  external?: boolean;
}

interface FormContextTabsProps {
  tabs: FormContextTab[];
  activeId: string;
  className?: string;
}

/**
 * Horizontal context tabs displayed at the top of form-related admin pages.
 *
 * Example labels: Dashboard · Submissions · Configuration · View public page
 * Scrolls horizontally on small screens.
 */
export function FormContextTabs({ tabs, activeId, className }: FormContextTabsProps) {
  const tr = useTranslations();
  return (
    <nav
      className={`relative -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 border-b border-border ${className ?? ""}`}
      aria-label={tr.admin.formContext.ariaLabel}
    >
      <div className="flex items-stretch gap-1 overflow-x-auto scrollbar-thin -mb-px">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const baseClasses =
            "inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors";
          const activeClasses = "text-foreground border-foreground";
          const idleClasses =
            "text-muted-foreground hover:text-foreground border-transparent hover:border-border";
          return (
            <Link
              key={tab.id}
              href={tab.href}
              target={tab.external ? "_blank" : undefined}
              rel={tab.external ? "noopener noreferrer" : undefined}
              className={`${baseClasses} ${active ? activeClasses : idleClasses}`}
              aria-current={active ? "page" : undefined}
            >
              {tab.icon && <span className="w-4 h-4 shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.external && (
                <ExternalLink className="w-3 h-3 shrink-0 opacity-60" aria-hidden />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
