// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { createYoga } from "graphql-yoga";
import { describe, expect, it } from "vitest";
import { buildSchema, typeDefs } from "../src/schema.js";
import { UserError, type AuraService } from "../src/service.js";

/** The GraphQL layer is thin, so it is tested with a stand-in service. The real service is tested in test/integration. */
function fake(over: Partial<Record<keyof AuraService, unknown>> = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const service = {
    setup: async () => ({ required: false, connected: true, clientIdHint: "a1b2....a7b8", lastSyncAt: "2026-10-28T10:00:00Z", syncing: false, lastSyncRunId: "run-1", lastSyncStatus: "SUCCEEDED", lastSyncError: null }),
    connect: async (...args: unknown[]) => (calls.push({ method: "connect", args }), { connected: true, syncRunId: "run-2" }),
    syncNow: async () => ({ started: true, runId: "run-3" }),
    disconnect: async () => void calls.push({ method: "disconnect", args: [] }),
    ...over,
  } as unknown as AuraService;
  const yoga = createYoga({ schema: buildSchema(service), maskedErrors: true, logging: false });
  const run = async (query: string, variables?: Record<string, unknown>) => {
    const res = await yoga.fetch("http://localhost/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
    return (await res.json()) as { data?: any; errors?: { message: string }[] };
  };
  return { run, calls };
}

describe("queries", () => {
  it("reports the setup state", async () => {
    const { data } = await fake().run(`{ auraSetup { required connected clientIdHint lastSyncAt syncing lastSyncRunId lastSyncStatus lastSyncError } }`);
    expect(data.auraSetup).toEqual({ required: false, connected: true, clientIdHint: "a1b2....a7b8", lastSyncAt: "2026-10-28T10:00:00Z", syncing: false, lastSyncRunId: "run-1", lastSyncStatus: "SUCCEEDED", lastSyncError: null });
  });
});

describe("mutations", () => {
  it("connects with the client id and secret it was given", async () => {
    const { run, calls } = fake();
    const { data } = await run(`mutation($id: String!, $secret: String!) { connectAura(clientId: $id, clientSecret: $secret) { connected syncRunId } }`, { id: "the-id", secret: "the-secret" });
    expect(data.connectAura).toEqual({ connected: true, syncRunId: "run-2" });
    expect(calls).toEqual([{ method: "connect", args: ["the-id", "the-secret"] }]);
  });

  it("starts a sync, and says whether it was already running", async () => {
    expect((await fake().run(`mutation { syncNow { started syncRunId } }`)).data.syncNow).toEqual({ started: true, syncRunId: "run-3" });
    const running = fake({ syncNow: async () => ({ started: false, runId: "run-9" }) });
    expect((await running.run(`mutation { syncNow { started syncRunId } }`)).data.syncNow).toEqual({ started: false, syncRunId: "run-9" });
  });

  it("disconnects", async () => {
    const { run, calls } = fake();
    expect((await run(`mutation { disconnectAura }`)).data.disconnectAura).toBe(true);
    expect(calls).toEqual([{ method: "disconnect", args: [] }]);
  });
});

describe("planning and confirming changes", () => {
  const planned = { operationId: "op-1" };
  const withOps = (over: Record<string, unknown> = {}) => {
    const calls: { method: string; args: unknown[] }[] = [];
    const record = (method: string, result: unknown) => async (...args: unknown[]) => (calls.push({ method, args }), result);
    const operations = {
      plan: record("plan", planned),
      confirm: record("confirm", { operationId: "op-1", status: "CONFIRMED" }),
      cancel: record("cancel", undefined),
      ...over,
    };
    return { ...fake({ operations } as never), calls };
  };

  it("plans an update with the changes it was given", async () => {
    const { run, calls } = withOps();
    const res = await run(`mutation($c: InstanceChange!) { planUpdate(instanceId: "i1", changes: $c) { operationId } }`, { c: { name: "n", memory: "8GB", storage: "16GB", vectorOptimized: true } });
    expect(res.data.planUpdate).toEqual({ operationId: "op-1" });
    expect(calls).toEqual([{ method: "plan", args: ["UPDATE", "i1", { name: "n", memory: "8GB", storage: "16GB", vectorOptimized: true }] }]);
  });
  it("plans a pause and a resume", async () => {
    const { run, calls } = withOps();
    await run(`mutation { planPause(instanceId: "i1") { operationId } }`);
    await run(`mutation { planResume(instanceId: "i2") { operationId } }`);
    expect(calls.map((c) => c.args)).toEqual([["PAUSE", "i1"], ["RESUME", "i2"]]);
  });
  it("confirms and cancels", async () => {
    const { run, calls } = withOps();
    expect((await run(`mutation { confirmOperation(operationId: "op-1") { operationId status } }`)).data.confirmOperation).toEqual({ operationId: "op-1", status: "CONFIRMED" });
    expect((await run(`mutation { cancelOperation(operationId: "op-1") }`)).data.cancelOperation).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["confirm", "cancel"]);
  });
  it("shows the person the reason a plan or a confirmation was refused", async () => {
    const { run } = withOps({ plan: async () => { throw new UserError("Nothing would change."); }, confirm: async () => { throw new UserError("This change was already confirmed."); } });
    expect((await run(`mutation { planPause(instanceId: "i") { operationId } }`)).errors![0]!.message).toBe("Nothing would change.");
    expect((await run(`mutation { confirmOperation(operationId: "o") { status } }`)).errors![0]!.message).toBe("This change was already confirmed.");
  });
  it("hides an unexpected failure while planning", async () => {
    const { run } = withOps({ plan: async () => { throw new Error("neo4j://db password=hunter2"); } });
    const res = await run(`mutation { planPause(instanceId: "i") { operationId } }`);
    expect(JSON.stringify(res)).not.toContain("hunter2");
  });
  it("does not accept a field Aura cannot change", async () => {
    const { run } = withOps();
    const res = await run(`mutation { planUpdate(instanceId: "i", changes: { type: "enterprise-db" }) { operationId } }`);
    expect(res.errors).toBeDefined();
  });
  it("plans a create and a delete, and confirms a delete with the name that was typed", async () => {
    const { run, calls } = withOps({
      planCreate: async (...args: unknown[]) => (calls.push({ method: "planCreate", args }), planned),
      planDelete: async (...args: unknown[]) => (calls.push({ method: "planDelete", args }), planned),
      confirm: async (...args: unknown[]) => (calls.push({ method: "confirm", args }), { operationId: "op-1", status: "CONFIRMED" }),
    });
    const input = { tenantId: "t1", cloudProvider: "gcp", region: "europe-west1", type: "professional-db", memory: "8GB", name: "new-one" };
    expect((await run(`mutation($i: InstanceCreate!) { planCreate(input: $i) { operationId } }`, { i: input })).data.planCreate).toEqual({ operationId: "op-1" });
    expect((await run(`mutation { planDelete(instanceId: "i1") { operationId } }`)).data.planDelete).toEqual({ operationId: "op-1" });
    await run(`mutation { confirmOperation(operationId: "op-1", typedName: "orders-prod") { status } }`);
    expect(calls.map((c) => c.args)).toEqual([[input], ["i1"], ["op-1", "orders-prod"]]);
  });
  it("has no mutation that deletes or creates directly, only plans", () => {
    expect(typeDefs).not.toMatch(/\b(deleteInstance|createInstance)\b/);
  });
  it("shows a password only through revealInstancePassword", async () => {
    const { run, calls } = fake({ revealPassword: async (...args: unknown[]) => (calls.push({ method: "reveal", args }), { username: "neo4j", password: "p4ss" }) });
    expect((await run(`mutation { revealInstancePassword(instanceId: "i1") { username password } }`)).data.revealInstancePassword).toEqual({ username: "neo4j", password: "p4ss" });
    expect(calls).toEqual([{ method: "reveal", args: ["i1"] }]);
  });
  it("compares an instance with Aura without changing anything", async () => {
    const { run } = fake({ checkInstance: async () => ({ checkedAt: "2026-10-28T10:00:00Z", inAura: true, differences: [{ field: "name", label: "Name", stored: "a", live: "b" }] }) });
    const res = await run(`{ checkInstance(instanceId: "i1") { checkedAt inAura differences { field label stored live } } }`);
    expect(res.data.checkInstance.differences).toEqual([{ field: "name", label: "Name", stored: "a", live: "b" }]);
  });
});

describe("errors", () => {
  it("shows the person a UserError's message", async () => {
    const { run } = fake({ connect: async () => { throw new UserError("Aura rejected that client id and secret. Check them in the Aura Console."); } });
    const res = await run(`mutation { connectAura(clientId: "a", clientSecret: "b") { connected } }`);
    expect(res.errors![0]!.message).toBe("Aura rejected that client id and secret. Check them in the Aura Console.");
  });

  it("hides the message of any other error, so nothing internal or secret leaks", async () => {
    const { run } = fake({ connect: async () => { throw new Error("MATCH failed at bolt://db:7687 with password=hunter2"); } });
    const res = await run(`mutation { connectAura(clientId: "a", clientSecret: "b") { connected } }`);
    expect(res.errors![0]!.message).not.toContain("hunter2");
    expect(res.errors![0]!.message).not.toContain("bolt://");
    expect(JSON.stringify(res)).not.toContain("hunter2");
  });

  it("does not echo the secret back when a query is invalid", async () => {
    const res = await fake().run(`mutation { connectAura(clientId: "a", clientSecret: "never-echo-this", bogus: 1) { connected } }`);
    expect(res.errors).toBeDefined();
    expect(JSON.stringify(res)).not.toContain("never-echo-this");
  });
});

describe("what the schema exposes", () => {
  it("only ever takes the secret as an argument and never returns it", () => {
    const outputFields = [...typeDefs.matchAll(/^\s{4}(\w+)(?:\([^)]*\))?:\s*[\w!\[\]]+/gm)].map((m) => m[1]!);
    // The one deliberate exception: RevealedPassword, the result of revealInstancePassword
    const revealed = /type RevealedPassword \{[\s\S]*?\n  \}/.exec(typeDefs)![0];
    const others = typeDefs.replace(revealed, "");
    const fields = [...others.matchAll(/^\s{4}(\w+)(?:\([^)]*\))?:\s*[\w!\[\]]+/gm)].map((m) => m[1]!);
    expect(fields.filter((f) => /secret|password|cipher|nonce|token/i.test(f) && f !== "revealInstancePassword")).toEqual([]);
    expect(outputFields.filter((f) => /password/i.test(f)).sort()).toEqual(["password", "revealInstancePassword"]);
    expect(typeDefs.match(/clientSecret/g)).toHaveLength(1); // only the argument of connectAura
  });

  it("documents every type, field and argument", () => {
    const withoutComments = typeDefs.replace(/"""[\s\S]*?"""/g, "").replace(/#.*$/gm, "");
    const fieldsAndTypes = (withoutComments.match(/^\s{2}(type \w+|\w+[(:])/gm) ?? []).length;
    const docs = (typeDefs.match(/"""[\s\S]*?"""/g) ?? []).length;
    expect(docs).toBeGreaterThanOrEqual(fieldsAndTypes - 4); // Query, Mutation and their roots are undescribed; everything else has one
  });
});
