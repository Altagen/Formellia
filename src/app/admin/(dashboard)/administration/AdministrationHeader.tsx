"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";

interface Props {
  /** When set, renders a breadcrumb `Administration → {crumb}` and uses it as the H1 title. */
  crumb?: string;
  /** When set, overrides the default subtitle. */
  subtitle?: string;
}

export function AdministrationHeader({ crumb, subtitle }: Props) {
  const tr = useTranslations();
  const u = tr.admin.config.users;
  const title = crumb ?? u.landingTitle;
  const sub = subtitle ?? (crumb ? undefined : u.landingSubtitle);

  return (
    <div className="space-y-2">
      {crumb && (
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/admin/administration" className="hover:text-foreground transition-colors">
            {u.landingTitle}
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="font-medium text-foreground">{crumb}</span>
        </nav>
      )}
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {sub && <p className="text-sm text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
