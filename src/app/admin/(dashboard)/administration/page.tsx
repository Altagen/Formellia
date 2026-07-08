import { AdministrationHeader } from "./AdministrationHeader";
import { AdministrationLanding } from "@/components/admin/administration/AdministrationLanding";

export default function AdministrationPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <AdministrationHeader />
      <AdministrationLanding />
    </div>
  );
}
