import type { PrintTemplate } from "@/types/formActions";
import type { PrintInterpolationVars } from "@/types/formActions";
import { interpolate } from "@/lib/print/interpolate";

interface PrintHeaderProps {
  header: NonNullable<PrintTemplate["header"]>;
  logoUrl?: string;
  vars: PrintInterpolationVars;
  brandColor?: string;
}

function isSafeUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("/");
}

export function PrintHeader({ header, logoUrl, vars, brandColor }: PrintHeaderProps) {
  const title = header.title ? interpolate(header.title, vars) : "";
  const subtitle = header.subtitle ? interpolate(header.subtitle, vars) : "";
  const safeLogoUrl = logoUrl && isSafeUrl(logoUrl) ? logoUrl : undefined;
  const accent = brandColor ?? "#1e293b";
  const logoHeight = header.logoHeight ?? 48;
  const logoAlign = header.logoAlign ?? "left";

  // For logoAlign "right", reverse the order of [logo+text] and [date]
  const isReversed = logoAlign === "right";

  const logoAndTitle = (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexDirection: isReversed ? "row-reverse" : "row" }}>
      {header.showLogo && safeLogoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safeLogoUrl}
          alt="Logo"
          style={{ height: `${logoHeight}px`, width: "auto", objectFit: "contain", flexShrink: 0 }}
        />
      )}
      <div style={{ textAlign: isReversed ? "right" : "left" }}>
        {title && (
          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
            {title}
          </h1>
        )}
        {subtitle && (
          <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div
      style={{
        borderBottom: `2px solid ${accent}`,
        paddingBottom: "12px",
        marginBottom: "24px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "16px",
        flexDirection: isReversed ? "row-reverse" : "row",
      }}
    >
      {logoAndTitle}
      {header.showDate && (
        <div style={{ fontSize: "12px", color: "#64748b", whiteSpace: "nowrap", paddingTop: "4px", flexShrink: 0 }}>
          {vars.submittedAt}
        </div>
      )}
    </div>
  );
}
