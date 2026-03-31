"use client";

import { useState } from "react";
import { Eye, X } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";

interface PreviewBannerProps {
  formName: string;
}

export function PreviewBanner({ formName }: PreviewBannerProps) {
  const [visible, setVisible] = useState(true);
  const tr = useTranslations();
  const f = tr.admin.config.forms;

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-2 bg-amber-500 text-amber-950 text-sm font-medium shadow-md">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 shrink-0" />
        <span>{f.previewBanner} — <span className="font-semibold">{formName}</span></span>
      </div>
      <button
        onClick={() => setVisible(false)}
        className="flex items-center gap-1 text-xs opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
        aria-label={f.previewBannerClose}
      >
        <X className="w-3.5 h-3.5" />
        {f.previewBannerClose}
      </button>
    </div>
  );
}
