import { getFormConfig } from "@/lib/config";
import { getTranslations } from "@/i18n";
import { ViewsList } from "./ViewsList";

export default async function ViewsListPage() {
  const config = await getFormConfig();
  const tr = getTranslations(config.locale);
  const folders = (config.admin.folders ?? []).filter((f) => f.kind === "views");
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{tr.admin.viewsList.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{tr.admin.viewsList.subtitle.replace("{n}", String(config.admin.pages.length))}</p>
      </div>
      <ViewsList
        views={config.admin.pages.map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          icon: p.icon ?? null,
          widgetCount: p.widgets.length,
          formInstanceId: p.formInstanceId ?? null,
          folderId: p.folderId ?? null,
        }))}
        folders={folders}
      />
    </div>
  );
}
