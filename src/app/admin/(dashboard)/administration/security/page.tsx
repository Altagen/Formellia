import { SecuritySection } from "@/components/admin/administration/SecuritySection";
import { SecurityHeader } from "./SecurityHeader";

export default function AdministrationSecurityPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <SecurityHeader />
      <SecuritySection />
    </div>
  );
}
