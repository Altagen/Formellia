import { promises as fs } from "node:fs";
import { join, resolve, sep, basename } from "node:path";
import type { BackupListEntry, BackupProvider, LocalProviderConfig } from "../types";

// Directories that must never be used as a backup root, regardless of admin config
const BLOCKED_DIR_PREFIXES = ["/etc", "/usr", "/sys", "/proc", "/dev", "/root", "/boot", "/bin", "/sbin", "/lib"];

export class LocalProvider implements BackupProvider {
  private dir: string;

  constructor(config: LocalProviderConfig) {
    const resolved = resolve(config.path);
    if (BLOCKED_DIR_PREFIXES.some(p => resolved === p || resolved.startsWith(p + sep))) {
      throw new Error(`Forbidden backup directory : ${resolved}`);
    }
    this.dir = config.path;
  }

  /**
   * Resolves the full path for a key and verifies it is strictly inside this.dir.
   * Prevents path traversal attacks (e.g. key = "../../etc/passwd").
   */
  private safePath(key: string): string {
    const base    = resolve(this.dir);
    const full    = resolve(join(base, key));
    // Must start with base + separator so "base/../other" is rejected
    if (full !== base && !full.startsWith(base + sep)) {
      throw new Error(`Access denied: path escapes the backup directory (${key})`);
    }
    return full;
  }

  async upload(key: string, data: Buffer): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const full = this.safePath(key);
    await fs.writeFile(full, data);
  }

  async download(key: string): Promise<Buffer> {
    const full = this.safePath(key);
    return fs.readFile(full);
  }

  async list(): Promise<BackupListEntry[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.dir);
    } catch (err: unknown) {
      // Directory doesn't exist yet → empty list
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }

    const results: BackupListEntry[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".zip")) continue;
      const full = join(this.dir, entry);
      const stat = await fs.stat(full);
      if (!stat.isFile()) continue;
      results.push({
        key:       entry,
        filename:  basename(entry),
        size:      stat.size,
        createdAt: stat.birthtime,
      });
    }

    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async delete(key: string): Promise<void> {
    const full = this.safePath(key);
    await fs.unlink(full);
  }

  async testConnection(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    // safePath on a known-safe name — just checks write+delete
    const probe = join(resolve(this.dir), ".probe");
    await fs.writeFile(probe, "ok");
    await fs.unlink(probe);
  }
}
