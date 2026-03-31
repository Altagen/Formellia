"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useFormTheme } from "@/hooks/useFormTheme";
import { HeroSection } from "./HeroSection";
import { PageBlock } from "./PageBlock";
import { FormWizard } from "@/components/form/FormWizard";
import type { FormConfig, BrandingConfig, PageConfig } from "@/types/config";
import type { FormInstanceConfig } from "@/types/formInstance";
import type { AppMetaConfig } from "@/types/config";
import type { ThemeMode } from "@/types/config";
import ReactMarkdown from "react-markdown";
import { PageViewBeacon } from "./PageViewBeacon";

interface LandingPageProps {
  instanceConfig: FormInstanceConfig;
  /** Global admin config — reserved for future use (branding fallback, etc.) */
  globalConfig: FormConfig;
  submitUrl?: string;
}

// ─── ThemeToggleButton ─────────────────────────────────────────────────────

function ThemeToggleButton({
  theme,
  toggle,
}: {
  theme: ThemeMode;
  toggle: () => void;
}) {
  return (
    <button
      onClick={toggle}
      aria-label={
        theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"
      }
      className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
    >
      {theme === "dark" ? (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"
          />
        </svg>
      ) : (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );
}

// ─── TopBar ────────────────────────────────────────────────────────────────

function TopBar({
  branding,
  meta,
  theme,
  toggle,
}: {
  branding: BrandingConfig;
  meta: AppMetaConfig;
  theme: ThemeMode;
  toggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border">
      {branding.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logoUrl}
          alt={meta.name}
          className="h-8 max-w-[160px] object-contain"
        />
      ) : (
        <span className="font-semibold text-foreground">
          {meta.name}
        </span>
      )}
      <ThemeToggleButton theme={theme} toggle={toggle} />
    </div>
  );
}

// ─── NavBar ────────────────────────────────────────────────────────────────

function NavBar({
  nav,
  branding,
  meta,
  theme,
  toggle,
  onCtaClick,
}: {
  nav: NonNullable<PageConfig["nav"]>;
  branding: BrandingConfig;
  meta: AppMetaConfig;
  theme: ThemeMode;
  toggle: () => void;
  onCtaClick: () => void;
}) {
  const primary = branding.primaryColor ?? "#2563eb";
  const isSticky = nav.sticky !== false;

  return (
    <nav
      className={`${
        isSticky ? "sticky top-0 z-30" : ""
      } bg-background/95 backdrop-blur border-b border-border`}
    >
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logoUrl}
            alt={meta.name}
            className="h-7 max-w-[120px] object-contain"
          />
        ) : (
          <span className="font-semibold text-sm text-foreground">
            {meta.name}
          </span>
        )}

        {/* Links */}
        {nav.links && nav.links.length > 0 && (
          <div className="hidden sm:flex items-center gap-6">
            {nav.links.map((link, i) => (
              <a
                key={i}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}

        {/* Right: CTA + theme toggle */}
        <div className="flex items-center gap-2">
          {nav.showCta && (
            <button
              onClick={onCtaClick}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: primary }}
            >
              {meta.translations?.submitButton ?? "Commencer"}
            </button>
          )}
          <ThemeToggleButton theme={theme} toggle={toggle} />
        </div>
      </div>
    </nav>
  );
}

// ─── FooterSection ─────────────────────────────────────────────────────────

function FooterSection({
  footer,
  onCguClick,
}: {
  footer: NonNullable<PageConfig["footer"]>;
  onCguClick: () => void;
}) {
  return (
    <footer className="border-t border-border py-6 px-4">
      <div className="max-w-2xl mx-auto text-center">
        {footer.text && (
          <p className="text-xs text-muted-foreground mb-2">
            {footer.text}
          </p>
        )}
        {footer.links && footer.links.length > 0 && (
          <div className="flex justify-center gap-4 flex-wrap">
            {footer.links.map((link, i) => (
              <a
                key={i}
                href={link.url}
                className="text-xs text-muted-foreground hover:text-foreground underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}

        {/* CGU / CGV */}
        {footer.cguCgv?.enabled && (
          <div className="mt-2">
            {footer.cguCgv.mode === "link" && footer.cguCgv.url ? (
              <a
                href={footer.cguCgv.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                {footer.cguCgv.label || "CGU / CGV"}
              </a>
            ) : (
              <button
                type="button"
                onClick={onCguClick}
                className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
              >
                {footer.cguCgv.label || "CGU / CGV"}
              </button>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}

// ─── CguModal ──────────────────────────────────────────────────────────────

function CguModal({
  footer,
  onClose,
}: {
  footer: NonNullable<PageConfig["footer"]>;
  onClose: () => void;
}) {
  if (!footer.cguCgv?.enabled || footer.cguCgv.mode !== "inline") return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {footer.cguCgv.label || "CGU / CGV"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{footer.cguCgv.content || ""}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LandingPage ───────────────────────────────────────────────────────────

export function LandingPage({ instanceConfig, globalConfig, submitUrl }: LandingPageProps) {
  const { page, meta, features } = instanceConfig;
  const { branding, hero, blocks, footer } = page;
  const [cguOpen, setCguOpen] = useState(false);

  const { theme, toggle } = useFormTheme(branding.defaultTheme);

  // Font family class
  const fontStyle = {
    system: "",
    inter: "font-sans",
    geist: "font-mono",
    serif: "font-serif",
  }[branding.fontFamily ?? "system"];

  // Scroll form into view — used by NavBar CTA
  function scrollToForm() {
    const el = document.getElementById("form-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // ── layout: form_only ──────────────────────────────────────────────────

  if (page.layout === "form_only") {
    return (
      <div className={`${theme === "dark" ? "dark" : ""} ${fontStyle}`}>
        <PageViewBeacon slug={instanceConfig.meta.name} />
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className={`bg-card rounded-2xl shadow-lg p-8 border border-border w-full ${{
              sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl", "2xl": "max-w-6xl", full: "max-w-full",
            }[page.formWidth ?? "md"] ?? "max-w-lg"}`}>
            <FormWizard instanceConfig={instanceConfig} submitUrl={submitUrl} locale={globalConfig.locale} />
          </div>
        </div>
      </div>
    );
  }

  // ── layout: hero_form_split ────────────────────────────────────────────

  if (page.layout === "hero_form_split") {
    return (
      <div className={`${theme === "dark" ? "dark" : ""} ${fontStyle}`}>
        <PageViewBeacon slug={instanceConfig.meta.name} />
        <div className="min-h-screen bg-background">
          {page.nav ? (
            <NavBar
              nav={page.nav}
              branding={branding}
              meta={meta}
              theme={theme}
              toggle={toggle}
              onCtaClick={scrollToForm}
            />
          ) : null}

          <div className="flex min-h-screen">
            {/* Left: Hero + blocks scrollable */}
            <div className="flex-1 overflow-y-auto">
              {!page.nav && (
                <TopBar
                  branding={branding}
                  meta={meta}
                  theme={theme}
                  toggle={toggle}
                />
              )}
              <HeroSection
                hero={{ ...hero, ctaScrollToForm: false }}
                branding={branding}
                hideCtaButton
              />
              {blocks && blocks.length > 0 && (
                <div className="py-4">
                  {blocks.map((block, i) => (
                    <PageBlock key={i} block={block} branding={branding} />
                  ))}
                </div>
              )}
              {footer && (
                <FooterSection
                  footer={footer}
                  onCguClick={() => setCguOpen(true)}
                />
              )}
            </div>

            {/* Right: Form panel — sticky */}
            {features.form && (
              <div className="w-full max-w-md shrink-0 border-l border-border sticky top-0 h-screen overflow-y-auto p-8 flex items-start">
                <div
                  id="form-section"
                  className="w-full bg-card rounded-2xl shadow-lg p-8 border border-border"
                >
                  <FormWizard
                    instanceConfig={instanceConfig}
                    submitUrl={submitUrl}
                    locale={globalConfig.locale}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {cguOpen && footer && (
          <CguModal footer={footer} onClose={() => setCguOpen(false)} />
        )}
      </div>
    );
  }

  // ── layout: page (default) ─────────────────────────────────────────────

  return (
    <div className={`${theme === "dark" ? "dark" : ""} ${fontStyle}`}>
      <PageViewBeacon slug={instanceConfig.meta.name} />
      <div className="min-h-screen bg-background transition-colors flex flex-col">
        {/* Navigation */}
        {page.nav ? (
          <NavBar
            nav={page.nav}
            branding={branding}
            meta={meta}
            theme={theme}
            toggle={toggle}
            onCtaClick={scrollToForm}
          />
        ) : (
          <TopBar
            branding={branding}
            meta={meta}
            theme={theme}
            toggle={toggle}
          />
        )}

        {/* Content — grows to push footer down */}
        <div className="flex-1">

        {/* Hero */}
        <HeroSection hero={hero} branding={branding} />

        {/* Optional scrollable blocks with Framer Motion */}
        {blocks && blocks.length > 0 && (
          <div className="py-4">
            {blocks.map((block, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              >
                <PageBlock block={block} branding={branding} />
              </motion.div>
            ))}
          </div>
        )}

        {/* Form */}
        {features.form && (
          <div
            id="form-section"
            className="container mx-auto px-4 py-10 max-w-2xl"
          >
            <div className="bg-card rounded-2xl shadow-lg p-8 border border-border">
              <FormWizard instanceConfig={instanceConfig} submitUrl={submitUrl} locale={globalConfig.locale} />
            </div>
          </div>
        )}

        </div>{/* end flex-1 content */}

        {/* Footer — always at bottom */}
        {footer && (
          <FooterSection
            footer={footer}
            onCguClick={() => setCguOpen(true)}
          />
        )}
      </div>

      {/* CGU / CGV modal */}
      {cguOpen && footer && (
        <CguModal footer={footer} onClose={() => setCguOpen(false)} />
      )}
    </div>
  );
}
