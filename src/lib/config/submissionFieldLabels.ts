/**
 * Human-readable labels for submission fields — shared between single and bulk update routes.
 * Used to produce readable audit trail entries in submission_events.
 */
export const SUBMISSION_FIELD_LABELS: Record<string, string> = {
  status:          "Statut",
  priority:        "Priority",
  dueDate:    "Due date",
  notes:           "Notes",
  assignedToId:    "Assigned to (id)",
  assignedToEmail: "Assigned to",
};
