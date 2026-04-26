"use client";

import type { PageConfig, BrandingConfig } from "@/types/config";

interface HeroSectionProps {
  hero: PageConfig["hero"];
  branding: BrandingConfig;
  /** When true, the CTA button is hidden (e.g. in hero_form_split layout) */
  hideCtaButton?: boolean;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function HeroSection({ hero, branding, hideCtaButton = false }: HeroSectionProps) {
  const variant = hero.backgroundVariant ?? "gradient";
  const primary = branding.primaryColor ?? "#2563eb";
  const secondary = branding.secondaryColor ?? "#7c3aed";
  const isColorBg = variant === "solid" || variant === "image";

  // Height
  const heightClass = {
    compact: "py-10",
    normal: "py-16",
    tall: "py-24",
    fullscreen: "min-h-screen flex items-center",
  }[hero.height ?? "normal"];

  // Alignment
  const alignClass = hero.textAlign === "left" ? "text-left" : "text-center";
  const maxWClass =
    hero.textAlign === "left" ? "max-w-2xl" : "max-w-2xl mx-auto";

  // Background style
  let bgStyle: React.CSSProperties | undefined;
  if (variant === "image" && hero.backgroundImage) {
    bgStyle = {
      backgroundImage: `url(${hero.backgroundImage})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  } else if (variant === "solid") {
    bgStyle = { backgroundColor: primary };
  } else {
    // gradient — built dynamically from brand colors
    bgStyle = {
      background: `linear-gradient(135deg, ${hexToRgba(primary, 0.1)}, ${hexToRgba(secondary, 0.08)})`,
    };
  }

  function handleCta() {
    if (hero.ctaScrollToForm) {
      const el = document.getElementById("form-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  return (
    <div
      className={`px-4 ${heightClass} ${variant === "image" ? "relative" : ""}`}
      style={bgStyle}
    >
      {/* Image overlay for readability */}
      {variant === "image" && (
        <div className="absolute inset-0 bg-black/40" aria-hidden />
      )}

      <div className={`relative ${maxWClass}`}>
        {/* Eyebrow badge */}
        {hero.eyebrow && (
          <div
            className={`mb-4 ${
              hero.textAlign === "left" ? "" : "flex justify-center"
            }`}
          >
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
              style={{
                color: primary,
                borderColor: hexToRgba(primary, 0.3),
                backgroundColor: hexToRgba(primary, 0.08),
              }}
            >
              {hero.eyebrow}
            </span>
          </div>
        )}

        {/* Title */}
        {hero.title && (
          <h1
            className={`text-4xl font-bold mb-3 ${alignClass} ${
              isColorBg
                ? "text-white"
                : "text-foreground"
            }`}
          >
            {hero.title}
          </h1>
        )}

        {/* Subtitle */}
        {hero.subtitle && (
          <p
            className={`text-xl font-medium mb-2 ${alignClass} ${
              isColorBg
                ? "text-white/90"
                : "text-foreground"
            }`}
          >
            {hero.subtitle}
          </p>
        )}

        {/* Description */}
        {hero.description && (
          <p
            className={`text-lg ${alignClass} ${
              isColorBg
                ? "text-white/80"
                : "text-muted-foreground"
            }`}
          >
            {hero.description}
          </p>
        )}

        {/* Stats */}
        {hero.stats && hero.stats.length > 0 && (
          <div
            className={`mt-8 flex flex-wrap gap-6 ${
              hero.textAlign === "left" ? "" : "justify-center"
            }`}
          >
            {hero.stats.map((stat, i) => (
              <div
                key={i}
                className={`${
                  hero.textAlign === "left" ? "" : "text-center"
                }`}
              >
                <p
                  className="text-2xl font-bold"
                  style={{ color: isColorBg ? "white" : primary }}
                >
                  {stat.value}
                </p>
                <p
                  className={`text-xs mt-0.5 ${
                    isColorBg
                      ? "text-white/70"
                      : "text-muted-foreground"
                  }`}
                >
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* CTA button */}
        {!hideCtaButton && hero.ctaLabel && (
          <div
            className={`mt-8 ${
              hero.textAlign === "left" ? "" : "flex justify-center"
            }`}
          >
            <button
              onClick={handleCta}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: primary }}
            >
              {hero.ctaLabel}
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
