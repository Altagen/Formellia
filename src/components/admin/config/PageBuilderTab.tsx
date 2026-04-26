"use client";

import { useState, useRef } from "react";
import type { PageConfig, PageBlock } from "@/types/config";
import { useTranslations } from "@/lib/context/LocaleContext";
import { COLOR_PRESETS, PRESET_NAMES } from "@/lib/theme/presets";

interface PageBuilderTabProps {
  page: PageConfig;
  onChange: (p: PageConfig) => void;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

const INPUT_CLS = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50";
const SMALL_INPUT_CLS = "border border-input rounded px-2 py-1.5 text-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h2 className="text-sm font-semibold text-foreground mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            value === opt.value
              ? "bg-primary border-primary text-primary-foreground"
              : "bg-background border-border text-foreground hover:bg-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function PageBuilderTab({ page, onChange }: PageBuilderTabProps) {
  const tr = useTranslations();
  const pb = tr.admin.config.pageBuilder;

  const [expandedBlock, setExpandedBlock] = useState<number | null>(null);
  const [logoWarning, setLogoWarning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function updatePage(patch: Partial<PageConfig>) {
    onChange({ ...page, ...patch });
  }

  function updateBranding(patch: Partial<PageConfig["branding"]>) {
    onChange({ ...page, branding: { ...page.branding, ...patch } });
  }

  function updateHero(patch: Partial<PageConfig["hero"]>) {
    onChange({ ...page, hero: { ...page.hero, ...patch } });
  }

  function updateNav(patch: Partial<NonNullable<PageConfig["nav"]>>) {
    onChange({ ...page, nav: { ...page.nav, ...patch } });
  }

  function updateFooter(patch: Partial<NonNullable<PageConfig["footer"]>>) {
    onChange({ ...page, footer: { ...page.footer, ...patch } });
  }

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setLogoWarning(file.size > 200 * 1024);
      updateBranding({ logoUrl: result });
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  const blocks = page.blocks ?? [];

  function addBlock(type: PageBlock["type"]) {
    let newBlock: PageBlock;
    switch (type) {
      case "info":        newBlock = { type: "info", title: pb.titleLabel, content: pb.defaultInfoContent }; break;
      case "features":   newBlock = { type: "features", items: [{ icon: "⭐", title: pb.defaultFeatureTitle, desc: pb.description }] }; break;
      case "faq":        newBlock = { type: "faq", title: pb.faqTitlePlaceholder, items: [{ question: pb.defaultQuestion, answer: pb.defaultAnswer }] }; break;
      case "stats":      newBlock = { type: "stats", items: [{ value: "1000+", label: pb.statLabelPlaceholder }] }; break;
      case "testimonials": newBlock = { type: "testimonials", title: pb.defaultTestimonialsTitle, items: [{ name: pb.defaultTestimonialName, text: pb.defaultTestimonialText }] }; break;
      case "quote":      newBlock = { type: "quote", text: pb.defaultQuoteText, author: pb.author }; break;
      case "cta":        newBlock = { type: "cta", title: pb.defaultCtaTitle, label: pb.defaultCtaLabel, scrollToForm: true }; break;
      case "html":       newBlock = { type: "html", content: pb.defaultHtmlContent }; break;
      default:           newBlock = { type: "divider" };
    }
    updatePage({ blocks: [...blocks, newBlock] });
    setExpandedBlock(blocks.length);
  }

  function updateBlock(i: number, patch: Partial<PageBlock>) {
    const updated = [...blocks];
    updated[i] = { ...updated[i], ...patch } as PageBlock;
    updatePage({ blocks: updated });
  }

  function deleteBlock(i: number) {
    updatePage({ blocks: blocks.filter((_, idx) => idx !== i) });
    setExpandedBlock(null);
  }

  const footerLinks = page.footer?.links ?? [];
  const navLinks = page.nav?.links ?? [];
  const heroStats = page.hero.stats ?? [];

  function addFooterLink() {
    updateFooter({ links: [...footerLinks, { label: "", url: "" }] });
  }
  function updateFooterLink(i: number, patch: { label?: string; url?: string }) {
    const updated = [...footerLinks];
    updated[i] = { ...updated[i], ...patch };
    updateFooter({ links: updated });
  }
  function deleteFooterLink(i: number) {
    updateFooter({ links: footerLinks.filter((_, idx) => idx !== i) });
  }

  function addNavLink() {
    updateNav({ links: [...navLinks, { label: "", href: "" }] });
  }
  function updateNavLink(i: number, patch: { label?: string; href?: string }) {
    const updated = [...navLinks];
    updated[i] = { ...updated[i], ...patch };
    updateNav({ links: updated });
  }
  function deleteNavLink(i: number) {
    updateNav({ links: navLinks.filter((_, idx) => idx !== i) });
  }

  function addHeroStat() {
    updateHero({ stats: [...heroStats, { value: "", label: "" }] });
  }
  function updateHeroStat(i: number, patch: { value?: string; label?: string }) {
    const updated = [...heroStats];
    updated[i] = { ...updated[i], ...patch };
    updateHero({ stats: updated });
  }
  function deleteHeroStat(i: number) {
    updateHero({ stats: heroStats.filter((_, idx) => idx !== i) });
  }

  const blockTypeLabels: Record<string, string> = {
    info: pb.blockInfo,
    features: pb.blockFeatures,
    faq: pb.blockFaq,
    stats: pb.blockStats,
    testimonials: pb.blockTestimonials,
    quote: pb.blockQuoteLabel,
    cta: pb.blockCta,
    html: pb.blockHtml,
    divider: pb.blockDivider,
  };

  function getBlockSummary(block: PageBlock): string {
    if (block.type === "info") return block.title;
    if (block.type === "features") return pb.blockElementsCount.replace("{n}", String(block.items.length));
    if (block.type === "faq") return pb.blockQuestionsCount.replace("{n}", String(block.items.length));
    if (block.type === "stats") return pb.blockStatsCount.replace("{n}", String(block.items.length));
    if (block.type === "testimonials") return pb.blockTestimonialsCount.replace("{n}", String(block.items.length));
    if (block.type === "quote") return block.author ? `— ${block.author}` : pb.blockQuoteLabel;
    if (block.type === "cta") return block.title;
    if (block.type === "html") return pb.blockHtmlLabel;
    return "";
  }

  return (
    <div className="space-y-6">

      {/* ── Layout ── */}
      <Section title={pb.layout}>
        <Field label={pb.layoutGeneral}>
          <ToggleGroup
            value={page.layout ?? "page"}
            options={[
              { value: "page", label: pb.layoutPage },
              { value: "form_only", label: pb.layoutFormOnly },
              { value: "hero_form_split", label: pb.layoutHeroFormSplit },
            ]}
            onChange={(v) => updatePage({ layout: v })}
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            {(page.layout ?? "page") === "page" && pb.layoutPageDesc}
            {page.layout === "form_only" && pb.layoutFormOnlyDesc}
            {page.layout === "hero_form_split" && pb.layoutHeroFormSplitDesc}
          </p>
        </Field>
      </Section>

      {/* ── Branding ── */}
      <Section title={pb.branding}>
        {/* Logo */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{pb.logo}</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={page.branding.logoUrl ?? ""}
              onChange={(e) => { updateBranding({ logoUrl: e.target.value || undefined }); setLogoWarning(false); }}
              className={`flex-1 ${INPUT_CLS}`}
              placeholder="https://... ou data:image/..."
            />
            <input type="file" accept="image/*" ref={fileRef} onChange={handleLogoFile} className="hidden" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-3 py-2 border border-border rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
            >
              {pb.chooseFile}
            </button>
          </div>
          {logoWarning && (
            <p className="text-xs text-amber-600 mt-1">
              {pb.logoWarning}
            </p>
          )}
          {page.branding.logoUrl && (
            <div className="mt-2 h-12 flex items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={page.branding.logoUrl} alt="Logo preview" className="max-h-12 max-w-32 object-contain rounded" />
            </div>
          )}
        </div>

        {/* Color preset */}
        <div>
          <label className="block text-xs text-muted-foreground mb-2">{pb.colorPreset}</label>
          <div className="flex flex-wrap gap-3 items-start">
            {/* Inherit option */}
            <button
              type="button"
              title={pb.colorPresetInherit}
              onClick={() => updateBranding({ colorPreset: undefined })}
              className="flex flex-col items-center gap-1"
            >
              <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center bg-muted transition-all ${
                !page.branding.colorPreset
                  ? "border-foreground scale-110 shadow-md"
                  : "border-transparent hover:border-muted-foreground"
              }`}>
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </span>
              <span className={`text-[10px] ${!page.branding.colorPreset ? "text-foreground font-medium" : "text-muted-foreground"}`}>{pb.colorPresetInherit}</span>
            </button>

            {PRESET_NAMES.map((name) => {
              const preset = COLOR_PRESETS[name];
              const active = page.branding.colorPreset === name;
              return (
                <button
                  key={name}
                  type="button"
                  title={preset.label}
                  onClick={() => updateBranding({ colorPreset: name })}
                  className="flex flex-col items-center gap-1"
                >
                  <span
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      active
                        ? "border-foreground scale-110 shadow-md"
                        : "border-transparent hover:border-muted-foreground"
                    }`}
                    style={{ backgroundColor: preset.swatch }}
                  />
                  <span className={`text-[10px] ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Colors (advanced) */}
        <div className="grid grid-cols-2 gap-4">
          {(["primaryColor", "secondaryColor"] as const).map((key) => (
            <div key={key}>
              <label className="block text-xs text-muted-foreground mb-1">
                {key === "primaryColor" ? pb.primaryColor : pb.secondaryColor}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={page.branding[key] ?? (key === "primaryColor" ? "#2563eb" : "#7c3aed")}
                  onChange={(e) => updateBranding({ [key]: e.target.value })}
                  className="w-10 h-10 rounded border border-border cursor-pointer"
                />
                <input
                  type="text"
                  value={page.branding[key] ?? ""}
                  onChange={(e) => updateBranding({ [key]: e.target.value || undefined })}
                  className={`flex-1 ${INPUT_CLS} font-mono`}
                  placeholder={key === "primaryColor" ? "#2563eb" : "#7c3aed"}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Theme */}
        <Field label={pb.defaultTheme}>
          <ToggleGroup
            value={page.branding.defaultTheme}
            options={[{ value: "light", label: `☀️ ${pb.light}` }, { value: "dark", label: `🌙 ${pb.dark}` }]}
            onChange={(v) => updateBranding({ defaultTheme: v })}
          />
        </Field>

        {/* Font family */}
        <Field label={pb.fontFamily}>
          <ToggleGroup
            value={page.branding.fontFamily ?? "system"}
            options={[
              { value: "system", label: pb.system },
              { value: "inter", label: "Inter" },
              { value: "geist", label: "Geist" },
              { value: "serif", label: "Serif" },
            ]}
            onChange={(v) => updateBranding({ fontFamily: v })}
          />
        </Field>
      </Section>

      {/* ── Navigation ── */}
      {(page.layout ?? "page") !== "form_only" && (
        <Section title={pb.navBar}>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={page.nav?.sticky ?? false}
                onChange={(e) => updateNav({ sticky: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-foreground">{pb.navSticky}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={page.nav?.showCta ?? false}
                onChange={(e) => updateNav({ showCta: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-foreground">{pb.navCtaButton}</span>
            </label>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-muted-foreground">{pb.navLinks}</label>
              <button type="button" onClick={addNavLink} className="text-xs text-primary hover:text-primary/80 font-medium">
                {pb.addLink}
              </button>
            </div>
            <div className="space-y-2">
              {navLinks.map((link, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={link.label}
                    onChange={(e) => updateNavLink(i, { label: e.target.value })}
                    className={`flex-1 ${SMALL_INPUT_CLS}`}
                    placeholder={pb.label}
                  />
                  <input
                    type="text"
                    value={link.href}
                    onChange={(e) => updateNavLink(i, { href: e.target.value })}
                    className={`flex-1 ${SMALL_INPUT_CLS}`}
                    placeholder="https://..."
                  />
                  <button type="button" onClick={() => deleteNavLink(i)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              {navLinks.length === 0 && (
                <p className="text-xs text-muted-foreground">{pb.noNavLinks}</p>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ── Hero ── */}
      {(page.layout ?? "page") !== "form_only" && (
        <Section title={pb.heroSection}>
          <div className="grid grid-cols-2 gap-4">
            <Field label={pb.heroHeight}>
              <ToggleGroup
                value={page.hero.height ?? "normal"}
                options={[
                  { value: "compact", label: pb.heightCompact },
                  { value: "normal", label: pb.heightNormal },
                  { value: "tall", label: pb.heightTall },
                  { value: "fullscreen", label: pb.heightFullscreen },
                ]}
                onChange={(v) => updateHero({ height: v })}
              />
            </Field>
            <Field label={pb.textAlign}>
              <ToggleGroup
                value={page.hero.textAlign ?? "center"}
                options={[
                  { value: "center", label: pb.alignCenter },
                  { value: "left", label: pb.alignLeft },
                ]}
                onChange={(v) => updateHero({ textAlign: v })}
              />
            </Field>
          </div>

          <Field label={pb.eyebrow}>
            <input
              type="text"
              value={page.hero.eyebrow ?? ""}
              onChange={(e) => updateHero({ eyebrow: e.target.value || undefined })}
              className={INPUT_CLS}
              placeholder="Nouveau · Disponible maintenant"
            />
          </Field>

          <Field label={pb.mainTitle}>
            <input
              type="text"
              value={page.hero.title}
              onChange={(e) => updateHero({ title: e.target.value })}
              className={INPUT_CLS}
            />
          </Field>

          <Field label={pb.subtitle}>
            <input
              type="text"
              value={page.hero.subtitle ?? ""}
              onChange={(e) => updateHero({ subtitle: e.target.value || undefined })}
              className={INPUT_CLS}
            />
          </Field>

          <Field label={pb.description}>
            <textarea
              value={page.hero.description ?? ""}
              onChange={(e) => updateHero({ description: e.target.value || undefined })}
              rows={2}
              className={`${INPUT_CLS} resize-none`}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={pb.ctaButtonLabel}>
              <input
                type="text"
                value={page.hero.ctaLabel}
                onChange={(e) => updateHero({ ctaLabel: e.target.value })}
                className={INPUT_CLS}
              />
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={page.hero.ctaScrollToForm ?? false}
                  onChange={(e) => updateHero({ ctaScrollToForm: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-foreground">{pb.ctaScrollToForm}</span>
              </label>
            </div>
          </div>

          {/* Background */}
          <Field label={pb.background}>
            <ToggleGroup
              value={page.hero.backgroundVariant ?? "gradient"}
              options={[
                { value: "gradient", label: pb.backgroundGradient },
                { value: "solid", label: pb.backgroundSolid },
                { value: "image", label: pb.backgroundImage },
              ]}
              onChange={(v) => updateHero({ backgroundVariant: v })}
            />
          </Field>

          {page.hero.backgroundVariant === "image" && (
            <Field label={pb.backgroundImageUrl}>
              <input
                type="text"
                value={page.hero.backgroundImage ?? ""}
                onChange={(e) => updateHero({ backgroundImage: e.target.value || undefined })}
                className={INPUT_CLS}
                placeholder="https://..."
              />
            </Field>
          )}

          {/* Hero stats */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-muted-foreground">{pb.heroMetrics}</label>
              <button type="button" onClick={addHeroStat} className="text-xs text-primary hover:text-primary/80 font-medium">
                {pb.add}
              </button>
            </div>
            <div className="space-y-2">
              {heroStats.map((stat, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={stat.value}
                    onChange={(e) => updateHeroStat(i, { value: e.target.value })}
                    className={`w-28 ${SMALL_INPUT_CLS}`}
                    placeholder="1000+"
                  />
                  <input
                    type="text"
                    value={stat.label}
                    onChange={(e) => updateHeroStat(i, { label: e.target.value })}
                    className={`flex-1 ${SMALL_INPUT_CLS}`}
                    placeholder={pb.heroStatLabelPlaceholder}
                  />
                  <button type="button" onClick={() => deleteHeroStat(i)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* ── Blocks ── */}
      {(page.layout ?? "page") !== "form_only" && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">{pb.contentBlocks}</h2>
          </div>

          {/* Add block buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs text-muted-foreground self-center">{pb.addLabel}</span>
            {(["info", "features", "faq", "stats", "testimonials", "quote", "cta", "html", "divider"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => addBlock(type)}
                className="px-2.5 py-1 border border-border rounded text-xs text-foreground hover:bg-muted transition-colors"
              >
                {blockTypeLabels[type]}
              </button>
            ))}
          </div>

          {blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{pb.noBlocks}</p>
          ) : (
            <div className="space-y-2">
              {blocks.map((block, i) => (
                <div key={i} className="border border-border rounded-lg overflow-hidden">
                  {/* Block header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted">
                    <div className="flex flex-col gap-0.5">
                      <button type="button" onClick={() => i > 0 && updatePage({ blocks: move(blocks, i, i - 1) })} disabled={i === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                      </button>
                      <button type="button" onClick={() => i < blocks.length - 1 && updatePage({ blocks: move(blocks, i, i + 1) })} disabled={i === blocks.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>

                    <span className="px-2 py-0.5 rounded bg-background text-xs text-muted-foreground font-mono">{block.type}</span>
                    <span className="flex-1 text-sm text-foreground truncate">{getBlockSummary(block)}</span>

                    {block.type !== "divider" && (
                      <button
                        type="button"
                        onClick={() => setExpandedBlock(expandedBlock === i ? null : i)}
                        className="text-xs text-primary hover:text-primary/80 font-medium"
                      >
                        {expandedBlock === i ? pb.close : pb.edit}
                      </button>
                    )}

                    <button type="button" onClick={() => deleteBlock(i)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  {/* Block editor */}
                  {expandedBlock === i && block.type !== "divider" && (
                    <div className="p-4 space-y-3 border-t border-border">
                      <BlockEditor block={block} onChange={(patch) => updateBlock(i, patch)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <Section title={pb.footerSection}>
        <Field label={pb.footerText}>
          <input
            type="text"
            value={page.footer?.text ?? ""}
            onChange={(e) => updateFooter({ text: e.target.value || undefined })}
            className={INPUT_CLS}
            placeholder="© 2025 Mon Organisation"
          />
        </Field>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-muted-foreground">{pb.footerLinks}</label>
            <button type="button" onClick={addFooterLink} className="text-xs text-primary hover:text-primary/80 font-medium">
              {pb.addLink}
            </button>
          </div>
          <div className="space-y-2">
            {footerLinks.map((link, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => updateFooterLink(i, { label: e.target.value })}
                  className={`flex-1 ${SMALL_INPUT_CLS}`}
                  placeholder={pb.label}
                />
                <input
                  type="text"
                  value={link.url}
                  onChange={(e) => updateFooterLink(i, { url: e.target.value })}
                  className={`flex-1 ${SMALL_INPUT_CLS}`}
                  placeholder="https://..."
                />
                <button type="button" onClick={() => deleteFooterLink(i)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* CGU / CGV */}
        <div className="pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-medium text-foreground">{pb.cguCgv}</p>
              <p className="text-xs text-muted-foreground">{pb.cguCgvDesc}</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={page.footer?.cguCgv?.enabled ?? false}
                onChange={(e) => updateFooter({
                  cguCgv: { ...page.footer?.cguCgv, enabled: e.target.checked, mode: page.footer?.cguCgv?.mode ?? "inline" }
                })}
                className="rounded"
              />
              <span className="text-xs text-muted-foreground">{pb.enable}</span>
            </label>
          </div>

          {page.footer?.cguCgv?.enabled && (
            <div className="space-y-3 pl-3 border-l-2 border-border">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{pb.linkLabel}</label>
                <input
                  type="text"
                  value={page.footer?.cguCgv?.label ?? ""}
                  onChange={(e) => updateFooter({ cguCgv: { ...page.footer!.cguCgv!, label: e.target.value || undefined } })}
                  className={INPUT_CLS}
                  placeholder="CGU / CGV"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-2">{pb.displayMode}</label>
                <div className="flex gap-3">
                  {([
                    { value: "inline", label: pb.modeInline, desc: pb.modeInlineDesc },
                    { value: "link", label: pb.modeLink, desc: pb.modeLinkDesc },
                  ] as const).map((opt) => (
                    <label key={opt.value} className={`flex-1 flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                      (page.footer?.cguCgv?.mode ?? "inline") === opt.value
                        ? "border-ring bg-accent"
                        : "border-border hover:border-ring/50"
                    }`}>
                      <input
                        type="radio"
                        name="cgu-mode"
                        value={opt.value}
                        checked={(page.footer?.cguCgv?.mode ?? "inline") === opt.value}
                        onChange={() => updateFooter({ cguCgv: { ...page.footer!.cguCgv!, mode: opt.value } })}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-xs font-medium text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {(page.footer?.cguCgv?.mode ?? "inline") === "inline" && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    {pb.cguContent} <span className="font-mono bg-muted px-1 py-0.5 rounded text-xs">Markdown</span>
                  </label>
                  <textarea
                    rows={10}
                    value={page.footer?.cguCgv?.content ?? ""}
                    onChange={(e) => updateFooter({ cguCgv: { ...page.footer!.cguCgv!, content: e.target.value } })}
                    className="w-full font-mono text-xs border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                    placeholder={pb.cguPlaceholder}
                  />
                </div>
              )}

              {page.footer?.cguCgv?.mode === "link" && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{pb.externalUrl}</label>
                  <input
                    type="url"
                    value={page.footer?.cguCgv?.url ?? ""}
                    onChange={(e) => updateFooter({ cguCgv: { ...page.footer!.cguCgv!, url: e.target.value } })}
                    className={INPUT_CLS}
                    placeholder="https://example.com/cgu"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Block-specific editors
// ─────────────────────────────────────────────────────────

function BlockEditor({ block, onChange }: { block: PageBlock; onChange: (patch: Partial<PageBlock>) => void }) {
  if (block.type === "info") return <InfoEditor block={block} onChange={onChange} />;
  if (block.type === "features") return <FeaturesEditor block={block} onChange={onChange} />;
  if (block.type === "faq") return <FaqEditor block={block} onChange={onChange} />;
  if (block.type === "stats") return <StatsEditor block={block} onChange={onChange} />;
  if (block.type === "testimonials") return <TestimonialsEditor block={block} onChange={onChange} />;
  if (block.type === "quote") return <QuoteEditor block={block} onChange={onChange} />;
  if (block.type === "cta") return <CtaEditor block={block} onChange={onChange} />;
  if (block.type === "html") return <HtmlEditor block={block} onChange={onChange} />;
  return null;
}

function InfoEditor({ block, onChange }: { block: Extract<PageBlock, { type: "info" }>; onChange: (p: Partial<PageBlock>) => void }) {
  const tr = useTranslations();
  const pb = tr.admin.config.pageBuilder;
  return (
    <>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{pb.titleLabel}</label>
        <input type="text" value={block.title} onChange={(e) => onChange({ title: e.target.value } as Partial<PageBlock>)} className={INPUT_CLS} />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{pb.contentMarkdown}</label>
        <textarea value={block.content} onChange={(e) => onChange({ content: e.target.value } as Partial<PageBlock>)} rows={3} className={`${INPUT_CLS} resize-none`} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{pb.iconLabel}</label>
          <input type="text" value={block.icon ?? ""} onChange={(e) => onChange({ icon: e.target.value || undefined } as Partial<PageBlock>)} className={INPUT_CLS} placeholder="info ou ℹ️" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{pb.variantLabel}</label>
          <select value={block.variant ?? "default"} onChange={(e) => onChange({ variant: e.target.value as "default" | "highlight" | "warning" | "success" } as Partial<PageBlock>)} className={INPUT_CLS}>
            <option value="default">{pb.variantDefault}</option>
            <option value="highlight">{pb.variantHighlight}</option>
            <option value="warning">{pb.variantWarning}</option>
            <option value="success">{pb.variantSuccess}</option>
          </select>
        </div>
      </div>
    </>
  );
}

function FeaturesEditor({ block, onChange }: { block: Extract<PageBlock, { type: "features" }>; onChange: (p: Partial<PageBlock>) => void }) {
  const tr = useTranslations();
  const pb = tr.admin.config.pageBuilder;

  function updateItem(j: number, patch: Partial<{ icon: string; title: string; desc: string }>) {
    const items = [...block.items];
    items[j] = { ...items[j], ...patch };
    onChange({ items } as Partial<PageBlock>);
  }
  function removeItem(j: number) {
    onChange({ items: block.items.filter((_, k) => k !== j) } as Partial<PageBlock>);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{pb.columnsLabel}</label>
          <select value={block.columns ?? 3} onChange={(e) => onChange({ columns: Number(e.target.value) as 2 | 3 | 4 } as Partial<PageBlock>)} className={INPUT_CLS}>
            <option value={2}>{pb.colN.replace("{n}", "2")}</option>
            <option value={3}>{pb.colN.replace("{n}", "3")}</option>
            <option value={4}>{pb.colN.replace("{n}", "4")}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{pb.styleLabel}</label>
          <select value={block.style ?? "cards"} onChange={(e) => onChange({ style: e.target.value as "cards" | "icons_row" | "bullets" } as Partial<PageBlock>)} className={INPUT_CLS}>
            <option value="cards">{pb.styleCards}</option>
            <option value="icons_row">{pb.styleIconsRow}</option>
            <option value="bullets">{pb.styleBullets}</option>
          </select>
        </div>
      </div>
      <div className="space-y-2">
        {block.items.map((item, j) => (
          <div key={j} className="flex items-start gap-2 p-3 bg-muted rounded-lg border border-border">
            <div className="grid grid-cols-3 gap-2 flex-1">
              <input type="text" value={item.icon} onChange={(e) => updateItem(j, { icon: e.target.value })} className={SMALL_INPUT_CLS} placeholder={pb.iconLabel} />
              <input type="text" value={item.title} onChange={(e) => updateItem(j, { title: e.target.value })} className={SMALL_INPUT_CLS} placeholder={pb.titleLabel} />
              <input type="text" value={item.desc} onChange={(e) => updateItem(j, { desc: e.target.value })} className={SMALL_INPUT_CLS} placeholder={pb.description} />
            </div>
            <button type="button" onClick={() => removeItem(j)} className="p-1 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange({ items: [...block.items, { icon: "⭐", title: pb.defaultFeatureTitle, desc: pb.description }] } as Partial<PageBlock>)} className="text-sm text-primary hover:text-primary/80 font-medium">
        {pb.addItem}
      </button>
    </>
  );
}

function FaqEditor({ block, onChange }: { block: Extract<PageBlock, { type: "faq" }>; onChange: (p: Partial<PageBlock>) => void }) {
  const tr = useTranslations();
  const pb = tr.admin.config.pageBuilder;

  function updateItem(j: number, patch: Partial<{ question: string; answer: string }>) {
    const items = [...block.items];
    items[j] = { ...items[j], ...patch };
    onChange({ items } as Partial<PageBlock>);
  }
  function removeItem(j: number) {
    onChange({ items: block.items.filter((_, k) => k !== j) } as Partial<PageBlock>);
  }

  return (
    <>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{pb.sectionTitle}</label>
        <input type="text" value={block.title ?? ""} onChange={(e) => onChange({ title: e.target.value || undefined } as Partial<PageBlock>)} className={INPUT_CLS} placeholder={pb.faqTitlePlaceholder} />
      </div>
      <div className="space-y-3">
        {block.items.map((item, j) => (
          <div key={j} className="p-3 bg-muted rounded-lg border border-border space-y-2">
            <div className="flex items-center gap-2">
              <input type="text" value={item.question} onChange={(e) => updateItem(j, { question: e.target.value })} className={`flex-1 ${SMALL_INPUT_CLS}`} placeholder={pb.questionPlaceholder} />
              <button type="button" onClick={() => removeItem(j)} className="p-1 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <textarea value={item.answer} onChange={(e) => updateItem(j, { answer: e.target.value })} rows={2} className={`w-full ${SMALL_INPUT_CLS} resize-none`} placeholder={pb.answerPlaceholder} />
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange({ items: [...block.items, { question: pb.defaultQuestion, answer: pb.defaultAnswer }] } as Partial<PageBlock>)} className="text-sm text-primary hover:text-primary/80 font-medium">
        {pb.addQuestion}
      </button>
    </>
  );
}

function StatsEditor({ block, onChange }: { block: Extract<PageBlock, { type: "stats" }>; onChange: (p: Partial<PageBlock>) => void }) {
  const tr = useTranslations();
  const pb = tr.admin.config.pageBuilder;

  function updateItem(j: number, patch: Partial<{ value: string; label: string; icon?: string }>) {
    const items = [...block.items];
    items[j] = { ...items[j], ...patch };
    onChange({ items } as Partial<PageBlock>);
  }
  function removeItem(j: number) {
    onChange({ items: block.items.filter((_, k) => k !== j) } as Partial<PageBlock>);
  }

  return (
    <>
      <div className="space-y-2">
        {block.items.map((item, j) => (
          <div key={j} className="flex items-center gap-2 p-2 bg-muted rounded-lg border border-border">
            <input type="text" value={item.icon ?? ""} onChange={(e) => updateItem(j, { icon: e.target.value || undefined })} className={`w-16 ${SMALL_INPUT_CLS}`} placeholder="📊" />
            <input type="text" value={item.value} onChange={(e) => updateItem(j, { value: e.target.value })} className={`w-28 ${SMALL_INPUT_CLS}`} placeholder="1000+" />
            <input type="text" value={item.label} onChange={(e) => updateItem(j, { label: e.target.value })} className={`flex-1 ${SMALL_INPUT_CLS}`} placeholder={pb.statLabelPlaceholder} />
            <button type="button" onClick={() => removeItem(j)} className="p-1 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange({ items: [...block.items, { value: "100+", label: pb.defaultNewStat }] } as Partial<PageBlock>)} className="text-sm text-primary hover:text-primary/80 font-medium">
        {pb.addStat}
      </button>
    </>
  );
}

function TestimonialsEditor({ block, onChange }: { block: Extract<PageBlock, { type: "testimonials" }>; onChange: (p: Partial<PageBlock>) => void }) {
  const tr = useTranslations();
  const pb = tr.admin.config.pageBuilder;

  type Item = { name: string; role?: string; text: string; rating?: number; avatar?: string };
  function updateItem(j: number, patch: Partial<Item>) {
    const items = [...block.items];
    items[j] = { ...items[j], ...patch };
    onChange({ items } as Partial<PageBlock>);
  }
  function removeItem(j: number) {
    onChange({ items: block.items.filter((_, k) => k !== j) } as Partial<PageBlock>);
  }

  return (
    <>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{pb.sectionTitle}</label>
        <input type="text" value={block.title ?? ""} onChange={(e) => onChange({ title: e.target.value || undefined } as Partial<PageBlock>)} className={INPUT_CLS} placeholder={pb.testimonialsTitlePlaceholder} />
      </div>
      <div className="space-y-3">
        {block.items.map((item, j) => (
          <div key={j} className="p-3 bg-muted rounded-lg border border-border space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-24 flex-shrink-0">{pb.testimonialLabel.replace("{n}", String(j + 1))}</span>
              <button type="button" onClick={() => removeItem(j)} className="ml-auto p-1 text-muted-foreground hover:text-destructive transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <textarea value={item.text} onChange={(e) => updateItem(j, { text: e.target.value })} rows={2} className={`w-full ${SMALL_INPUT_CLS} resize-none`} placeholder={pb.testimonialText} />
            <div className="grid grid-cols-3 gap-2">
              <input type="text" value={item.name} onChange={(e) => updateItem(j, { name: e.target.value })} className={SMALL_INPUT_CLS} placeholder={pb.name} />
              <input type="text" value={item.role ?? ""} onChange={(e) => updateItem(j, { role: e.target.value || undefined })} className={SMALL_INPUT_CLS} placeholder={pb.role} />
              <input type="number" min={1} max={5} value={item.rating ?? ""} onChange={(e) => updateItem(j, { rating: e.target.value ? Number(e.target.value) : undefined })} className={SMALL_INPUT_CLS} placeholder={pb.rating} />
            </div>
            <input type="text" value={item.avatar ?? ""} onChange={(e) => updateItem(j, { avatar: e.target.value || undefined })} className={`w-full ${SMALL_INPUT_CLS}`} placeholder={pb.avatar} />
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange({ items: [...block.items, { name: pb.defaultTestimonialName, text: pb.defaultTestimonialText }] } as Partial<PageBlock>)} className="text-sm text-primary hover:text-primary/80 font-medium">
        {pb.addTestimonial}
      </button>
    </>
  );
}

function QuoteEditor({ block, onChange }: { block: Extract<PageBlock, { type: "quote" }>; onChange: (p: Partial<PageBlock>) => void }) {
  const tr = useTranslations();
  const pb = tr.admin.config.pageBuilder;
  return (
    <>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{pb.quoteText}</label>
        <textarea value={block.text} onChange={(e) => onChange({ text: e.target.value } as Partial<PageBlock>)} rows={3} className={`${INPUT_CLS} resize-none`} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{pb.author}</label>
          <input type="text" value={block.author ?? ""} onChange={(e) => onChange({ author: e.target.value || undefined } as Partial<PageBlock>)} className={INPUT_CLS} placeholder="Steve Jobs" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{pb.role}</label>
          <input type="text" value={block.role ?? ""} onChange={(e) => onChange({ role: e.target.value || undefined } as Partial<PageBlock>)} className={INPUT_CLS} placeholder="CEO d'Apple" />
        </div>
      </div>
    </>
  );
}

function CtaEditor({ block, onChange }: { block: Extract<PageBlock, { type: "cta" }>; onChange: (p: Partial<PageBlock>) => void }) {
  const tr = useTranslations();
  const pb = tr.admin.config.pageBuilder;
  return (
    <>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{pb.titleLabel}</label>
        <input type="text" value={block.title} onChange={(e) => onChange({ title: e.target.value } as Partial<PageBlock>)} className={INPUT_CLS} />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{pb.description}</label>
        <input type="text" value={block.description ?? ""} onChange={(e) => onChange({ description: e.target.value || undefined } as Partial<PageBlock>)} className={INPUT_CLS} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{pb.buttonLabel}</label>
          <input type="text" value={block.label} onChange={(e) => onChange({ label: e.target.value } as Partial<PageBlock>)} className={INPUT_CLS} />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={block.scrollToForm ?? false}
              onChange={(e) => onChange({ scrollToForm: e.target.checked } as Partial<PageBlock>)}
              className="rounded"
            />
            <span className="text-sm text-foreground">{pb.scrollToForm}</span>
          </label>
        </div>
      </div>
    </>
  );
}

function HtmlEditor({ block, onChange }: { block: Extract<PageBlock, { type: "html" }>; onChange: (p: Partial<PageBlock>) => void }) {
  const tr = useTranslations();
  const pb = tr.admin.config.pageBuilder;
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">
        {pb.htmlRaw}{" "}
        <span className="text-amber-600">— {pb.htmlWarning}</span>
      </label>
      <textarea
        value={block.content}
        onChange={(e) => onChange({ content: e.target.value } as Partial<PageBlock>)}
        rows={8}
        className="w-full font-mono text-xs border border-input rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 resize-y"
        placeholder={pb.htmlPlaceholder}
      />
    </div>
  );
}
