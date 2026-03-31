import type { Metadata } from "next";
import "./globals.css";
import { getFormConfig, ensureConfigSeeded } from "@/lib/config";
import { getFormInstance } from "@/lib/db/formInstanceLoader";
import { buildCssVars } from "@/lib/theme/cssVars";
import { LocaleProvider } from "@/lib/context/LocaleContext";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  // Use the root form instance for public-facing metadata
  const rootInstance = await getFormInstance("/");
  if (rootInstance) {
    return {
      title: rootInstance.config.meta.title,
      description: rootInstance.config.meta.description,
    };
  }
  // Fallback for admin-only contexts
  return { title: "Formellia" };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Seed DB config and form instances on first boot
  // (no-op in file mode or if already seeded)
  await ensureConfigSeeded();

  // Use root instance branding for CSS variables and document locale
  const [rootInstance, globalConfig] = await Promise.all([
    getFormInstance("/"),
    getFormConfig(),
  ]);

  const branding = rootInstance?.config.page.branding;
  const locale = rootInstance?.config.meta.locale ?? "fr";
  const cssVars = branding ? buildCssVars(branding) : null;

  // Suppress unused warning — globalConfig is fetched here to warm the cache
  void globalConfig;

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {cssVars && <style dangerouslySetInnerHTML={{ __html: cssVars }} />}
      </head>
      <body className="antialiased">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
