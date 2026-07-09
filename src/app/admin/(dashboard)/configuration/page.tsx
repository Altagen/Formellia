import { getFormConfig, isConfigEditable } from "@/lib/config";
import { listFormInstances } from "@/lib/db/formInstanceLoader";
import { ConfigEditor } from "@/components/admin/ConfigEditor";
import { ConfigViewer } from "@/components/admin/ConfigViewer";

export default async function ConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [config, formInstances, params] = await Promise.all([
    getFormConfig(),
    listFormInstances(),
    searchParams,
  ]);
  const editable = isConfigEditable();
  const rootInstance = formInstances.find(i => i.slug === "/");

  return editable
    ? <ConfigEditor config={config} formInstances={formInstances} initialTab={params.tab} />
    : <ConfigViewer config={config} rootInstance={rootInstance} />;
}
