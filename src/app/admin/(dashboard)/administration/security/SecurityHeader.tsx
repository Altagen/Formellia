"use client";

import { AdministrationHeader } from "../AdministrationHeader";
import { useTranslations } from "@/lib/context/LocaleContext";

export function SecurityHeader() {
  const tr = useTranslations();
  return <AdministrationHeader crumb={tr.admin.config.users.landingSecurityTitle} />;
}
