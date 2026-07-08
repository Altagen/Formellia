import { listBroadcasts } from "@/lib/email/broadcastCrud";
import { listDataPools } from "@/lib/datapools/crud";
import { listEmailProviders } from "@/lib/email/providers";
import { BroadcastsListClient } from "./BroadcastsListClient";

export const dynamic = "force-dynamic";

export default async function BroadcastsPage() {
  const [broadcasts, pools, providers] = await Promise.all([
    listBroadcasts(),
    listDataPools(),
    listEmailProviders(),
  ]);
  return (
    <BroadcastsListClient
      initialBroadcasts={broadcasts}
      pools={pools.map(p => ({ id: p.id, name: p.name, slug: p.slug }))}
      providers={providers}
    />
  );
}
