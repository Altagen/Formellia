import type { PrintTemplate } from "@/types/formActions";
import type { PrintInterpolationVars } from "@/types/formActions";
import { interpolate } from "@/lib/print/interpolate";

interface PrintFooterProps {
  footer: NonNullable<PrintTemplate["footer"]>;
  vars: PrintInterpolationVars;
  brandColor?: string;
  logoUrl?: string;
}

function isSafeUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("/");
}

function pageNumberClass(format: NonNullable<PrintTemplate["footer"]>["pageNumberFormat"]): string {
  if (format === "n")      return "print-page-number--n";
  if (format === "dash_n") return "print-page-number--dash";
  return "print-page-number"; // default: n_of_m
}

function logoJustify(align: string | undefined): string {
  if (align === "center") return "center";
  if (align === "right")  return "flex-end";
  return "flex-start";
}

export function PrintFooter({ footer, vars, brandColor, logoUrl }: PrintFooterProps) {
  const text = footer.text ? interpolate(footer.text, vars) : "";
  const accent = brandColor ?? "#cbd5e1";
  const safeLogoUrl = footer.showLogo && logoUrl && isSafeUrl(logoUrl) ? logoUrl : undefined;

  if (!text && !footer.showPageNumbers && !safeLogoUrl) return null;

  return (
    <div
      style={{
        borderTop: `1px solid ${accent}`,
        marginTop: "32px",
        paddingTop: "12px",
      }}
    >
      {/* Logo row — shown if showLogo and a valid logoUrl is provided */}
      {safeLogoUrl && (
        <div style={{ display: "flex", justifyContent: logoJustify(footer.logoAlign), marginBottom: "8px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={safeLogoUrl}
            alt="Logo"
            style={{ height: "32px", width: "auto", objectFit: "contain", opacity: 0.7 }}
          />
        </div>
      )}

      {/* Text + page numbers row */}
      {(text || footer.showPageNumbers) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "11px",
            color: "#64748b",
          }}
        >
          <span>{text}</span>
          {footer.showPageNumbers && (
            <span className={pageNumberClass(footer.pageNumberFormat)} />
          )}
        </div>
      )}
    </div>
  );
}
