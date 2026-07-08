import { listDataPools } from "@/lib/datapools/crud";
import { listFormInstances } from "@/lib/db/formInstanceLoader";
import { DataPoolsListClient } from "./DataPoolsListClient";

export const dynamic = "force-dynamic";

export default async function DataPoolsPage() {
  const [pools, formInstances] = await Promise.all([
    listDataPools(),
    listFormInstances(),
  ]);
  // Strip the per-form `config` from the wire payload — the editor only needs
  // the form steps to auto-detect candidate key fields, so we pass a slim shape.
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
  return <DataPoolsListClient initialPools={pools} forms={forms} />;
}
