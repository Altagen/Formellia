import { redirect } from "next/navigation";
import { getFormConfig } from "@/lib/config";

export default async function AdminPage() {
  const config = await getFormConfig();

  if (config.admin.defaultPage) {
    redirect(`/admin/${config.admin.defaultPage}`);
  }

  redirect("/admin/configuration");
}
