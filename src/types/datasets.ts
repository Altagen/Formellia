export interface ColumnDef {
  source: string;
  label?: string;
  type: "text" | "number" | "date" | "email" | "currency" | "boolean";
  role?: "email" | "submittedAt" | "status" | "priority" | "dueDate" | "amount" | null;
  currencySymbol?: string;
}

export interface ExternalDataset {
  id: string;
  name: string;
  description?: string;
  sourceType: "file" | "api";
  apiUrl?: string;
  apiHeaders?: Record<string, string>;
  pollIntervalMinutes?: number;
  importMode: "append" | "replace" | "dedup";
  dedupKey?: string;
  fieldMap?: Record<string, string>;
  columnDefs?: ColumnDef[];
  recordCount: number;
  lastImportedAt?: string;
  createdAt: string;
}
