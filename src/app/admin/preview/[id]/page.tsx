import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { lucia } from "@/lib/auth/lucia";
import { resolveEffectiveRole } from "@/lib/auth/permissions";
import { getFormInstanceById } from "@/lib/db/formInstanceLoader";
import { getFormConfig } from "@/lib/config";
import { LandingPage } from "@/components/page/LandingPage";
import { PreviewBanner } from "@/components/admin/PreviewBanner";
import { buildCssVars } from "@/lib/theme/cssVars";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FormPreviewPage({ params }: Props) {
  const { id } = await params;

  // ── Auth — require session cookie (middleware already blocks unauthenticated) ──
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(lucia.sessionCookieName)?.value;
  if (!sessionId) redirect("/admin/login");

  const { user } = await lucia.validateSession(sessionId);
  if (!user) redirect("/admin/login");

  // ── Authorization — viewer+ on this form ──
  const effective = await resolveEffectiveRole(user.id, id);
  if (!effective) notFound();

  // ── Data ──
  const [instance, globalConfig] = await Promise.all([
    getFormInstanceById(id),
    getFormConfig(),
  ]);

  if (!instance) notFound();

  const submitUrl = instance.slug === "/"
    ? "/api/submit"
    : `/api/forms/${instance.slug}/submit`;

  const branding = instance.config.page?.branding;
  const cssVars = branding ? buildCssVars(branding) : null;

  return (
    <>
      {cssVars && <style dangerouslySetInnerHTML={{ __html: cssVars }} />}
      <PreviewBanner formName={instance.name} />
      <LandingPage
        instanceConfig={instance.config}
        globalConfig={globalConfig}
        submitUrl={submitUrl}
      />
    </>
  );
}
