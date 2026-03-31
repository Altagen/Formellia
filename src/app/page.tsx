import { getFormConfig } from "@/lib/config";
import { getFormInstance } from "@/lib/db/formInstanceLoader";
import { getUseCustomRoot } from "@/lib/security/rootPageConfig";
import { LandingPage } from "@/components/page/LandingPage";
import { WelcomePage } from "@/components/WelcomePage";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const useCustomRoot = await getUseCustomRoot();

  if (!useCustomRoot) {
    return <WelcomePage />;
  }

  const [instance, globalConfig] = await Promise.all([
    getFormInstance("/"),
    getFormConfig(),
  ]);

  // If admin enabled custom root but hasn't created a "/" form yet, fall back gracefully.
  if (!instance || !instance.config.features.landingPage) {
    return <WelcomePage />;
  }

  return <LandingPage instanceConfig={instance.config} globalConfig={globalConfig} />;
}
