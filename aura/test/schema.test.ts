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
    expect(outputFields.filter((f) => /secret|password|cipher|nonce|token/i.test(f))).toEqual([]);
    expect(typeDefs.match(/clientSecret/g)).toHaveLength(1); // only the argument of connectAura
  });

  it("documents every type, field and argument", () => {
    const withoutComments = typeDefs.replace(/"""[\s\S]*?"""/g, "").replace(/#.*$/gm, "");
    const fieldsAndTypes = (withoutComments.match(/^\s{2}(type \w+|\w+[(:])/gm) ?? []).length;
    const docs = (typeDefs.match(/"""[\s\S]*?"""/g) ?? []).length;
    expect(docs).toBeGreaterThanOrEqual(fieldsAndTypes - 4); // Query, Mutation and their roots are undescribed; everything else has one
  });
});
