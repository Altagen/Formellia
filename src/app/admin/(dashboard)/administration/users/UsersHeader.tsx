"use client";

import { AdministrationHeader } from "../AdministrationHeader";
import { useTranslations } from "@/lib/context/LocaleContext";

export function UsersHeader() {
  const tr = useTranslations();
  return <AdministrationHeader crumb={tr.admin.config.users.landingUsersTitle} />;
}
