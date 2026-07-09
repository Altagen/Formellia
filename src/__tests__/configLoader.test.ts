import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadYamlConfig, invalidateYamlConfigCache } from "@/lib/yaml/configLoader";

const originalEnv = { ...process.env };
const originalCwd = process.cwd();
let tmpDir = "";

function writeConfig(name: string, contents: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, contents, "utf-8");
  return p;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-"));
  invalidateYamlConfigCache();
});

afterEach(() => {
  process.env = { ...originalEnv };
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  invalidateYamlConfigCache();
});

describe("loadYamlConfig", () => {
  it("returns null when no config.yaml exists (opt-in mode)", () => {
    process.chdir(tmpDir);
    expect(loadYamlConfig()).toBeNull();
  });

  it("loads and validates a minimal valid config", () => {
    process.env.CONFIG_YAML_PATH = writeConfig("config.yaml", "app:\n  enforcePasswordPolicy: true\n");
    const loaded = loadYamlConfig();
    expect(loaded?.app?.enforcePasswordPolicy).toBe(true);
  });

  it("caches after first load (subsequent calls return same reference)", () => {
    process.env.CONFIG_YAML_PATH = writeConfig("config.yaml", "app:\n  enforcePasswordPolicy: false\n");
    const a = loadYamlConfig();
    const b = loadYamlConfig();
    expect(a).toBe(b);
  });

  it("invalidateYamlConfigCache lets the next call re-read", () => {
    const p = writeConfig("config.yaml", "app:\n  enforcePasswordPolicy: false\n");
    process.env.CONFIG_YAML_PATH = p;
    const first = loadYamlConfig();
    fs.writeFileSync(p, "app:\n  enforcePasswordPolicy: true\n", "utf-8");
    invalidateYamlConfigCache();
    const second = loadYamlConfig();
    expect(first?.app?.enforcePasswordPolicy).toBe(false);
    expect(second?.app?.enforcePasswordPolicy).toBe(true);
  });

  it("rejects paths without a .yaml / .yml extension", () => {
    process.env.CONFIG_YAML_PATH = path.join(tmpDir, "config.env");
    expect(() => loadYamlConfig()).toThrow(/.yaml or .yml/);
  });

  it("throws with an actionable message on syntactically invalid YAML", () => {
    process.env.CONFIG_YAML_PATH = writeConfig("bad.yaml", "app:\n  enforcePasswordPolicy: [unclosed\n");
    expect(() => loadYamlConfig()).toThrow(/Invalid YAML/);
  });

  it("throws when the parsed shape fails schema validation", () => {
    process.env.CONFIG_YAML_PATH = writeConfig("bad.yaml", "app:\n  enforcePasswordPolicy: 42\n");
    expect(() => loadYamlConfig()).toThrow(/Invalid schema/);
  });
});
