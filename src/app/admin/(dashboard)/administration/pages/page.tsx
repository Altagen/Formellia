import { PagesSection } from "@/components/admin/administration/PagesSection";
import { PagesHeader } from "./PagesHeader";

export default function AdministrationPagesPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PagesHeader />
      <PagesSection />
    </div>
  );
}
