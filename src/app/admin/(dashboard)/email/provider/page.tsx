import { getBroadcastEmailConfigSafe } from "@/lib/email/globalEmailConfig";
import { BroadcastProviderClient } from "./BroadcastProviderClient";

export const dynamic = "force-dynamic";

export default async function BroadcastProviderPage() {
  const cfg = await getBroadcastEmailConfigSafe();
  return <BroadcastProviderClient initial={cfg} />;
}
