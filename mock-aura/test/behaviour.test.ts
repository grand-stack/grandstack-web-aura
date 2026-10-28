// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { start, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => {
  h = await start();
});
afterAll(() => h.close());

const PRODUCTION = "a3b1c2d4-0001-4aaa-9bbb-000000000001";
const body = (over: Record<string, unknown> = {}) => ({
  version: "5",
  region: "europe-west1",
  memory: "4GB",
  storage: "8GB",
  name: "behaviour",
  type: "professional-db",
  tenant_id: PRODUCTION,
  cloud_provider: "gcp",
  ...over,
});

describe("seed data", () => {
  it("has three tenants with 24, 16 and 8 instance configurations", async () => {
    const list = await h.call("GET", "/tenants");
    expect(list.json.data.map((t: { name: string }) => t.name)).toEqual(["Acme Production", "Acme Staging", "Acme Labs"]);
    const counts = await Promise.all(list.json.data.map(async (t: { id: string }) => (await h.call("GET", `/tenants/${t.id}`)).json.data.instance_configurations.length));
    expect(counts).toEqual([24, 16, 8]);
  });

  it("has six instances and lists them with only the summary fields", async () => {
    const r = await h.call("GET", "/instances");
    expect(r.json.data).toHaveLength(6);
    expect(Object.keys(r.json.data[0]).sort()).toEqual(["cloud_provider", "created_at", "id", "name", "tenant_id"]);
  });

  it("filters the list by tenant", async () => {
    const r = await h.call("GET", `/instances?tenantId=${PRODUCTION}`);
    expect(r.json.data.map((i: { name: string }) => i.name).sort()).toEqual(["analytics-gds", "orders-prod", "search-prod"]);
  });
});

describe("authentication", () => {
  it("rejects wrong client credentials", async () => {
    const res = await fetch(`${h.base}/oauth/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from("mock-client:wrong").toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    expect(res.status).toBe(401);
  });

  it("rejects an unsupported grant type", async () => {
    const res = await fetch(`${h.base}/oauth/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from("mock-client:mock-secret").toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=password",
    });
    expect(res.status).toBe(400);
  });
});

describe("creating an instance", () => {
  it("returns the password once and never again", async () => {
    const created = await h.call("POST", "/instances", { body: body({ name: "once" }) });
    expect(created.status).toBe(202);
    const id = created.json.data.id as string;
    expect(created.json.data.password).toMatch(/\S{8,}/);
    expect(created.json.data.username).toBe("neo4j");
    expect(created.json.data.connection_url).toBe(`neo4j+s://${id}.databases.neo4j.io`);

    const got = await h.call("GET", `/instances/${id}`);
    expect(got.json.data).not.toHaveProperty("password");
    expect(JSON.stringify((await h.call("GET", "/instances")).json)).not.toContain(created.json.data.password);
  });

  it("goes from creating to running", async () => {
    const created = await h.call("POST", "/instances", { body: body({ name: "async" }) });
    const id = created.json.data.id as string;
    expect((await h.call("GET", `/instances/${id}`)).json.data.status).toBe("creating");
    expect(await h.waitFor(id, (s) => s === "running")).toBe("running");
  });

  it("fills in storage from the matching configuration when it is left out", async () => {
    const { storage: _omit, ...withoutStorage } = body({ name: "nostorage" });
    const created = await h.call("POST", "/instances", { body: withoutStorage });
    expect(created.status).toBe(202);
    expect((await h.call("GET", `/instances/${created.json.data.id}`)).json.data.storage).toBe("8GB");
  });

  it.each([
    ["a name over 30 characters", { name: "x".repeat(31) }, "name"],
    ["a name with leading whitespace", { name: " padded" }, "name"],
    ["a missing field", { region: "" }, "region"],
  ])("rejects %s", async (_label, over, field) => {
    const r = await h.call("POST", "/instances", { body: body(over) });
    expect(r.status).toBe(400);
    expect(r.json.errors[0].field).toBe(field);
  });

  it("rejects a combination the tenant does not offer", async () => {
    const r = await h.call("POST", "/instances", { body: body({ cloud_provider: "azure", region: "europe-west1" }) });
    expect(r.status).toBe(400);
    expect(r.json.errors[0].reason).toBe("invalid-configuration");
  });

  it("answers 404 for an unknown tenant", async () => {
    const r = await h.call("POST", "/instances", { body: body({ tenant_id: "nope" }) });
    expect(r.status).toBe(404);
    expect(r.json.errors[0].reason).toBe("tenant-not-found");
  });
});

describe("changing an instance", () => {
  it("resizes through updating and applies the new memory and storage", async () => {
    const r = await h.call("PATCH", "/instances/d4e5f6a7", { body: { memory: "8GB", storage: "16GB" } });
    expect(r.status).toBe(202);
    expect((await h.call("GET", "/instances/d4e5f6a7")).json.data.status).toBe("updating");
    await h.waitFor("d4e5f6a7", (s) => s === "running");
    const got = (await h.call("GET", "/instances/d4e5f6a7")).json.data;
    expect([got.memory, got.storage]).toEqual(["8GB", "16GB"]);
  });

  it("changes the vector and analytics switches without a resize", async () => {
    const r = await h.call("PATCH", "/instances/c9d8e7f6", { body: { vector_optimized: true, graph_analytics_plugin: true } });
    expect(r.status).toBe(200);
    expect(r.json.data.vector_optimized).toBe(true);
    expect(r.json.data.graph_analytics_plugin).toBe(true);
  });

  it("rejects an empty change and a name over 30 characters", async () => {
    expect((await h.call("PATCH", "/instances/c9d8e7f6", { body: {} })).status).toBe(400);
    expect((await h.call("PATCH", "/instances/c9d8e7f6", { body: { name: "y".repeat(31) } })).status).toBe(400);
  });
});

describe("deleting an instance", () => {
  it("passes through destroying and then answers 404", async () => {
    const created = await h.call("POST", "/instances", { body: body({ name: "doomed" }) });
    const id = created.json.data.id as string;
    await h.waitFor(id, (s) => s === "running");
    const del = await h.call("DELETE", `/instances/${id}`);
    expect(del.status).toBe(202);
    expect(del.json.data.status).toBe("destroying");
    await h.waitFor(id, (s) => s === "gone");
    expect((await h.call("GET", `/instances/${id}`)).status).toBe(404);
  });
});
