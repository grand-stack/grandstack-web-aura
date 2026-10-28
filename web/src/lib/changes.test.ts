// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { describe, expect, it } from "vitest";
import { MAX_NAME, buildChange, elapsed, formFromInstance, nameError, nameLength, operationVerb, parsePlan, progressOf, sizeKey, sizeOptions, type EditOriginal, type StepLike } from "./changes";

describe("parsePlan", () => {
  it("reads items and warnings", () => {
    const plan = parsePlan(JSON.stringify({ items: [{ field: "memory", label: "Memory", before: "4 GB", after: "8 GB" }], warnings: ["A larger size may change what you are billed."] }));
    expect(plan.items).toEqual([{ field: "memory", label: "Memory", before: "4 GB", after: "8 GB" }]);
    expect(plan.warnings).toEqual(["A larger size may change what you are billed."]);
  });
  it.each([[null], [undefined], [""], ["not json"], ["null"], ["[]"], ["{}"], [JSON.stringify({ items: "x", warnings: 3 })]])("gives an empty plan for %s rather than throwing", (input) => {
    expect(parsePlan(input as string)).toEqual({ items: [], warnings: [] });
  });
  it("drops items and warnings that are not the right shape", () => {
    const plan = parsePlan(JSON.stringify({ items: [{ label: "Name", before: "a", after: "b" }, { label: 1 }, null, "x"], warnings: ["ok", 5, null] }));
    expect(plan.items).toHaveLength(1);
    expect(plan.warnings).toEqual(["ok"]);
  });
});

describe("the name", () => {
  it("is limited to 30 characters, counting characters and not bytes, ignoring spaces at the ends", () => {
    expect(MAX_NAME).toBe(30);
    expect(nameLength("  orders  ")).toBe(6);
    expect(nameLength("é".repeat(30))).toBe(30);
    expect(nameLength("🔑".repeat(30))).toBe(30);
    expect(nameError("x".repeat(30))).toBeUndefined();
    expect(nameError("x".repeat(31))).toBe("The name can be at most 30 characters.");
    expect(nameError("   ")).toBe("The name cannot be empty.");
    expect(nameError("")).toBe("The name cannot be empty.");
    expect(nameError("orders-prod")).toBeUndefined();
  });
});

describe("sizeOptions", () => {
  it("lists each pair once, smallest first, comparing memory as a number", () => {
    const options = sizeOptions([
      { memory: "16GB", storage: "32GB" }, { memory: "2GB", storage: "4GB" }, { memory: "8GB", storage: "16GB" }, { memory: "2GB", storage: "4GB" }, { memory: "4GB", storage: "8GB" },
    ]);
    expect(options.map(sizeKey)).toEqual(["2GB|4GB", "4GB|8GB", "8GB|16GB", "16GB|32GB"]);
  });
  it("orders pairs with the same memory by storage", () => {
    expect(sizeOptions([{ memory: "8GB", storage: "32GB" }, { memory: "8GB", storage: "16GB" }]).map(sizeKey)).toEqual(["8GB|16GB", "8GB|32GB"]);
  });
  it("copes with none", () => {
    expect(sizeOptions([])).toEqual([]);
  });
});

const original = (over: Partial<EditOriginal> = {}): EditOriginal => ({ name: "recs-staging", memory: "4GB", storage: "8GB", vectorOptimized: false, graphAnalyticsPlugin: false, ...over });

describe("the edit form", () => {
  it("starts as the instance is, so nothing is changed", () => {
    const form = formFromInstance(original());
    expect(form).toEqual({ name: "recs-staging", size: "4GB|8GB", vectorOptimized: false, graphAnalyticsPlugin: false });
    expect(buildChange(original(), form)).toEqual({ input: {}, changed: false });
  });
  it("sends only what changed", () => {
    const form = { ...formFromInstance(original()), name: "recs-v2" };
    expect(buildChange(original(), form)).toEqual({ input: { name: "recs-v2" }, changed: true });
  });
  it("sends memory and storage together, as one pair", () => {
    const form = { ...formFromInstance(original()), size: "8GB|16GB" };
    expect(buildChange(original(), form)).toEqual({ input: { memory: "8GB", storage: "16GB" }, changed: true });
  });
  it("sends a switch only when it differs", () => {
    const form = { ...formFromInstance(original()), vectorOptimized: true };
    expect(buildChange(original(), form).input).toEqual({ vectorOptimized: true });
  });
  it("sends a name with the spaces trimmed, and nothing if only spaces were added", () => {
    expect(buildChange(original(), { ...formFromInstance(original()), name: "  recs-staging  " })).toEqual({ input: {}, changed: false });
    expect(buildChange(original(), { ...formFromInstance(original()), name: "  new  " }).input.name).toBe("new");
  });
  it("leaves a switch alone when its state was unknown and the person did not touch it", () => {
    const o = original({ vectorOptimized: null });
    expect(formFromInstance(o).vectorOptimized).toBeNull();
    expect(buildChange(o, formFromInstance(o))).toEqual({ input: {}, changed: false });
    expect(buildChange(o, { ...formFromInstance(o), vectorOptimized: true }).input).toEqual({ vectorOptimized: true });
  });
  it("has no size to choose for an instance without storage (a free one), and sends none", () => {
    const o = original({ memory: "1GB", storage: null });
    expect(formFromInstance(o).size).toBe("");
    expect(buildChange(o, { ...formFromInstance(o), name: "x" })).toEqual({ input: { name: "x" }, changed: true });
  });
  it("combines several changes", () => {
    const form = { name: "n", size: "16GB|32GB", vectorOptimized: true, graphAnalyticsPlugin: true };
    expect(buildChange(original(), form).input).toEqual({ name: "n", memory: "16GB", storage: "32GB", vectorOptimized: true, graphAnalyticsPlugin: true });
  });
});

describe("operationVerb", () => {
  const item = (field: string) => ({ field, label: field, before: "", after: "" });
  it.each([
    ["UPDATE", [item("memory")], "Resize"],
    ["UPDATE", [item("storage"), item("name")], "Resize"],
    ["UPDATE", [item("name")], "Rename"],
    ["UPDATE", [item("vectorOptimized")], "Edit"],
    ["UPDATE", [item("name"), item("vectorOptimized")], "Edit"],
    ["UPDATE", [], "Edit"],
    ["PAUSE", [], "Pause"],
    ["RESUME", [], "Resume"],
  ] as const)("names a %s of %j as %s", (kind, items, verb) => {
    expect(operationVerb(kind, items)).toBe(verb);
  });
});

describe("progressOf", () => {
  const steps = (...statuses: StepLike["status"][]): StepLike[] => statuses.map((status, i) => ({ seq: i + 1, label: `Step ${i + 1}`, status }));
  it("counts finished steps and finds the one in progress", () => {
    const p = progressOf(steps("DONE", "DONE", "DONE", "ACTIVE", "PENDING", "PENDING"));
    expect(p).toMatchObject({ total: 6, done: 3, failed: undefined });
    expect(p.current?.seq).toBe(4);
  });
  it("points at the first step not started when none is active", () => {
    expect(progressOf(steps("DONE", "PENDING", "PENDING")).current?.seq).toBe(2);
  });
  it("has no current step when everything is done", () => {
    const p = progressOf(steps("DONE", "DONE", "DONE"));
    expect(p).toMatchObject({ done: 3, total: 3, current: undefined });
  });
  it("finds the step that failed", () => {
    expect(progressOf(steps("DONE", "FAILED", "PENDING")).failed?.seq).toBe(2);
  });
  it("orders steps however they arrive", () => {
    const shuffled = [...steps("DONE", "ACTIVE", "PENDING")].reverse();
    expect(progressOf(shuffled).current?.seq).toBe(2);
  });
  it("copes with no steps", () => {
    expect(progressOf([])).toEqual({ total: 0, done: 0, current: undefined, failed: undefined });
  });
});

describe("elapsed", () => {
  const start = "2026-10-28T10:00:00Z";
  const at = (s: number) => Date.parse(start) + s * 1000;
  it("counts up to now while it runs", () => {
    expect(elapsed(start, null, at(192))).toBe("03:12");
    expect(elapsed(start, undefined, at(5))).toBe("00:05");
  });
  it("stops at the end once it has finished", () => {
    expect(elapsed(start, "2026-10-28T10:04:00Z", at(99999))).toBe("04:00");
  });
  it("shows hours past an hour", () => {
    expect(elapsed(start, null, at(3600 + 5 * 60 + 9))).toBe("1:05:09");
  });
  it("never goes negative, and is empty with no start", () => {
    expect(elapsed(start, null, at(-30))).toBe("00:00");
    expect(elapsed(null, null, 0)).toBe("");
    expect(elapsed("garbage", null, 0)).toBe("");
  });
});
