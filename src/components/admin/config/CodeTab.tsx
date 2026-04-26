"use client";

import { useState, useEffect } from "react";
import { Download, Copy, Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/context/LocaleContext";
import type { FormInstance } from "@/types/formInstance";
import { ImportModal } from "@/components/admin/config/ImportModal";

interface CodeTabProps {
  instance: FormInstance;
  onImported: (updated: FormInstance) => void;
}

export function CodeTab({ instance, onImported }: CodeTabProps) {
  const tr = useTranslations();
  const f  = tr.admin.config.forms;

  const [yamlContent, setYamlContent]   = useState<string | null>(null);
  const [loading, setLoading]           = useState(false);
  const [copied, setCopied]             = useState(false);
  const [showImport, setShowImport]     = useState(false);

  useEffect(() => {
    setYamlContent(null);
    setLoading(true);
    fetch(`/api/admin/forms/${instance.id}/export`)
      .then(r => r.text())
      .then(t => setYamlContent(t))
      .catch(() => setYamlContent(`# ${f.codeLoadError}`))
      .finally(() => setLoading(false));
  }, [instance.id, instance.config]);

  function handleCopy() {
    if (!yamlContent) return;
    navigator.clipboard.writeText(yamlContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    if (!yamlContent) return;
    const filename = instance.slug === "/" ? "root.yaml" : `${instance.slug}.yaml`;
    const blob = new Blob([yamlContent], { type: "application/x-yaml" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{f.codeView}</p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="w-3.5 h-3.5 mr-1" />
            {f.codeImport}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleCopy} disabled={!yamlContent || loading}>
            {copied ? <Check className="w-3.5 h-3.5 mr-1 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            {copied ? f.codeCopied : f.codeCopy}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleDownload} disabled={!yamlContent || loading}>
            <Download className="w-3.5 h-3.5 mr-1" />
            {f.codeDownload}
          </Button>
        </div>
      </div>

      <pre className="rounded-lg border border-border bg-muted/40 p-4 overflow-x-auto text-xs font-mono text-foreground min-h-[200px] whitespace-pre">
        {loading ? "…" : (yamlContent ?? "")}
      </pre>

      {showImport && (
        <ImportModal
          formId={instance.id}
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false);
            // Reload the updated instance
            fetch(`/api/admin/forms/${instance.id}`)
              .then(r => r.json())
              .then((updated: FormInstance) => onImported(updated))
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
