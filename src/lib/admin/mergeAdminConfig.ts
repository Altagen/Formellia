import type { AdminView, TableColumnDef } from "@/types/config";

/**
 * Merge incoming dashboard pages into the existing set.
 *
 *   - "replace": the incoming list becomes the exact set — pages absent from it are dropped.
 *   - "append": upsert by `id` — an incoming page with the same `id` updates the existing
 *     page in place (preserving its position), a new `id` is appended at the end, and
 *     existing pages whose `id` isn't in the incoming list are left untouched.
 *
 * In append mode every incoming page must carry a non-empty string `id` (the upsert key);
 * a missing id throws.
 */
export function mergeAdminViews(
  current: AdminView[],
  incoming: AdminView[],
  mode: "append" | "replace",
): AdminView[] {
  if (mode === "replace") return incoming;
  for (const page of incoming) {
    if (!page || typeof page.id !== "string" || page.id === "") {
      throw new Error("Each dashboard page needs a non-empty string id to be merged in append mode");
    }
  }
  const incomingById = new Map(incoming.map(p => [p.id, p]));
  const updated = current.map(p => incomingById.get(p.id) ?? p);
  const currentIds = new Set(current.map(p => p.id));
  const added = incoming.filter(p => !currentIds.has(p.id));
  return [...updated, ...added];
}

/** Upsert-by-`id` merge for the global submissions-table columns — same semantics as pages. */
export function mergeTableColumns(
  current: TableColumnDef[],
  incoming: TableColumnDef[],
  mode: "append" | "replace",
): TableColumnDef[] {
  if (mode === "replace") return incoming;
  for (const col of incoming) {
    if (!col || typeof col.id !== "string" || col.id === "") {
      throw new Error("Each table column needs a non-empty string id to be merged in append mode");
    }
  }
  const incomingById = new Map(incoming.map(c => [c.id, c]));
  const updated = current.map(c => incomingById.get(c.id) ?? c);
  const currentIds = new Set(current.map(c => c.id));
  const added = incoming.filter(c => !currentIds.has(c.id));
  return [...updated, ...added];
}
