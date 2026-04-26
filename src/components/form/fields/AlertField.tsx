"use client";

import { Info, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";
import type { FieldDef, AlertVariant } from "@/types/config";

interface AlertFieldProps {
  field: FieldDef;
}

const VARIANT_STYLES: Record<AlertVariant, string> = {
  info:    "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200",
  warning: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200",
  error:   "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200",
  success: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200",
};

const ICONS: Record<AlertVariant, typeof Info> = {
  info:    Info,
  warning: AlertTriangle,
  error:   XCircle,
  success: CheckCircle2,
};

export function AlertField({ field }: AlertFieldProps) {
  const variant: AlertVariant = field.alertVariant ?? "info";
  const Icon = ICONS[variant];

  return (
    <div className={`rounded-lg border px-3 py-2.5 text-sm flex items-start gap-2 ${VARIANT_STYLES[variant]}`}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{field.label}</span>
    </div>
  );
}
