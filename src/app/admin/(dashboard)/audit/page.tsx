import { notFound } from "next/navigation";
import { getFormConfig } from "@/lib/config";
import { getTranslations } from "@/i18n";
import { AuditLogClient } from "./AuditLogClient";

export default async function AuditPage() {
  const config = await getFormConfig();
  if (!config.admin.features?.auditLog) notFound();
  const tr = getTranslations(config.locale);
  const al = tr.admin.auditLog;
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">{al.pageTitle}</h1>
        <p className="text-sm text-muted-foreground mt-1">{al.pageSubtitle}</p>
      </div>
      <AuditLogClient />
    </div>
  );
}
