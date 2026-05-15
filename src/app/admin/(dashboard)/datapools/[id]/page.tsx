import { notFound } from "next/navigation";
import { getDataPool } from "@/lib/datapools/crud";
import { listFormInstances } from "@/lib/db/formInstanceLoader";
import { DataPoolDetailClient } from "./DataPoolDetailClient";

export const dynamic = "force-dynamic";

export default async function DataPoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pool, formInstances] = await Promise.all([
    getDataPool(id),
    listFormInstances(),
  ]);
  if (!pool) notFound();

  const forms = formInstances.map((fi) => ({
    id: fi.id,
    slug: fi.slug,
    name: fi.name,
    fields: fi.config.form.steps.flatMap((s) =>
      s.fields
        .filter((f) => f.type !== "section_header" && f.type !== "alert")
        .map((f) => ({ id: f.dbKey ?? f.id, label: f.label, type: f.type })),
    ),
  }));

  return <DataPoolDetailClient pool={pool} forms={forms} />;
}
