"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { PrintTemplate } from "@/types/formActions";
import type { PrintInterpolationVars } from "@/types/formActions";
import { interpolate } from "@/lib/print/interpolate";
import { PrintDocument } from "./PrintDocument";

interface PrintPreviewProps {
  template: PrintTemplate;
  vars: PrintInterpolationVars;
  logoUrl?: string;
  brandColor?: string;
  filenameTemplate?: string;
  printButtonLabel: string;
  closeButtonLabel: string;
  onClose: () => void;
  editButtonLabel?: string;
  onEdit?: () => void;
}

export function PrintPreview({
  template,
  vars,
  logoUrl,
  brandColor,
  filenameTemplate,
  printButtonLabel,
  closeButtonLabel,
  onClose,
  editButtonLabel,
  onEdit,
}: PrintPreviewProps) {
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isLandscape = template.orientation === "landscape";
  const previewWidth = isLandscape ? "297mm" : "210mm";

  // Resolve margins (mm) — defaults to 20mm all sides
  const mt = template.margins?.top    ?? 20;
  const mr = template.margins?.right  ?? 20;
  const mb = template.margins?.bottom ?? 20;
  const ml = template.margins?.left   ?? 20;

  useEffect(() => {
    // Guarantee #print-root exists before first render into portal
    let el = document.getElementById("print-root");
    if (!el) {
      el = document.createElement("div");
      el.id = "print-root";
      document.body.appendChild(el);
    }
    rootRef.current = el as HTMLDivElement;
    setMounted(true);
  }, []);

  // Do not render anything until portal root is ready — avoids hydration mismatch
  if (!mounted || !rootRef.current) return null;

  function handlePrint() {
    // Set document title → becomes filename suggestion in browser Save as PDF
    const prev = document.title;
    const raw = filenameTemplate
      ? interpolate(filenameTemplate, vars)
      : vars.formName;
    // Sanitize filename — remove characters illegal on Windows/macOS/Linux
    const filename = raw.replace(/[/\\:*?"<>|]/g, "_");
    document.title = filename;

    // Inject @page orientation + margins override
    const styleEl = document.createElement("style");
    styleEl.id = "__print-orientation";
    styleEl.textContent = `@page { size: A4 ${isLandscape ? "landscape" : "portrait"}; margin: ${mt}mm ${mr}mm ${mb}mm ${ml}mm; }`;
    document.head.appendChild(styleEl);

    window.print();

    // Restore after print dialog closes (synchronous in most browsers)
    setTimeout(() => {
      document.title = prev;
      document.getElementById("__print-orientation")?.remove();
    }, 500);
  }

  const content = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.5)",
        overflowY: "auto",
        padding: "32px 16px",
      }}
    >
      {/* Controls bar — hidden in print */}
      <div
        className="print:hidden"
        style={{
          maxWidth: previewWidth,
          margin: "0 auto 16px",
          display: "flex",
          justifyContent: "flex-end",
          gap: "8px",
        }}
      >
        <button
          type="button"
          onClick={handlePrint}
          style={{
            padding: "8px 20px",
            background: brandColor ?? "#1e293b",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {printButtonLabel}
        </button>
        {onEdit && editButtonLabel && (
          <button
            type="button"
            onClick={onEdit}
            style={{
              padding: "8px 16px",
              background: "#f1f5f9",
              color: "#334155",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            {editButtonLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "8px 16px",
            background: "#f1f5f9",
            color: "#334155",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          {closeButtonLabel}
        </button>
      </div>

      {/* Document — preview padding mirrors print margins */}
      <div
        style={{
          maxWidth: previewWidth,
          margin: "0 auto",
          background: "#fff",
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
          padding: `${mt}mm ${mr}mm ${mb}mm ${ml}mm`,
          boxSizing: "border-box",
        }}
      >
        <PrintDocument
          template={template}
          vars={vars}
          logoUrl={logoUrl}
          brandColor={brandColor}
        />
      </div>
    </div>
  );

  return createPortal(content, rootRef.current);
}
