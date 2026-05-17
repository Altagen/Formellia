import { listBroadcasts } from "@/lib/email/broadcastCrud";
import { listDataPools } from "@/lib/datapools/crud";
import { getBroadcastEmailConfigSafe } from "@/lib/email/broadcastConfig";
import { BroadcastsListClient } from "./BroadcastsListClient";

export const dynamic = "force-dynamic";

export default async function BroadcastsPage() {
  const [broadcasts, pools, providerCfg] = await Promise.all([
    listBroadcasts(),
    listDataPools(),
    getBroadcastEmailConfigSafe(),
  ]);
  return (
    <BroadcastsListClient
      initialBroadcasts={broadcasts}
      pools={pools.map(p => ({ id: p.id, name: p.name, slug: p.slug }))}
      providerConfig={providerCfg}
    />
  );
}
