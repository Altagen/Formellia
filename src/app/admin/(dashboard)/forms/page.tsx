import { listFormInstances } from "@/lib/db/formInstanceLoader";
import { getFormConfig } from "@/lib/config";
import { getTranslations } from "@/i18n";
import { FormsList } from "./FormsList";

export default async function FormsListPage() {
  const [instances, config] = await Promise.all([
    listFormInstances(),
    getFormConfig(),
  ]);
  const tr = getTranslations(config.locale);
  const folders = (config.admin.folders ?? []).filter((f) => f.kind === "forms");
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{tr.admin.formsList.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{tr.admin.formsList.subtitle.replace("{n}", String(instances.length))}</p>
      </div>
      <FormsList
        instances={instances.map((i) => ({
          id: i.id,
          slug: i.slug,
          name: i.name,
          emoji: i.config.meta?.emoji ?? null,
          active: i.config.features?.form !== false,
          updatedAt: i.updatedAt.toISOString(),
          folderId: i.config.meta?.folderId ?? null,
        }))}
        folders={folders}
      />
    </div>
  );
}
