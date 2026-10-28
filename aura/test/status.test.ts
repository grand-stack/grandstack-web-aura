// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { KNOWN_STATUSES, TIER_TYPES, configKey, maskClientId, statusGroup, tierLabel } from "../src/status.js";

const spec = parse(readFileSync(new URL("../../docs/aura_api_spec_v1-2.yaml", import.meta.url), "utf8")) as any;

describe("statuses", () => {
  it("covers exactly the statuses the spec lists", () => {
    const fromSpec: string[] = spec.components.schemas.Instance.properties.data.properties.status.enum;
    expect([...KNOWN_STATUSES].sort()).toEqual([...fromSpec].sort());
  });

  it.each([
    ["running", "READY"],
    ["paused", "STOPPED"],
    ["suspended", "STOPPED"],
    ["loading failed", "FAILED"],
    ["creating", "IN_PROGRESS"],
    ["updating", "IN_PROGRESS"],
    ["pausing", "IN_PROGRESS"],
    ["resuming", "IN_PROGRESS"],
    ["suspending", "IN_PROGRESS"],
    ["loading", "IN_PROGRESS"],
    ["restoring", "IN_PROGRESS"],
    ["overwriting", "IN_PROGRESS"],
    ["destroying", "IN_PROGRESS"],
  ])("puts %s in %s", (status, group) => {
    expect(statusGroup(status)).toBe(group);
  });

  it("treats a status the spec does not list as in progress, which keeps actions locked", () => {
    expect(statusGroup("hibernating")).toBe("IN_PROGRESS");
  });
});

describe("tiers", () => {
  it("has a label for every instance type the spec lists", () => {
    const fromSpec: string[] = spec.components.schemas.InstanceType.enum;
    expect([...TIER_TYPES].sort()).toEqual([...fromSpec].sort());
    for (const type of fromSpec) expect(tierLabel(type)).not.toBe(type);
  });

  it("falls back to the raw type for one it does not know", () => {
    expect(tierLabel("quantum-db")).toBe("quantum-db");
  });
});

describe("configKey", () => {
  const base = { cloud_provider: "gcp", region: "europe-west1", type: "professional-db", memory: "8GB", storage: "16GB", version: "5" };

  it("is stable", () => {
    expect(configKey("t1", base)).toBe(configKey("t1", { ...base }));
    expect(configKey("t1", base)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("changes when any part changes, including the tenant", () => {
    const keys = new Set([
      configKey("t1", base),
      configKey("t2", base),
      configKey("t1", { ...base, cloud_provider: "aws" }),
      configKey("t1", { ...base, region: "europe-west2" }),
      configKey("t1", { ...base, type: "business-critical" }),
      configKey("t1", { ...base, memory: "16GB" }),
      configKey("t1", { ...base, storage: "32GB" }),
      configKey("t1", { ...base, version: "4" }),
    ]);
    expect(keys.size).toBe(8);
  });

  it("cannot be confused by values that run together", () => {
    expect(configKey("t1", { ...base, memory: "8GB", storage: "16GB" })).not.toBe(configKey("t1", { ...base, memory: "8GB1", storage: "6GB" }));
  });
});

describe("maskClientId", () => {
  it("keeps the first and last four characters", () => {
    expect(maskClientId("a1b2c3d4e5f6a7b8")).toBe("a1b2....a7b8");
  });
  it("hides a short id completely", () => {
    expect(maskClientId("short")).toBe("....");
  });
});
