// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { describe, expect, it } from "vitest";
import { EMPTY_CHOICE, choose, cloudsOf, createVariables, firstOpenStep, regionsOf, sizesOf, stepDone, tiersOf, type Choice, type Offer } from "./create";

const offer = (cloudProvider: string, region: string, regionName: string, type: string, memory: string, storage: string): Offer => ({ cloudProvider, region, regionName, type, memory, storage, version: "5" });
const OFFERS: Offer[] = [
  offer("gcp", "us-central1", "Iowa (us-central1)", "professional-db", "4GB", "8GB"),
  offer("gcp", "us-central1", "Iowa (us-central1)", "professional-db", "16GB", "32GB"),
  offer("gcp", "us-central1", "Iowa (us-central1)", "enterprise-db", "32GB", "64GB"),
  offer("gcp", "europe-west1", "Belgium (europe-west1)", "professional-db", "8GB", "16GB"),
  offer("aws", "eu-west-1", "Ireland (eu-west-1)", "free-db", "1GB", "2GB"),
  offer("aws", "eu-west-1", "Ireland (eu-west-1)", "business-critical", "8GB", "16GB"),
  offer("aws", "eu-west-1", "Ireland (eu-west-1)", "professional-db", "4GB", "8GB"),
];

describe("what each step offers", () => {
  it("lists the clouds a tenant has, sorted", () => expect(cloudsOf(OFFERS)).toEqual(["aws", "gcp"]));
  it("lists a cloud's regions by name, each once", () => {
    expect(regionsOf(OFFERS, "gcp").map((r) => r.region)).toEqual(["europe-west1", "us-central1"]);
    expect(regionsOf(OFFERS, "aws")).toEqual([{ region: "eu-west-1", regionName: "Ireland (eu-west-1)" }]);
    expect(regionsOf(OFFERS, "azure")).toEqual([]);
  });
  it("lists only the tiers offered in that region, cheapest kind first", () => {
    expect(tiersOf(OFFERS, "aws", "eu-west-1")).toEqual(["free-db", "professional-db", "business-critical"]);
    expect(tiersOf(OFFERS, "gcp", "europe-west1")).toEqual(["professional-db"]);
    expect(tiersOf(OFFERS, "gcp", "us-central1")).toEqual(["professional-db", "enterprise-db"]);
    expect(tiersOf(OFFERS, "gcp", "mars-1")).toEqual([]);
  });
  it("puts a tier it does not know last, rather than dropping it", () => {
    expect(tiersOf([...OFFERS, offer("gcp", "europe-west1", "Belgium", "future-db", "8GB", "16GB")], "gcp", "europe-west1")).toEqual(["professional-db", "future-db"]);
  });
  it("lists the sizes of one cloud, region and tier, smallest first", () => {
    expect(sizesOf(OFFERS, "gcp", "us-central1", "professional-db").map((s) => `${s.memory}|${s.storage}`)).toEqual(["4GB|8GB", "16GB|32GB"]);
    expect(sizesOf(OFFERS, "gcp", "us-central1", "free-db")).toEqual([]);
  });
});

describe("choose", () => {
  const full: Choice = { ...EMPTY_CHOICE, tenant: "t1", cloud: "gcp", region: "us-central1", type: "professional-db", size: "4GB|8GB", name: "orders", vectorOptimized: true };
  it("keeps everything when a choice is made again with the same value", () => {
    expect(choose(full, { cloud: "gcp", region: "us-central1" })).toEqual(full);
  });
  it("clears what depended on a changed tenant, but not the name or switches", () => {
    expect(choose(full, { tenant: "t2" })).toEqual({ ...full, tenant: "t2", cloud: "", region: "", type: "", size: "" });
  });
  it("clears region, tier and size when the cloud changes", () => {
    expect(choose(full, { cloud: "aws" })).toMatchObject({ cloud: "aws", region: "", type: "", size: "", name: "orders" });
  });
  it("clears only the size when the region or the tier changes", () => {
    expect(choose(full, { region: "europe-west1" })).toMatchObject({ region: "europe-west1", type: "professional-db", size: "" });
    expect(choose(full, { type: "enterprise-db" })).toMatchObject({ type: "enterprise-db", size: "" });
  });
  it("leaves the choices alone when only the name changes", () => {
    expect(choose(full, { name: "other" })).toEqual({ ...full, name: "other" });
  });
});

describe("steps", () => {
  it("starts on the tenant and moves on as each step is done", () => {
    let c = EMPTY_CHOICE;
    expect(firstOpenStep(c, OFFERS)).toBe("tenant");
    c = choose(c, { tenant: "t1" });
    expect(firstOpenStep(c, OFFERS)).toBe("cloud");
    c = choose(c, { cloud: "aws" });
    expect(firstOpenStep(c, OFFERS)).toBe("where");
    c = choose(c, { region: "eu-west-1" });
    expect(firstOpenStep(c, OFFERS)).toBe("where"); // the tier is still to choose
    c = choose(c, { type: "professional-db" });
    expect(firstOpenStep(c, OFFERS)).toBe("size");
    c = choose(c, { size: "4GB|8GB" });
    expect(firstOpenStep(c, OFFERS)).toBe("name");
    c = choose(c, { name: "orders" });
    expect(firstOpenStep(c, OFFERS)).toBeUndefined();
  });
  it("does not accept a choice that is not offered, even if it is set directly", () => {
    const c: Choice = { ...EMPTY_CHOICE, tenant: "t1", cloud: "gcp", region: "eu-west-1", type: "professional-db" };
    expect(stepDone("where", c, OFFERS)).toBe(false);
    expect(stepDone("cloud", { ...c, cloud: "azure" }, OFFERS)).toBe(false);
    expect(stepDone("size", { ...c, region: "us-central1", size: "99GB|99GB" }, OFFERS)).toBe(false);
  });
  it("needs a valid name: 1 to 30 characters", () => {
    expect(stepDone("name", { ...EMPTY_CHOICE, name: "" }, OFFERS)).toBe(false);
    expect(stepDone("name", { ...EMPTY_CHOICE, name: "  " }, OFFERS)).toBe(false);
    expect(stepDone("name", { ...EMPTY_CHOICE, name: "x".repeat(31) }, OFFERS)).toBe(false);
    expect(stepDone("name", { ...EMPTY_CHOICE, name: "x".repeat(30) }, OFFERS)).toBe(true);
  });
});

describe("createVariables", () => {
  const ready: Choice = { ...EMPTY_CHOICE, tenant: "t1", cloud: "gcp", region: "us-central1", type: "professional-db", size: "16GB|32GB", name: "  orders  " };
  it("sends memory and storage as the chosen pair and the name trimmed", () => {
    expect(createVariables(ready, OFFERS)).toEqual({ input: { tenantId: "t1", cloudProvider: "gcp", region: "us-central1", type: "professional-db", memory: "16GB", storage: "32GB", name: "orders" } });
  });
  it("sends a switch only when it is on", () => {
    expect(createVariables({ ...ready, vectorOptimized: true }, OFFERS)?.input).toMatchObject({ vectorOptimized: true });
    expect(createVariables(ready, OFFERS)?.input).not.toHaveProperty("vectorOptimized");
    expect(createVariables(ready, OFFERS)?.input).not.toHaveProperty("graphAnalyticsPlugin");
  });
  it("sends nothing while a step is open", () => {
    expect(createVariables({ ...ready, size: "" }, OFFERS)).toBeUndefined();
    expect(createVariables({ ...ready, name: "" }, OFFERS)).toBeUndefined();
    expect(createVariables(EMPTY_CHOICE, OFFERS)).toBeUndefined();
  });
});
