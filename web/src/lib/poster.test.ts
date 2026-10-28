// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { describe, expect, it } from "vitest";
import { hash } from "./hash";
import { posterStyle } from "./poster";

describe("hash", () => {
  it("is stable and never negative", () => {
    expect(hash("orders-prod")).toBe(hash("orders-prod"));
    for (const s of ["", "a", "orders-prod", "🔑", "x".repeat(1000)]) expect(hash(s)).toBeGreaterThanOrEqual(0);
  });
  it("tells different names apart", () => {
    expect(hash("orders-prod")).not.toBe(hash("orders-dev"));
  });
});

describe("posterStyle", () => {
  it("is the same every time for the same instance", () => {
    expect(posterStyle("gcp", "orders-prod")).toEqual(posterStyle("gcp", "orders-prod"));
  });
  it("uses a different colour for each cloud", () => {
    const styles = ["gcp", "aws", "azure"].map((c) => posterStyle(c, "x").background);
    expect(new Set(styles).size).toBe(3);
    expect(styles[0]).toContain("#0b4a73");
    expect(styles[1]).toContain("#7a4200");
    expect(styles[2]).toContain("#0a5459");
  });
  it("falls back to a neutral colour for a cloud or none", () => {
    expect(posterStyle("oracle", "x").background).toContain("#3b4a5c");
    expect(posterStyle(null, "x").background).toContain("#3b4a5c");
  });
  it("varies the angle a little between instances, within a narrow range", () => {
    const angles = new Set(Array.from({ length: 40 }, (_, i) => /(\d+)deg/.exec(posterStyle("gcp", `instance-${i}`).background)![1]));
    expect(angles.size).toBeGreaterThan(5);
    for (const a of angles) expect(Number(a)).toBeGreaterThanOrEqual(125);
    for (const a of angles) expect(Number(a)).toBeLessThanOrEqual(145);
  });
});
