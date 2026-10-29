// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { describe, expect, it } from "vitest";
import { duration, kindLabel, matchesOperationFilter, operationSubject, operationView } from "./operations";

const STATUSES = ["PLANNED", "CONFIRMED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;

describe("operationView", () => {
  it("has a plain label for every status, and only the moving ones spin", () => {
    for (const s of STATUSES) expect(operationView(s).label.length).toBeGreaterThan(3);
    expect(STATUSES.filter((s) => operationView(s).spinner)).toEqual(["CONFIRMED", "RUNNING"]);
  });
  it("says a planned operation has not been sent", () => {
    expect(operationView("PLANNED")).toMatchObject({ label: "Planned, not sent", tone: "warn" });
  });
  it("labels every kind", () => {
    expect(["CREATE", "UPDATE", "DELETE", "PAUSE", "RESUME"].map((k) => kindLabel(k as never))).toEqual(["Create", "Update", "Delete", "Pause", "Resume"]);
  });
});

describe("matchesOperationFilter", () => {
  const under = (f: "all" | "active" | "planned" | "failed") => STATUSES.filter((s) => matchesOperationFilter(s, f));
  it("sorts each status under one filter", () => {
    expect(under("all")).toHaveLength(6);
    expect(under("active")).toEqual(["CONFIRMED", "RUNNING"]);
    expect(under("planned")).toEqual(["PLANNED"]);
    expect(under("failed")).toEqual(["FAILED"]);
  });
});

describe("duration", () => {
  const at = (s: string) => `2026-10-28T10:${s}Z`;
  it.each([
    [at("00:00"), at("00:08"), "8 s"],
    [at("00:00"), at("04:00"), "4 min"],
    [at("00:00"), "2026-10-28T11:05:00Z", "1 h 05 min"],
  ])("measures %s to %s as %s", (a, b, text) => {
    expect(duration(a, b)).toBe(text);
  });
  it("is empty when unfinished, unknown or backwards", () => {
    expect(duration(at("00:00"), null)).toBe("");
    expect(duration(null, at("00:00"))).toBe("");
    expect(duration(at("05:00"), at("00:00"))).toBe("");
    expect(duration("nope", "nope")).toBe("");
  });
});

describe("operationSubject", () => {
  const named = (name: string) => [{ name }];
  it("is the instance the operation points at", () => {
    expect(operationSubject({ target: named("orders-prod"), before: JSON.stringify({ name: "older-name" }) })).toBe("orders-prod");
  });
  it("is the instance as it was when planned, once the instance is gone", () => {
    expect(operationSubject({ target: [], before: JSON.stringify({ name: "orders-prod", status: "running" }) })).toBe("orders-prod");
  });
  it("is the name that was asked for, for a create that has no instance", () => {
    const diff = JSON.stringify({ items: [{ field: "tenant", after: "Acme" }, { field: "name", before: "", after: "new-one" }], warnings: [] });
    expect(operationSubject({ target: [], before: "{}", diff })).toBe("new-one");
  });
  it.each([[null], [undefined], [""], ["not json"], ["{}"], [JSON.stringify({ name: 3 })]])("falls back to a plain phrase for %s", (before) => {
    expect(operationSubject({ target: [], before: before as string, diff: null })).toBe("an instance");
  });
});

