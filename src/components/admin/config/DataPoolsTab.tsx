"use client";

import Link from "next/link";
import { Database, ArrowRight } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";
import { ExclusionReasonsEditor } from "./ExclusionReasonsEditor";

interface DataPoolsTabProps {
  exclusionReasons?: string[];
  onChangeExclusionReasons: (reasons: string[]) => void;
}

/**
 * DataPools configuration tab — operator-managed policy for pool operations
 * AND single entry point to the pool CRUD page (consolidates the duplicate
 * "DataPools" sidebar entry that lived next to it before 0.3.0 release).
 *
 * Holds the exclusion-reason list today; future per-deployment policies
 * (default keyField, retention windows, etc.) land here.
 */
export function DataPoolsTab({ exclusionReasons, onChangeExclusionReasons }: DataPoolsTabProps) {
  const tr = useTranslations();
  const t = tr.admin.config.dataPoolsTab;

  return (
    <div className="space-y-4">
      {/* Entry point to the CRUD page (formerly a duplicate sidebar nav item) */}
      <Link
        href="/admin/datapools"
        className="flex items-center justify-between gap-3 bg-card rounded-xl border border-border p-5 hover:border-primary/40 hover:bg-accent/20 transition-colors group"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Database className="w-5 h-5 text-primary shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{t.managePoolsTitle}</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.managePoolsDesc}</p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
      </Link>

      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">{t.exclusionReasonsTitle}</h2>
        <p className="text-xs text-muted-foreground mb-4">{t.exclusionReasonsDesc}</p>
        <ExclusionReasonsEditor
          reasons={exclusionReasons ?? []}
          onChange={onChangeExclusionReasons}
          labelAdd={t.exclusionReasonsAdd}
          labelPlaceholder={t.exclusionReasonsPlaceholder}
          labelRemove={t.exclusionReasonsRemove}
          labelEmpty={t.exclusionReasonsEmpty}
        />
      </div>
    </div>
  );
}
