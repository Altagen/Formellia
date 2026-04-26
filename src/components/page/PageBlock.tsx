"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import DOMPurify from "isomorphic-dompurify";
import type { PageBlock as PageBlockType, BrandingConfig } from "@/types/config";

interface PageBlockProps {
  block: PageBlockType;
  branding?: BrandingConfig;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(37,99,235,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function PageBlock({ block, branding }: PageBlockProps) {
  const primary = branding?.primaryColor ?? "#2563eb";

  const [openIdx, setOpenIdx] = useState<number | null>(null);

  if (block.type === "divider") {
    return (
      <div className="max-w-3xl mx-auto px-6">
        <hr className="border-border" />
      </div>
    );
  }

  if (block.type === "info") {
    const variantStyles = {
      default:   { bg: "bg-card",                        border: "border-border",                          icon: "text-muted-foreground" },
      highlight: { bg: "bg-blue-50 dark:bg-blue-950",   border: "border-blue-200 dark:border-blue-800",   icon: "text-blue-500" },
      warning:   { bg: "bg-amber-50 dark:bg-amber-950", border: "border-amber-200 dark:border-amber-800", icon: "text-amber-500" },
      success:   { bg: "bg-green-50 dark:bg-green-950", border: "border-green-200 dark:border-green-800", icon: "text-green-500" },
    };
    const style = variantStyles[block.variant ?? "default"];

    return (
      <section className="max-w-3xl mx-auto px-6 py-6">
        <div className={`rounded-xl border p-6 flex gap-4 ${style.bg} ${style.border}`}>
          {block.icon && (
            <span className={`text-2xl flex-shrink-0 mt-0.5 ${style.icon}`}>{block.icon}</span>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground mb-2">{block.title}</h3>
            <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
              <ReactMarkdown>{block.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (block.type === "features") {
    const cols = block.columns ?? 3;
    const gridClass = { 2: "grid-cols-1 sm:grid-cols-2", 3: "grid-cols-1 sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[cols];
    const featureStyle = block.style ?? "cards";

    if (featureStyle === "icons_row") {
      return (
        <section className="max-w-3xl mx-auto px-6 py-6 space-y-4">
          {block.items.map((item, i) => (
            <div key={i} className="flex items-start gap-4">
              <span className="text-2xl flex-shrink-0">{item.icon}</span>
              <div>
                <h4 className="font-semibold text-foreground text-sm mb-0.5">{item.title}</h4>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </section>
      );
    }

    if (featureStyle === "bullets") {
      return (
        <section className="max-w-3xl mx-auto px-6 py-6">
          <ul className="space-y-3">
            {block.items.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="mt-1 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                  style={{ backgroundColor: primary }}
                >
                  ✓
                </span>
                <div>
                  <span className="font-medium text-foreground text-sm">{item.title}</span>
                  {item.desc && (
                    <span className="text-sm text-muted-foreground ml-2">— {item.desc}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      );
    }

    // Default: "cards"
    return (
      <section className="max-w-4xl mx-auto px-6 py-8">
        <div className={`grid ${gridClass} gap-4`}>
          {block.items.map((item, i) => (
            <div
              key={i}
              className="bg-card rounded-xl border border-border p-5 flex flex-col items-center text-center gap-3 hover:shadow-md transition-shadow"
            >
              <span className="text-3xl">{item.icon}</span>
              <h4 className="font-semibold text-foreground text-sm">{item.title}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === "faq") {
    return (
      <section className="max-w-3xl mx-auto px-6 py-8">
        {block.title && (
          <h2 className="text-xl font-bold text-foreground mb-6 text-center">{block.title}</h2>
        )}
        <div className="space-y-2">
          {block.items.map((item, i) => (
            <div key={i} className="border border-border rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/50 transition-colors"
              >
                <span className="font-medium text-foreground text-sm pr-4">{item.question}</span>
                <span
                  className={`flex-shrink-0 text-muted-foreground transition-transform duration-200 ${openIdx === i ? "rotate-180" : ""}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </button>
              {openIdx === i && (
                <div className="px-5 pb-4 text-sm text-muted-foreground border-t border-border pt-3">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{item.answer}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === "stats") {
    return (
      <section className="border-t border-b border-border bg-muted/30">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {block.items.map((item, i) => (
              <div key={i} className="text-center">
                {item.icon && <span className="text-2xl block mb-1">{item.icon}</span>}
                <p className="text-3xl font-bold" style={{ color: primary }}>{item.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (block.type === "testimonials") {
    return (
      <section className="max-w-4xl mx-auto px-6 py-10">
        {block.title && (
          <h2 className="text-xl font-bold text-foreground mb-8 text-center">{block.title}</h2>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {block.items.map((item, i) => (
            <div
              key={i}
              className="bg-card rounded-xl border border-border p-5 flex flex-col gap-3"
            >
              {item.rating && (
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <svg
                      key={s}
                      className={`w-4 h-4 ${s < item.rating! ? "text-yellow-400" : "text-muted"}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
              )}
              <p className="text-sm text-muted-foreground italic flex-1">&ldquo;{item.text}&rdquo;</p>
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                {item.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.avatar} alt={item.name} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: primary }}
                  >
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-foreground">{item.name}</p>
                  {item.role && <p className="text-xs text-muted-foreground">{item.role}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === "quote") {
    return (
      <section className="max-w-2xl mx-auto px-6 py-10">
        <blockquote className="relative">
          <span
            className="absolute -top-4 -left-2 text-7xl font-serif leading-none select-none"
            style={{ color: hexToRgba(primary, 0.15) }}
          >
            &ldquo;
          </span>
          <p className="relative text-xl font-medium text-foreground leading-relaxed italic pl-4">
            {block.text}
          </p>
          {(block.author || block.role) && (
            <footer className="mt-4 pl-4 flex items-center gap-3">
              <div className="w-8 h-0.5" style={{ backgroundColor: primary }} />
              <div>
                {block.author && (
                  <span className="text-sm font-semibold text-foreground">{block.author}</span>
                )}
                {block.role && (
                  <span className="text-sm text-muted-foreground ml-1">— {block.role}</span>
                )}
              </div>
            </footer>
          )}
        </blockquote>
      </section>
    );
  }

  if (block.type === "cta") {
    return (
      <section className="max-w-3xl mx-auto px-6 py-10 text-center">
        <div
          className="rounded-2xl p-8"
          style={{
            background: `linear-gradient(135deg, ${hexToRgba(primary, 0.08)}, ${hexToRgba(branding?.secondaryColor ?? "#7c3aed", 0.05)})`,
            border: `1px solid ${hexToRgba(primary, 0.2)}`,
          }}
        >
          <h2 className="text-xl font-bold text-foreground mb-2">{block.title}</h2>
          {block.description && (
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">{block.description}</p>
          )}
          <button
            type="button"
            onClick={() => {
              if (block.scrollToForm) {
                const el = document.getElementById("form-section");
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                  return;
                }
              }
              window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
            }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white shadow-md hover:shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: primary }}
          >
            {block.label}
          </button>
        </div>
      </section>
    );
  }

  if (block.type === "html") {
    const clean = DOMPurify.sanitize(block.content);
    return (
      <section className="max-w-3xl mx-auto px-6 py-6">
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: clean }}
        />
      </section>
    );
  }

  return null;
}
