import * as fs from "node:fs";
import * as path from "node:path";
import { load as loadYaml } from "js-yaml";
import { yamlConfigSchema, type YamlConfig } from "./configSchema";

// Module-level cache — populated once per process, cleared only by invalidateYamlConfigCache()
let _cached: YamlConfig | null | undefined = undefined; // undefined = not yet loaded

/**
 * Reads and validates the YAML config file.
 *
 * Path resolution:
 *   1. CONFIG_YAML_PATH env var (absolute or relative to cwd)
 *   2. ./config.yaml in the project root
 *
 * Returns null if the file does not exist (YAML mode is opt-in, not required).
 * Throws if the file exists but fails to parse or fails schema validation.
 * Cached after the first call — restarts clear the cache automatically.
 */
export function loadYamlConfig(): YamlConfig | null {
  if (_cached !== undefined) return _cached;

  const rawPath = process.env.CONFIG_YAML_PATH ?? path.resolve(process.cwd(), "config.yaml");
  const filePath = path.resolve(rawPath); // normalise les ".." et symlinks relatifs

  // Only allow .yaml / .yml extensions — prevents accidental reads of .env or other secrets
  if (!/\.ya?ml$/i.test(filePath)) {
    throw new Error(
      `[config.yaml] CONFIG_YAML_PATH must point to a .yaml or .yml file (got: ${filePath})`
    );
  }

  if (!fs.existsSync(filePath)) {
    _cached = null;
    return null;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(`[config.yaml] Impossible de lire ${filePath} : ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = loadYaml(raw);
  } catch (err) {
    throw new Error(`[config.yaml] YAML invalide dans ${filePath} : ${(err as Error).message}`);
  }

  const result = yamlConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`[config.yaml] Invalid schema:\n${issues}`);
  }

  _cached = result.data;
  console.info(
    `[config.yaml] Loaded: ${filePath}` +
    ` (${result.data.forms?.length ?? 0} formulaire(s), policy=${result.data.app?.enforcePasswordPolicy ?? false})`
  );
  return _cached;
}

/** Clears the in-memory cache — useful for tests. */
export function invalidateYamlConfigCache(): void {
  _cached = undefined;
}
