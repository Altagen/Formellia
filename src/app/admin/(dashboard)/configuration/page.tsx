import { getFormConfig, isConfigEditable } from "@/lib/config";
import { listFormInstances } from "@/lib/db/formInstanceLoader";
import { ConfigEditor } from "@/components/admin/ConfigEditor";
import { ConfigViewer } from "@/components/admin/ConfigViewer";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export default async function ConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [config, formInstances, admins, params] = await Promise.all([
    getFormConfig(),
    listFormInstances(),
    db.select({ id: users.id, username: users.username, email: users.email, role: users.role }).from(users),
    searchParams,
  ]);
  const editable = isConfigEditable();
  const rootInstance = formInstances.find(i => i.slug === "/");

  return editable
    ? <ConfigEditor config={config} formInstances={formInstances} admins={admins} initialTab={params.tab} />
    : <ConfigViewer config={config} rootInstance={rootInstance} />;
}
