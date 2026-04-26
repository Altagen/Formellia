import { notFound } from "next/navigation";
import { getFormConfig } from "@/lib/config";
import { AuditLogClient } from "./AuditLogClient";

export default async function AuditPage() {
  const config = await getFormConfig();
  if (!config.admin.features?.auditLog) notFound();
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Journal d&apos;audit</h1>
        <p className="text-sm text-muted-foreground mt-1">Historique de toutes les actions administratives sensibles.</p>
      </div>
      <AuditLogClient />
    </div>
  );
}
