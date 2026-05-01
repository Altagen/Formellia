import { describe, it, expect } from "vitest";
import { yamlConfigSchema } from "@/lib/yaml/configSchema";

describe("yamlConfigSchema secret scanner", () => {
  it("accepts app.enforcePasswordPolicy: true (boolean is not a secret)", () => {
    const result = yamlConfigSchema.safeParse({
      app: { enforcePasswordPolicy: true },
    });
    expect(result.success).toBe(true);
  });

  it("accepts app.enforcePasswordPolicy: false", () => {
    const result = yamlConfigSchema.safeParse({
      app: { enforcePasswordPolicy: false },
    });
    expect(result.success).toBe(true);
  });
});
