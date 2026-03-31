import { getFormConfig } from "@/lib/config";
import { getFormInstance } from "@/lib/db/formInstanceLoader";
import { LandingPage } from "@/components/page/LandingPage";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ formSlug: string }>;
}

export default async function FormSlugPage({ params }: Props) {
  const { formSlug } = await params;

  const [instance, globalConfig] = await Promise.all([
    getFormInstance(formSlug),
    getFormConfig(),
  ]);

  if (!instance || !instance.config.features.landingPage) notFound();

  const submitUrl = instance.slug === "/"
    ? "/api/submit"
    : `/api/forms/${instance.slug}/submit`;

  return (
    <LandingPage
      instanceConfig={instance.config}
      globalConfig={globalConfig}
      submitUrl={submitUrl}
    />
  );
}
