// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { start, type Harness, type Reply } from "./harness.js";
import { declaredStatuses, validate } from "./spec.js";

// Every response the mock serves must match the schema the real spec declares for that path, method and status.
// If the spec changes (or the mock drifts), these fail.

let h: Harness;
beforeAll(async () => {
  h = await start();
});
afterAll(() => h.close());

function matchesSpec(r: Reply, path: string, method: string) {
  expect(declaredStatuses(path, method), `${method} ${path} does not declare ${r.status}`).toContain(r.status);
  expect(validate(path, method, r.status, r.json)).toEqual([]);
}

describe("the validator itself", () => {
  // Guards against a contract test that passes because it checks nothing
  it("reports a list that is missing required fields", () => {
    expect(validate("/instances", "get", 200, { data: [{ id: "x" }] }).length).toBeGreaterThan(0);
  });
  it("reports an instance with a status the spec does not list", () => {
    const good = { id: "a", name: "n", status: "running", connection_url: "u", cloud_provider: "gcp", tenant_id: "t", memory: "8GB", storage: "16GB", region: "r", type: "professional-db", created_at: "x" };
    expect(validate("/instances/{instanceId}", "get", 200, { data: good })).toEqual([]);
    expect(validate("/instances/{instanceId}", "get", 200, { data: { ...good, status: "sleeping" } }).length).toBeGreaterThan(0);
  });
  it("reports a body with the wrong shape for an error", () => {
    expect(validate("/instances/{instanceId}", "get", 404, { errors: [{ message: "m" }] }).length).toBeGreaterThan(0);
  });
});

const ORDERS = "a1b2c3d4";
const SANDBOX = "e5f6a7b8"; // paused
const PRODUCTION = "a3b1c2d4-0001-4aaa-9bbb-000000000001";

const createBody = (over: Record<string, unknown> = {}) => ({
  version: "5",
  region: "europe-west1",
  memory: "4GB",
  storage: "8GB",
  name: "contract-test",
  type: "professional-db",
  tenant_id: PRODUCTION,
  cloud_provider: "gcp",
  ...over,
});

describe("tenants", () => {
  it("GET /tenants", async () => matchesSpec(await h.call("GET", "/tenants"), "/tenants", "get"));
  it("GET /tenants/{id}", async () => matchesSpec(await h.call("GET", `/tenants/${PRODUCTION}`), "/tenants/{tenantId}", "get"));
  it("GET /tenants/{id} for a missing project", async () => matchesSpec(await h.call("GET", "/tenants/nope"), "/tenants/{tenantId}", "get"));
});

describe("instances", () => {
  it("GET /instances", async () => matchesSpec(await h.call("GET", "/instances"), "/instances", "get"));
  it("GET /instances?tenantId=", async () => matchesSpec(await h.call("GET", `/instances?tenantId=${PRODUCTION}`), "/instances", "get"));
  it("GET /instances/{id}", async () => matchesSpec(await h.call("GET", `/instances/${ORDERS}`), "/instances/{instanceId}", "get"));
  it("GET /instances/{id} for a missing instance", async () => matchesSpec(await h.call("GET", "/instances/zzzzzzzz"), "/instances/{instanceId}", "get"));

  it("POST /instances accepts a valid request (202)", async () => {
    const r = await h.call("POST", "/instances", { body: createBody() });
    matchesSpec(r, "/instances", "post");
    expect(r.status).toBe(202);
  });
  it("POST /instances rejects an unavailable combination (400)", async () => {
    const r = await h.call("POST", "/instances", { body: createBody({ memory: "999GB" }) });
    matchesSpec(r, "/instances", "post");
    expect(r.status).toBe(400);
  });
  it("POST /instances without a JSON content type (415)", async () => {
    const r = await h.call("POST", "/instances", { body: createBody(), contentType: "text/plain" });
    matchesSpec(r, "/instances", "post");
    expect(r.status).toBe(415);
  });

  it("PATCH rename (200)", async () => {
    const r = await h.call("PATCH", `/instances/${ORDERS}`, { body: { name: "orders-prod" } });
    matchesSpec(r, "/instances/{instanceId}", "patch");
    expect(r.status).toBe(200);
  });
  it("PATCH resize (202) then 409 while it runs", async () => {
    const first = await h.call("PATCH", "/instances/c3d4e5f6", { body: { memory: "8GB", storage: "16GB" } });
    matchesSpec(first, "/instances/{instanceId}", "patch");
    expect(first.status).toBe(202);
    const second = await h.call("PATCH", "/instances/c3d4e5f6", { body: { name: "x" } });
    matchesSpec(second, "/instances/{instanceId}", "patch");
    expect(second.status).toBe(409);
  });
  it("PATCH with an invalid pair (400)", async () => {
    const r = await h.call("PATCH", `/instances/${ORDERS}`, { body: { memory: "8GB", storage: "999GB" } });
    matchesSpec(r, "/instances/{instanceId}", "patch");
    expect(r.status).toBe(400);
  });

  it("resume a paused instance (202) and pausing it again conflicts (409)", async () => {
    const resume = await h.call("POST", `/instances/${SANDBOX}/resume`, { body: {} });
    matchesSpec(resume, "/instances/{instanceId}/resume", "post");
    expect(resume.status).toBe(202);
    const pause = await h.call("POST", `/instances/${SANDBOX}/pause`, { body: {} });
    matchesSpec(pause, "/instances/{instanceId}/pause", "post");
    expect(pause.status).toBe(409);
  });
  it("pause a running instance (202)", async () => {
    const r = await h.call("POST", "/instances/d4e5f6a7/pause", { body: {} });
    matchesSpec(r, "/instances/{instanceId}/pause", "post");
    expect(r.status).toBe(202);
  });
  it("pausing an instance that is not running (400)", async () => {
    await h.waitFor("d4e5f6a7", (s) => s === "paused");
    const r = await h.call("POST", "/instances/d4e5f6a7/pause", { body: {} });
    matchesSpec(r, "/instances/{instanceId}/pause", "post");
    expect(r.status).toBe(400);
  });

  it("DELETE (202), then 409 while destroying, then 404", async () => {
    const del = await h.call("DELETE", "/instances/b2c3d4e5");
    matchesSpec(del, "/instances/{instanceId}", "delete");
    expect(del.status).toBe(202);
    const again = await h.call("DELETE", "/instances/b2c3d4e5");
    matchesSpec(again, "/instances/{instanceId}", "delete");
    expect(again.status).toBe(409);
    await h.waitFor("b2c3d4e5", (s) => s === "gone");
    const gone = await h.call("DELETE", "/instances/b2c3d4e5");
    matchesSpec(gone, "/instances/{instanceId}", "delete");
    expect(gone.status).toBe(404);
  });
});

describe("authentication and limits", () => {
  it("401 without a token", async () => matchesSpec(await h.call("GET", "/instances", { token: null }), "/instances", "get"));
  it("401 with an unknown token", async () => matchesSpec(await h.call("GET", "/instances", { token: "nope" }), "/instances", "get"));

  it("403 with an expired token", async () => {
    const e = await start({ tokenTtlMs: -1000 });
    try {
      const r = await e.call("GET", "/instances");
      expect(r.status).toBe(403);
      matchesSpec(r, "/instances", "get");
    } finally {
      await e.close();
    }
  });

  it("429 with Retry-After once the limit is reached", async () => {
    const l = await start({ rateLimitPerMinute: 2 });
    try {
      await l.call("GET", "/instances");
      await l.call("GET", "/instances");
      const r = await l.call("GET", "/instances");
      expect(r.status).toBe(429);
      expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
      matchesSpec(r, "/instances", "get");
    } finally {
      await l.close();
    }
  });

  it("405 when the instance limit is reached", async () => {
    const m = await start({ maxInstances: 6 });
    try {
      const r = await m.call("POST", "/instances", { body: createBody() });
      expect(r.status).toBe(405);
      matchesSpec(r, "/instances", "post");
    } finally {
      await m.close();
    }
  });
});
