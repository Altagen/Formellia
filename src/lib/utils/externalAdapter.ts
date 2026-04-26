import type { Submission } from "@/lib/db/schema";

export function externalRecordToSubmission(r: {
  id: string;
  data: unknown;
  importedAt: Date | null;
}): Submission {
  const data = (r.data as Record<string, unknown>) ?? {};
  // Use a date field from the data itself for meaningful temporal charts.
  // Falls back to importedAt if none found.
  const dateFromData =
    data.purchase_date ?? data.date ?? data.created_at ??
    data.timestamp ?? data.submittedAt ?? null;
  const submittedAt = dateFromData
    ? new Date(String(dateFromData))
    : (r.importedAt ?? new Date());

  const email = String(data.email ?? "");
  if (!email) {
    console.warn(`[externalAdapter] Record ${r.id} has no email field — stored as empty string`);
  }

  return {
    id: r.id,
    email,
    formData: data,
    submittedAt: isNaN(submittedAt.getTime()) ? (r.importedAt ?? new Date()) : submittedAt,
    // Map boolean `purchased` field → status "done" / "pending"
    status: (data.status
      ? String(data.status)
      : data.purchased === true || data.purchased === "true"
        ? "done"
        : "pending") as Submission["status"],
    priority: String(data.priority ?? "none") as Submission["priority"],
    receivedAt: (data.receivedAt as string) ?? null,
    dueDate: (data.dueDate as string) ?? null,
    notes: (data.notes as string) ?? null,
    assignedToId: null,
    assignedToEmail: null,
    ipHash: null,
    formInstanceId: null,
  };
}
