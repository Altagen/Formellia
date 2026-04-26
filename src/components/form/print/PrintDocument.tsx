import type { PrintTemplate } from "@/types/formActions";
import type { PrintInterpolationVars } from "@/types/formActions";
import { PrintHeader } from "./PrintHeader";
import { PrintBody } from "./PrintBody";
import { PrintFooter } from "./PrintFooter";
import { PrintWatermark } from "./PrintWatermark";

interface PrintDocumentProps {
  template: PrintTemplate;
  vars: PrintInterpolationVars;
  logoUrl?: string;
  brandColor?: string;
}

export function PrintDocument({ template, vars, logoUrl, brandColor }: PrintDocumentProps) {
  const isLandscape = template.orientation === "landscape";

  return (
    <div
      style={{
        position: "relative",
        fontFamily: "'Inter', Arial, sans-serif",
        color: "#0f172a",
        background: "#fff",
        minHeight: isLandscape ? "210mm" : "297mm",
        maxWidth: isLandscape ? "297mm" : "210mm",
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      {template.watermark && (
        <PrintWatermark
          text={template.watermark.text}
          opacity={template.watermark.opacity}
          angle={template.watermark.angle}
          fontSize={template.watermark.fontSize}
          color={template.watermark.color ?? brandColor}
        />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        {template.header && (
          <PrintHeader
            header={template.header}
            logoUrl={logoUrl}
            vars={vars}
            brandColor={brandColor}
          />
        )}

        <PrintBody blocks={template.body} vars={vars} brandColor={brandColor} />

        {template.footer && (
          <PrintFooter
            footer={template.footer}
            vars={vars}
            brandColor={brandColor}
            logoUrl={logoUrl}
          />
        )}
      </div>
    </div>
  );
}
