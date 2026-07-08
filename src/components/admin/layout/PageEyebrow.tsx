"use client";

import type { ReactNode } from "react";

type EyebrowStatus = "active" | "inactive";

interface PageEyebrowProps {
  /** Category label, displayed in uppercase. Ex: "FORMULAIRE" */
  category: string;
  /** Monospace slug or identifier. Ex: "ui-form-a-1778874265" */
  slug?: string;
  /** Optional status pill. */
  status?: EyebrowStatus;
  /** Optional translation overrides for status labels. */
  statusLabels?: { active: string; inactive: string };
  /** Extra slot rendered after the status (e.g. badges). */
  extra?: ReactNode;
  className?: string;
}

/**
 * Eyebrow line displayed above a page heading on form-related pages.
 *
 * Example output : `FORMULAIRE · ui-form-a-1778874265 · ACTIF`
 */
export function PageEyebrow({
  category,
  slug,
  status,
  statusLabels = { active: "ACTIF", inactive: "INACTIF" },
  extra,
  className,
}: PageEyebrowProps) {
  const sep = <span className="text-border" aria-hidden>·</span>;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${className ?? ""}`}
    >
      <span className="text-foreground/80">{category}</span>
      {slug && (
        <>
          {sep}
          <span className="font-mono normal-case tracking-normal text-muted-foreground">{slug}</span>
        </>
      )}
      {status && (
        <>
          {sep}
          <span
            className={
              status === "active"
                ? "px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                : "px-2 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground"
            }
          >
            {status === "active" ? statusLabels.active : statusLabels.inactive}
          </span>
        </>
      )}
      {extra}
    </div>
  );
}
