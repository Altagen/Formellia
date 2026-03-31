// ─────────────────────────────────────────────────────────
// Backup system — shared types
// ─────────────────────────────────────────────────────────

export interface BackupListEntry {
  /** Provider-specific unique identifier (path, S3 key, etc.) */
  key: string;
  /** Human-readable filename */
  filename: string;
  /** Size in bytes */
  size: number;
  /** When the backup was created */
  createdAt: Date;
}

/**
 * Abstract interface every provider must implement.
 * The backup engine is provider-agnostic — it calls these methods only.
 */
export interface BackupProvider {
  upload(key: string, data: Buffer): Promise<void>;
  download(key: string): Promise<Buffer>;
  list(): Promise<BackupListEntry[]>;
  delete(key: string): Promise<void>;
  testConnection(): Promise<void>;
}

export type ProviderType = "local" | "s3";

// ─── Provider-specific config shapes (stored encrypted in DB) ─────────────

export interface LocalProviderConfig {
  /** Absolute path to the directory where backups are stored */
  path: string;
}

export interface S3ProviderConfig {
  /** Full endpoint URL, e.g. "https://s3.amazonaws.com" or "https://minio.example.com:9000" */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Required for MinIO, Cloudflare R2, DigitalOcean Spaces, etc. */
  forcePathStyle?: boolean;
  /** Optional key prefix (without trailing slash), e.g. "backups" */
  prefix?: string;
}

// ─── Backup manifest ──────────────────────────────────────────────────────

export interface BackupManifest {
  version: number;
  format: "zip+jsonl";
  exportedAt: string;
  sections: string[];
  forms: Array<{ slug: string; submissionCount: number }>;
  datasets: Array<{ name: string; recordCount: number }>;
}
