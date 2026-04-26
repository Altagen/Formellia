"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/context/LocaleContext";
import type { FormInstance } from "@/types/formInstance";
import yaml from "js-yaml";

// ─────────────────────────────────────────────────────────

type ImportSection = "full" | "page" | "form" | "onSubmitActions";
type ImportMode    = "append" | "replace";

interface ImportModalProps {
  /** If set, the modal is in per-form mode (no target dropdown, no mode selector) */
  formId?: string;
  /** List of all instances — used for global mode dropdown */
  instances?: FormInstance[];
  onClose: () => void;
  onSuccess?: (result: { created?: string[]; updated?: string[] }) => void;
}

// Debounce helper
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function ImportModal({ formId, instances, onClose, onSuccess }: ImportModalProps) {
  const tr = useTranslations();
  const f  = tr.admin.config.forms;

  const isGlobal = !formId;

  const [section, setSection]   = useState<ImportSection>("full");
  const [mode, setMode]         = useState<ImportMode>("replace");
  const [targetId, setTargetId] = useState<string>(formId ?? "");
  const [yamlText, setYamlText] = useState("");
  const [applying, setApplying] = useState(false);

  const debouncedYaml = useDebounce(yamlText, 400);

  // Validate YAML client-side for feedback
  const yamlError = (() => {
    if (!debouncedYaml.trim()) return null;
    try {
      yaml.load(debouncedYaml);
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : f.yamlParseError;
    }
  })();

  const isValid  = !!debouncedYaml.trim() && yamlError === null;
  const canApply = isValid && !applying;

  // Keep modal scroll-locked
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape
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
      if (isGlobal) {
        const res = await fetch(`/api/admin/config/import?mode=${mode}`, {
          method: "POST",
          headers: { "Content-Type": "application/yaml" },
          body: yamlText,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? f.networkError);
          return;
        }
        const { created = [], updated = [], errors = [] } = data as { created: string[]; updated: string[]; errors: Array<{ slug: string; message: string }> };
        const detail = f.importSuccessDetail
          .replace("{created}", String(created.length))
          .replace("{updated}", String(updated.length));
        toast.success(`${f.importSuccess} — ${detail}`);
        if (errors.length > 0) {
          toast.warning(errors.map((e: { slug: string; message: string }) => `${e.slug}: ${e.message}`).join("\n"));
        }
        onSuccess?.({ created, updated });
        onClose();
      } else {
        const res = await fetch(`/api/admin/forms/${targetId}/import?section=${section}`, {
          method: "POST",
          headers: { "Content-Type": "application/yaml" },
          body: yamlText,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? f.networkError);
          return;
        }
        toast.success(f.importSuccess);
        onSuccess?.({});
        onClose();
      }
    } catch {
      toast.error(f.networkError);
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
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold">{f.importTitle}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Section selector (per-form mode only) */}
          {!isGlobal && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{f.importTypeLabel}</p>
              <div className="flex flex-wrap gap-2">
                {(["full", "page", "form", "onSubmitActions"] as ImportSection[]).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSection(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      section === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s === "full"            ? f.importTypeFull
                      : s === "page"         ? f.importTypePage
                      : s === "form"         ? f.importTypeForm
                      :                        f.importTypeActions}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Target form selector (global mode only) */}
          {isGlobal && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">{f.importModeLabel}</p>
              <div className="flex gap-4">
                {(["append", "replace"] as ImportMode[]).map(m => (
                  <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value={m}
                      checked={mode === m}
                      onChange={() => setMode(m)}
                      className="accent-primary"
                    />
                    {m === "append" ? f.importModeAppend : f.importModeReplace}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* YAML textarea */}
          <div>
            <textarea
              value={yamlText}
              onChange={e => setYamlText(e.target.value)}
              rows={14}
              spellCheck={false}
              className="w-full font-mono text-xs border border-input rounded-lg px-3 py-2.5 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder={isGlobal ? "version: 1\nforms:\n  - slug: mon-form\n    name: Mon formulaire" : "page:\n  branding:\n    primaryColor: \"#2563eb\""}
            />
            {debouncedYaml.trim() && (
              <p className={`text-xs mt-1 ${yamlError ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                {yamlError ? `${f.importYamlInvalid}: ${yamlError}` : `✓ ${f.importYamlValid}`}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 pb-5">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {tr.admin.config.forms.cancel}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canApply}
            onClick={handleApply}
          >
            {applying ? "…" : f.importApply}
          </Button>
        </div>
      </div>
    </div>
  );
}
