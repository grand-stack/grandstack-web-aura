// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { start, type Harness } from "./harness.js";

// These faults exist so the aura subgraph's failure handling can be tested against something that really misbehaves.
let h: Harness;
beforeAll(async () => {
  h = await start({ stepMs: 15 });
});
afterAll(() => h.close());
beforeEach(() => h.mock.reset());

const resize = { memory: "8GB", storage: "16GB" };

describe("rejectNext", () => {
  it("refuses the next change with the error given, once, and does nothing", async () => {
    h.mock.state.faults = { rejectNext: { status: 409, message: "The database is current undergoing an operation: updating", reason: "ongoing-database-operation" } };
    const refused = await h.call("PATCH", "/instances/d4e5f6a7", { body: resize });
    expect(refused.status).toBe(409);
    expect(refused.json.errors[0].reason).toBe("ongoing-database-operation");
    expect(h.mock.state.instances.get("d4e5f6a7")!.status).toBe("running"); // nothing was done
    expect(h.mock.state.instances.get("d4e5f6a7")!.memory).toBe("4GB");

    const second = await h.call("PATCH", "/instances/d4e5f6a7", { body: resize });
    expect(second.status).toBe(202); // the fault was used up
  });

  it("does not touch reads", async () => {
    h.mock.state.faults = { rejectNext: { status: 500, message: "boom", reason: "bug" } };
    expect((await h.call("GET", "/instances")).status).toBe(200);
    expect((await h.call("GET", "/instances/a1b2c3d4")).status).toBe(200);
    expect(h.mock.state.faults.rejectNext).toBeDefined(); // still waiting for a change
  });
});

describe("stall", () => {
  it("leaves an instance in its transitional status for good", async () => {
    h.mock.state.faults = { stall: true };
    expect((await h.call("POST", "/instances/a1b2c3d4/pause", { body: {} })).status).toBe(202);
    await new Promise((r) => setTimeout(r, 120));
    expect((await h.call("GET", "/instances/a1b2c3d4")).json.data.status).toBe("pausing");
  });
});

describe("endAs", () => {
  it("finishes a change in the status given, such as a failed one", async () => {
    h.mock.state.faults = { endAs: "loading failed" };
    await h.call("PATCH", "/instances/d4e5f6a7", { body: resize });
    expect(await h.waitFor("d4e5f6a7", (s) => s !== "updating")).toBe("loading failed");
  });
});

describe("dropNext", () => {
  it("does the change but cuts the connection, so the caller cannot tell", async () => {
    h.mock.state.faults = { dropNext: true };
    await expect(h.call("PATCH", "/instances/d4e5f6a7", { body: resize })).rejects.toThrow();
    // ...but it was done
    expect(h.mock.state.instances.get("d4e5f6a7")!.memory).toBe("8GB");
    expect(h.mock.state.faults.dropNext).toBeUndefined();
    expect((await h.call("GET", "/instances/d4e5f6a7")).status).toBe(200); // and the mock carries on
  });
});

describe("the admin endpoint", () => {
  it("sets and clears faults over HTTP, and reset clears them too", async () => {
    const set = await fetch(`${h.base}/__faults`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stall: true }) });
    expect(set.status).toBe(200);
    expect(h.mock.state.faults).toEqual({ stall: true });
    expect((await fetch(`${h.base}/__faults`, { method: "DELETE" })).status).toBe(200);
    expect(h.mock.state.faults).toEqual({});
    h.mock.state.faults = { stall: true };
    h.mock.reset();
    expect(h.mock.state.faults).toEqual({});
  });
  it("is not part of the Aura API: other methods are unknown", async () => {
    expect((await fetch(`${h.base}/__faults`, { method: "GET" })).status).toBe(404);
  });
});
