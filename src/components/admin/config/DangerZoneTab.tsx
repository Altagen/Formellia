"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/context/LocaleContext";

interface DangerZoneTabProps {
  onReset: () => void;
}

export function DangerZoneTab({ onReset }: DangerZoneTabProps) {
  const tr = useTranslations();
  const d = tr.admin.config.danger;
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  function handleReset() {
    if (confirmText !== "RESET") return;
    onReset();
    setShowConfirm(false);
    setConfirmText("");
  }

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border-2 border-red-200 dark:border-red-800 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">{d.title}</h2>
            <p className="text-xs text-muted-foreground mt-1">{d.subtitle}</p>
          </div>
        </div>

        <div className="border border-red-200 dark:border-red-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">{d.resetTitle}</h3>
          <p className="text-xs text-muted-foreground mb-4">
            {d.resetDesc.split("form.config.ts")[0]}
            <code className="font-mono bg-muted px-1 rounded">form.config.ts</code>
            {d.resetDesc.split("form.config.ts")[1]}
          </p>

          {!showConfirm ? (
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {d.resetButton}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-xs text-red-700 dark:text-red-300">{d.warning}</p>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  {d.confirmHint} <strong className="text-red-600">{d.confirmWord}</strong> {d.confirmSuffix}
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full max-w-xs border border-red-300 dark:border-red-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-background text-foreground"
                  placeholder={d.confirmPlaceholder}
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={confirmText !== "RESET"}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {d.confirmButton}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowConfirm(false); setConfirmText(""); }}
                  className="px-4 py-2 bg-background border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  {d.cancel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
