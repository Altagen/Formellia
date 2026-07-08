import { notFound, redirect } from "next/navigation";
import { getFormConfig } from "@/lib/config";
import { listFormInstances } from "@/lib/db/formInstanceLoader";
import { validateAdminSession, requireRole } from "@/lib/auth/validateSession";
import { ViewEditorClient } from "./ViewEditorClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ViewEditPage({ params }: Props) {
  const { id } = await params;
  const user = await validateAdminSession();
  if (!user) redirect("/admin/login");
  const guard = await requireRole("admin");
  if (guard) redirect("/admin");

  const config    = await getFormConfig();
  const instances = await listFormInstances();

  const page = config.admin.pages.find(pg => pg.id === id);
  if (!page) notFound();

  return (
    <ViewEditorClient
      config={config}
      formInstances={instances}
      pageId={id}
    />
  );
}
