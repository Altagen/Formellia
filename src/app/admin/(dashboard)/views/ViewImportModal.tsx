"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import * as yaml from "js-yaml";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/context/LocaleContext";

interface Props {
  onClose: () => void;
  onSuccess: (result: { created: string[]; updated: string[] }) => void;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function ViewImportModal({ onClose, onSuccess }: Props) {
  const tr = useTranslations();
  const t = tr.admin.viewsList;

  const [yamlText, setYamlText] = useState("");
  const [applying, setApplying] = useState(false);

  const debounced = useDebounce(yamlText, 400);
  const yamlError = (() => {
    if (!debounced.trim()) return null;
    try {
      yaml.load(debounced);
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : "Parse error";
    }
  })();

  const canApply = !!debounced.trim() && yamlError === null && !applying;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleApply() {
    if (!canApply) return;
    setApplying(true);
    try {
      const res = await fetch("/api/admin/views/import", {
        method: "POST",
        headers: { "Content-Type": "application/x-yaml" },
        body: yamlText,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t.networkError);
        return;
      }
      const { created = [], updated = [] } = data as { created: string[]; updated: string[] };
      if (created.length) toast.success(t.importSuccessCreated.replace("{ids}", created.join(", ")));
      if (updated.length) toast.success(t.importSuccessUpdated.replace("{ids}", updated.join(", ")));
      onSuccess({ created, updated });
      onClose();
    } catch {
      toast.error(t.networkError);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-8 px-4"
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg mx-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold">{t.importTitle}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground">{t.importHint}</p>
          <div>
            <textarea
              value={yamlText}
              onChange={e => setYamlText(e.target.value)}
              rows={14}
              spellCheck={false}
              className="w-full font-mono text-xs border border-input rounded-lg px-3 py-2.5 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder={t.importPlaceholder}
            />
            {debounced.trim() && (
              <p className={`text-xs mt-1 ${yamlError ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                {yamlError ? `${t.importYamlInvalid}: ${yamlError}` : `✓ ${t.importYamlValid}`}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 pb-5">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>{t.cancel}</Button>
          <Button type="button" size="sm" disabled={!canApply} onClick={handleApply}>
            {applying ? "…" : t.importApply}
          </Button>
        </div>
      </div>
    </div>
  );
}
