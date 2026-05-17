import { notFound } from "next/navigation";
import { getBroadcast } from "@/lib/email/broadcastCrud";
import { listDataPools } from "@/lib/datapools/crud";
import { getBroadcastEmailConfigSafe } from "@/lib/email/broadcastConfig";
import { BroadcastComposerClient } from "./BroadcastComposerClient";

export const dynamic = "force-dynamic";

export default async function BroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [broadcast, pools, providerCfg] = await Promise.all([
    getBroadcast(id),
    listDataPools(),
    getBroadcastEmailConfigSafe(),
  ]);
  if (!broadcast) notFound();

  return (
    <BroadcastComposerClient
      broadcast={broadcast}
      pools={pools.map(p => ({ id: p.id, name: p.name, slug: p.slug }))}
      providerConfig={providerCfg}
    />
  );
}
