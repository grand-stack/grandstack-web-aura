// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { describe, expect, it } from "vitest";
import { SORTS, activeCount, baseWhere, buildWhere, emptyFilters, nameVariants, parseFilters, serializeFilters, sortInstances, statusCountWhere, type Filters } from "./filters";

const params = (s: string) => new URLSearchParams(s);

describe("the URL", () => {
  it("round-trips every filter", () => {
    const f = parseFilters(params("q=prod&t=t1,t2&c=gcp,aws&tier=professional-db&st=READY,FAILED&rm=1&s=memory"));
    expect(f).toEqual({ q: "prod", tenants: ["t1", "t2"], clouds: ["gcp", "aws"], tiers: ["professional-db"], statuses: ["READY", "FAILED"], showRemoved: true, sort: "memory" });
    expect(parseFilters(serializeFilters(f))).toEqual(f);
  });

  it("gives an empty URL for no filters, so the default view has a clean address", () => {
    expect(serializeFilters(emptyFilters).toString()).toBe("");
    expect(parseFilters(params(""))).toEqual(emptyFilters);
  });

  it("ignores what it does not understand", () => {
    const f = parseFilters(params("st=READY,BOGUS,,IN_PROGRESS&s=sideways&rm=yes&t=,,"));
    expect(f.statuses).toEqual(["READY", "IN_PROGRESS"]);
    expect(f.sort).toBe("name");
    expect(f.showRemoved).toBe(false);
    expect(f.tenants).toEqual([]);
  });

  it("does not put the default sort in the URL", () => {
    expect(serializeFilters({ ...emptyFilters, sort: "name" }).has("s")).toBe(false);
    expect(serializeFilters({ ...emptyFilters, sort: "newest" }).get("s")).toBe("newest");
  });
});

describe("activeCount", () => {
  it("counts each chosen option, the search and the removed switch, but not the sort", () => {
    expect(activeCount(emptyFilters)).toBe(0);
    expect(activeCount({ ...emptyFilters, sort: "newest" })).toBe(0);
    expect(activeCount({ ...emptyFilters, q: "x", tenants: ["a", "b"], clouds: ["gcp"], tiers: ["t"], statuses: ["READY"], showRemoved: true })).toBe(7);
  });
  it("does not count a search of only spaces", () => {
    expect(activeCount({ ...emptyFilters, q: "   " })).toBe(0);
  });
});

describe("nameVariants", () => {
  it("covers the case-sensitive search: as typed, lower case and Title Case, without repeats", () => {
    expect(nameVariants("Orders prod")).toEqual(["Orders prod", "orders prod", "Orders Prod"]);
    expect(nameVariants("orders prod")).toEqual(["orders prod", "Orders Prod"]);
    expect(nameVariants("x")).toEqual(["x", "X"]);
    expect(nameVariants("Orders")).toEqual(["Orders", "orders"]); // typed in Title Case already: no repeat
    expect(nameVariants("123")).toEqual(["123"]); // no letters: one variant
  });
});

describe("buildWhere", () => {
  const all: Filters = { q: "prod", tenants: ["t1"], clouds: ["gcp"], tiers: ["professional-db"], statuses: ["READY"], showRemoved: false, sort: "name" };
  const text = (w: unknown) => JSON.stringify(w);

  it("hides instances Aura no longer lists, unless asked", () => {
    expect(buildWhere(emptyFilters)).toEqual({ AND: [{ deletedInAuraAt: { eq: null } }] });
    expect(buildWhere({ ...emptyFilters, showRemoved: true })).toEqual({});
    expect(baseWhere(emptyFilters)).toEqual({ deletedInAuraAt: { eq: null } });
    expect(baseWhere({ ...emptyFilters, showRemoved: true })).toEqual({});
  });

  it("combines every filter with AND", () => {
    const w = buildWhere(all) as { AND: unknown[] };
    expect(w.AND).toHaveLength(6);
    expect(text(w)).toContain('"tenant":{"some":{"auraId":{"in":["t1"]}}}');
    expect(text(w)).toContain('"cloud":{"some":{"name":{"in":["gcp"]}}}');
    expect(text(w)).toContain('"tier":{"some":{"type":{"in":["professional-db"]}}}');
    expect(text(w)).toContain('"statusGroup":{"in":["READY"]}');
    expect(text(w)).toContain('"name":{"contains":"prod"}');
  });

  it.each([
    ["tenants", "t1"],
    ["clouds", "gcp"],
    ["tiers", "professional-db"],
    ["statuses", "READY"],
  ] as const)("leaves out the %s filter when counting the %s options, and nothing else", (facet, value) => {
    const without = text(buildWhere(all, facet));
    expect(without).not.toContain(`"${value}"`);
    const others = ["t1", "gcp", "professional-db", "READY"].filter((v) => v !== value);
    for (const o of others) expect(without, `${facet} kept ${o}`).toContain(`"${o}"`);
  });

  it("keeps the search and the removed filter when counting a facet", () => {
    const w = text(buildWhere(all, "clouds"));
    expect(w).toContain('"contains":"prod"');
    expect(w).toContain('"deletedInAuraAt"');
  });

  it("ignores a search of only spaces", () => {
    expect(text(buildWhere({ ...emptyFilters, q: "  " }))).not.toContain("contains");
  });

  it("counts one status group with every other filter kept", () => {
    const w = text(statusCountWhere(all, "FAILED"));
    expect(w).toContain('"statusGroup":{"eq":"FAILED"}');
    expect(w).not.toContain('"statusGroup":{"in"');
    expect(w).toContain('"cloud"');
  });
});

describe("sortInstances", () => {
  const i = (name: string, over: Partial<{ createdAt: string | null; statusGroup: "READY" | "STOPPED" | "IN_PROGRESS" | "FAILED"; memory: string | null }> = {}) => ({
    name, createdAt: null, statusGroup: "READY" as const, memory: null, ...over,
  });
  const names = (xs: { name: string }[]) => xs.map((x) => x.name);

  it("offers four sorts", () => {
    expect(SORTS.map((s) => s.key)).toEqual(["name", "newest", "status", "memory"]);
  });

  it("sorts by name, numbers as numbers and case ignored", () => {
    expect(names(sortInstances([i("db-10"), i("DB-2"), i("alpha")], "name"))).toEqual(["alpha", "DB-2", "db-10"]);
  });

  it("puts the newest first, and those with no date last, by name", () => {
    const list = [i("old", { createdAt: "2026-01-01T00:00:00Z" }), i("none-b"), i("new", { createdAt: "2026-06-01T00:00:00Z" }), i("none-a")];
    expect(names(sortInstances(list, "newest"))).toEqual(["new", "old", "none-a", "none-b"]);
  });

  it("puts what needs attention first: failed, in progress, stopped, then ready", () => {
    const list = [i("a-ready"), i("b-stopped", { statusGroup: "STOPPED" }), i("c-progress", { statusGroup: "IN_PROGRESS" }), i("d-failed", { statusGroup: "FAILED" }), i("e-ready")];
    expect(names(sortInstances(list, "status"))).toEqual(["d-failed", "c-progress", "b-stopped", "a-ready", "e-ready"]);
  });

  it("sorts memory as a number, largest first (16 GB is bigger than 2 GB), with no memory last", () => {
    const list = [i("two", { memory: "2GB" }), i("sixteen", { memory: "16GB" }), i("none"), i("eight", { memory: "8GB" }), i("sixteen-b", { memory: "16GB" })];
    expect(names(sortInstances(list, "memory"))).toEqual(["sixteen", "sixteen-b", "eight", "two", "none"]);
  });

  it("does not change the list it was given", () => {
    const list = [i("b"), i("a")];
    sortInstances(list, "name");
    expect(names(list)).toEqual(["b", "a"]);
  });
});
