"use client";

import { useTranslations } from "@/lib/context/LocaleContext";
import { ExclusionReasonsEditor } from "./ExclusionReasonsEditor";

interface DataPoolsTabProps {
  exclusionReasons?: string[];
  onChangeExclusionReasons: (reasons: string[]) => void;
}

/**
 * DataPools configuration tab — operator-managed policy for pool operations.
 *
 * Currently holds only the exclusion-reason list, but lives in its own tab
 * (instead of buried inside the Views tab) so future per-deployment DataPool
 * policies (default keyField, retention windows, etc.) have a natural home.
 *
 * The actual /admin/datapools page is unrelated — it's the CRUD UI for pool
 * instances. This tab is for global DataPool *config*, not the data itself.
 */
export function DataPoolsTab({ exclusionReasons, onChangeExclusionReasons }: DataPoolsTabProps) {
  const tr = useTranslations();
  const t = tr.admin.config.dataPoolsTab;

  return (
    <div className="space-y-4">
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
