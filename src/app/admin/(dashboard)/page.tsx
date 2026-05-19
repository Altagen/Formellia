import { redirect } from "next/navigation";
import { getFormConfig } from "@/lib/config";

export default async function AdminView() {
  const config = await getFormConfig();

  if (config.admin.defaultView) {
    redirect(`/admin/${config.admin.defaultView}`);
  }

  redirect("/admin/configuration");
}
