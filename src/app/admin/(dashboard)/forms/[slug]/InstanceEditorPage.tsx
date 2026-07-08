"use client";

import { useRouter } from "next/navigation";
import { InstanceEditor } from "@/components/admin/config/FormsTab";
import type { FormInstance } from "@/types/formInstance";

interface Props {
  instance: FormInstance;
}

/**
 * Client wrapper for InstanceEditor when reached via the standalone
 * /admin/forms/[slug] route (not the Configuration > Forms tab). After save
 * we refresh the server data; after delete we go back to the forms list.
 */
export function InstanceEditorPage({ instance }: Props) {
  const router = useRouter();
  return (
    <InstanceEditor
      instance={instance}
      onSaved={() => router.refresh()}
      onDeleted={() => router.push("/admin/forms")}
    />
  );
}
