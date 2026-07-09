import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getFormInstance } from "@/lib/db/formInstanceLoader";
import { getFormConfig } from "@/lib/config";
import { getTranslations } from "@/i18n";
import { InstanceEditorPage } from "./InstanceEditorPage";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function FormEditorPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  // Root form is served under the "_root" URL sentinel (a raw "/" cannot appear
  // inside a URL segment). Decode back before looking up the instance.
  const slug = rawSlug === "_root" ? "/" : rawSlug;
  const [instance, config] = await Promise.all([
    getFormInstance(slug),
    getFormConfig(),
  ]);
  if (!instance) notFound();
  const tr = getTranslations(config.locale);
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <Link
        href="/admin/forms"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        {tr.admin.formsList.backToList}
      </Link>
      <InstanceEditorPage instance={instance} />
    </div>
  );
}
