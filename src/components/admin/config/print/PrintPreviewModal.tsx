"use client";

import type { PrintTemplate } from "@/types/formActions";
import type { PrintInterpolationVars } from "@/types/formActions";
import type { FieldDef } from "@/types/config";
import { BCP47, PRINT_LABELS } from "@/lib/print/interpolate";
import { PrintDocument } from "@/components/form/print/PrintDocument";

interface PrintPreviewModalProps {
  template: PrintTemplate;
  fieldDefs: FieldDef[];
  formName?: string;
  formLocale?: string;
  logoUrl?: string;
  brandColor?: string;
  closeLabel: string;
  mockNotice: string;
  onClose: () => void;
}

function buildMockVars(
  fieldDefs: FieldDef[],
  formName: string,
  locale: string
): PrintInterpolationVars {
  const fields: Record<string, string> = {};
  const fieldLabels: Record<string, string> = {};
  for (const f of fieldDefs) {
    if (f.type === "section_header") continue;
    fields[f.id] = f.placeholder || f.defaultValue || f.label;
    fieldLabels[f.id] = f.label;
  }
  const resolved = BCP47[locale] ?? locale;
  const printLabels = PRINT_LABELS[locale] ?? PRINT_LABELS["en"];
  return {
    fields,
    fieldLabels,
    submittedAt: new Date().toLocaleString(resolved, { dateStyle: "long", timeStyle: "short" }),
    formName: formName || "Document",
    formDescription: "",
    submissionId: "MOCK0001",
    printLabels,
  };
}

export function PrintPreviewModal({
  template,
  fieldDefs,
  formName,
  formLocale,
  logoUrl,
  brandColor,
  closeLabel,
  mockNotice,
  onClose,
}: PrintPreviewModalProps) {
  const isLandscape = template.orientation === "landscape";
  const previewWidth = isLandscape ? "297mm" : "210mm";
  const mt = template.margins?.top    ?? 20;
  const mr = template.margins?.right  ?? 20;
  const mb = template.margins?.bottom ?? 20;
  const ml = template.margins?.left   ?? 20;
  const vars = buildMockVars(fieldDefs, formName ?? "Document", formLocale ?? "fr");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        background: "rgba(0,0,0,0.65)",
        overflowY: "auto",
        padding: "32px 16px",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          maxWidth: previewWidth,
          margin: "0 auto 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <p style={{
          margin: 0,
          fontSize: "12px",
          color: "rgba(255,255,255,0.6)",
          fontStyle: "italic",
        }}>
          {mockNotice}
        </p>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "6px 16px",
            background: "#f1f5f9",
            color: "#334155",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            fontSize: "13px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          ✕ {closeLabel}
        </button>
      </div>

      {/* Document — preview padding mirrors print margins */}
      <div
        style={{
          maxWidth: previewWidth,
          margin: "0 auto",
          background: "#fff",
          boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
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
}
