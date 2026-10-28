// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KNOWN_STATUSES, STATUS_GROUPS, actionsLocked, statusView } from "./status";

// Read the real spec: if Aura adds or renames a status, this fails until the app knows how to show it
const spec = readFileSync(new URL("../../../docs/aura_api_spec_v1-2.yaml", import.meta.url), "utf8");
const specStatuses = (() => {
  const block = spec.slice(spec.indexOf("status:\n              type: string\n              description: The status of the instance"));
  const enumBlock = block.slice(block.indexOf("enum:"), block.indexOf("connection_url:"));
  return [...enumBlock.matchAll(/^\s+- (.+)$/gm)].map((m) => m[1]!.trim());
})();

describe("statusView", () => {
  it("knows exactly the statuses the spec lists", () => {
    expect(specStatuses).toHaveLength(13);
    expect([...KNOWN_STATUSES].sort()).toEqual([...specStatuses].sort());
  });

  it("gives every known status a label, a tone and an icon, so colour is never the only signal", () => {
    for (const status of KNOWN_STATUSES) {
      const view = statusView(status);
      expect(view.label.length, status).toBeGreaterThan(2);
      expect(view.icon, status).toBeTruthy();
      expect(view.tone, status).toBeTruthy();
    }
  });

  it.each([
    ["running", "Running", "ok"],
    ["paused", "Paused", "neutral"],
    ["suspended", "Suspended", "neutral"],
    ["updating", "Updating", "info"],
    ["destroying", "Deleting", "danger"],
    ["loading failed", "Loading failed", "danger"],
  ])("shows %s as %s in the %s tone", (status, label, tone) => {
    expect(statusView(status)).toMatchObject({ label, tone });
  });

  it("shows a status it does not know in its own words, as in progress, instead of hiding it", () => {
    expect(statusView("hibernating")).toEqual({ label: "Hibernating", tone: "info", icon: "spinner" });
  });
});

describe("actionsLocked", () => {
  it("locks only while an instance is in progress", () => {
    expect(actionsLocked("IN_PROGRESS")).toBe(true);
    for (const g of ["READY", "STOPPED", "FAILED"] as const) expect(actionsLocked(g)).toBe(false);
  });
  it("lists every group once", () => {
    expect(STATUS_GROUPS.map((g) => g.key).sort()).toEqual(["FAILED", "IN_PROGRESS", "READY", "STOPPED"]);
  });
});
