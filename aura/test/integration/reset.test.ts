// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { UserError } from "../../src/errors.js";
import { AuraService, type ServiceOptions } from "../../src/service.js";
import { MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, integrationEnabled, startWorld, type World } from "./world.js";

const suite = integrationEnabled ? describe : describe.skip;

const RECS = "c9d8e7f6"; // recs-staging: running, Staging
const ORDERS = "a1b2c3d4"; // orders-prod: running, Production

suite("resetting the store", () => {
  let w: World;
  let services: AuraService[];

  beforeAll(async () => {
    w = await startWorld({ stepMs: 40 });
  });
  afterAll(() => w?.close());
  beforeEach(async () => {
    w.mock.reset();
    await w.wipe();
    services = [];
  });
  afterEach(async () => {
    await Promise.all(services.map((s) => s.operations.idle()));
  });

  const ready = async (over: Partial<ServiceOptions> = {}) => {
    const svc = new AuraService({
      accountId: "default", auraBaseUrl: w.mockBase, syncConcurrency: 3, syncIntervalMs: 0, secrets: w.secrets, store: w.store,
      operationPollDelayMs: () => 10, operationTimeoutMs: 20_000, ...over,
    });
    services.push(svc);
    await svc.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
    await svc.idle();
    return svc;
  };
  const refused = async (work: Promise<unknown>) => {
    const err = await work.then(() => undefined, (e) => e);
    expect(err, "expected a refusal").toBeInstanceOf(UserError);
    return (err as UserError).message;
  };
  const counts = async () =>
    (await w.read(`{ tenantsConnection { totalCount } instanceConfigurationsConnection { totalCount } instancesConnection { totalCount } operationsConnection { totalCount } syncRunsConnection { totalCount } }`)) as Record<string, { totalCount: number }>;
  const total = (c: Record<string, { totalCount: number }>, k: string) => c[k]!.totalCount;
  const rename = async (svc: AuraService, id: string, name: string) => {
    const { operationId } = await svc.operations.plan("UPDATE", id, { name });
    await svc.operations.confirm(operationId);
    await svc.operations.idle();
    return operationId;
  };
  const instance = async (id: string) =>
    (await w.read(`query($id: String!) { instances(where: { auraId: { eq: $id } }) { auraId name deletedInAuraAt hasStoredPassword tenant { name } cloud { name } tier { type } operations { id kind status } } }`, { id })).instances[0];

  it("removes the tenants, options and instances and reads them again, so the stored copy ends up as it was", async () => {
    const svc = await ready();
    const before = await counts();
    expect(total(before, "tenantsConnection")).toBe(3);
    const started = await svc.resetStore();
    expect(started.removed).toEqual({ tenants: 3, options: total(before, "instanceConfigurationsConnection"), instances: 6 });
    // Gone at once, back after the sync
    expect(total(await counts(), "instancesConnection")).toBe(0);
    await svc.idle();
    const after = await counts();
    for (const k of ["tenantsConnection", "instanceConfigurationsConnection", "instancesConnection"]) expect(total(after, k), k).toBe(total(before, k));
    expect(await instance(ORDERS)).toMatchObject({ name: "orders-prod", tenant: [{ name: "Acme Production" }], cloud: [{ name: "gcp" }], tier: [{ type: "professional-db" }] });
  });

  it("keeps the connection: the sealed secret and the account stay, and the sync that follows needs no new credentials", async () => {
    const svc = await ready();
    await svc.resetStore();
    await svc.idle();
    expect(await w.secrets.hasAuraSecret("default")).toBe(true);
    expect(await svc.setup()).toMatchObject({ required: false, connected: true, lastSyncStatus: "SUCCEEDED" });
  });

  it("keeps past operations, with their steps, and links them to the instances again", async () => {
    const svc = await ready();
    const op = await rename(svc, RECS, "recs-v2");
    const stepsBefore = (await w.read(`query($id: ID!) { operations(where: { id: { eq: $id } }) { steps { seq status } } }`, { id: op })).operations[0].steps.length;
    await svc.resetStore();
    await svc.idle();
    const kept = (await w.read(`query($id: ID!) { operations(where: { id: { eq: $id } }) { status kind target { auraId name } steps { seq status } } }`, { id: op })).operations[0];
    expect(kept).toMatchObject({ status: "SUCCEEDED", kind: "UPDATE", target: [{ auraId: RECS, name: "recs-v2" }] });
    expect(kept.steps).toHaveLength(stepsBefore);
    expect((await instance(RECS)).operations).toEqual([{ id: op, kind: "UPDATE", status: "SUCCEEDED" }]);
  });

  it("keeps the stored password of an instance made here, which Aura would not show again, and can still show it", async () => {
    const svc = await ready();
    const tenant = (await w.read(`{ tenants(where: { name: { eq: "Acme Staging" } }) { auraId configurations(where: { cloudProvider: { eq: "gcp" }, type: { eq: "professional-db" } }) { region memory } } }`)).tenants[0];
    const option = tenant.configurations[0];
    const { operationId } = await svc.operations.planCreate({ tenantId: tenant.auraId, cloudProvider: "gcp", region: option.region, type: "professional-db", memory: option.memory, name: "kept-password" });
    await svc.operations.confirm(operationId);
    await svc.operations.idle();
    const id = [...w.mock.state.instances.keys()].find((k) => w.mock.state.instances.get(k)!.name === "kept-password")!;
    const password = w.mock.state.passwords.get(id)!;
    expect((await instance(id)).hasStoredPassword).toBe(true);
    await svc.resetStore();
    expect((await instance(id))).toBeUndefined(); // gone until the sync reads it again
    await svc.idle();
    expect((await instance(id)).hasStoredPassword).toBe(true);
    expect(await svc.revealPassword(id)).toEqual({ username: "neo4j", password });
  });

  it("keeps an instance Aura no longer lists, as a record, with its tenant and history", async () => {
    const svc = await ready();
    const { operationId } = await svc.operations.planDelete(ORDERS);
    await svc.operations.confirm(operationId, "orders-prod");
    await svc.operations.idle();
    expect(await instance(ORDERS)).toMatchObject({ deletedInAuraAt: expect.any(String) });
    await svc.resetStore();
    await svc.idle();
    expect(await instance(ORDERS)).toMatchObject({ name: "orders-prod", deletedInAuraAt: expect.any(String), tenant: [{ name: "Acme Production" }], operations: [{ id: operationId, kind: "DELETE", status: "SUCCEEDED" }] });
    // Aura does not list it, so the store has it once, not twice
    expect(total(await counts(), "instancesConnection")).toBe(6);
  });

  it("keeps sync history and adds the new run", async () => {
    const svc = await ready();
    const runs = total(await counts(), "syncRunsConnection");
    await svc.resetStore();
    await svc.idle();
    expect(total(await counts(), "syncRunsConnection")).toBe(runs + 1);
  });

  it("changes nothing in Aura", async () => {
    const svc = await ready();
    const before = JSON.stringify([...w.mock.state.instances.values()]);
    await svc.resetStore();
    await svc.idle();
    expect(JSON.stringify([...w.mock.state.instances.values()])).toBe(before);
  });

  it("is refused without an account, while a sync runs, and while a change is under way, and removes nothing then", async () => {
    const svc = await ready();
    await svc.disconnect();
    expect(await refused(svc.resetStore())).toMatch(/Connect an Aura account/);
    await svc.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
    // a sync is running right after connecting
    expect(await refused(svc.resetStore())).toMatch(/A sync is running/);
    await svc.idle();
    w.mock.state.faults = { stall: true };
    const { operationId } = await svc.operations.plan("UPDATE", RECS, { name: "recs-stuck" });
    await svc.operations.confirm(operationId);
    expect(await refused(svc.resetStore())).toMatch(/A change to an instance is in progress/);
    expect(total(await counts(), "instancesConnection")).toBe(6);
    w.mock.state.faults = {};
  });

  it("repairs the links by itself if a reset was cut short", async () => {
    const svc = await ready();
    const op = await rename(svc, RECS, "recs-v3");
    // What a crash after clearing and before the sync leaves: the notes are made, the nodes are gone
    await w.secrets.clearAuraCopy("default");
    expect(((await w.read(`query($id: ID!) { operations(where: { id: { eq: $id } }) { target { auraId } } }`, { id: op })).operations[0]).target).toEqual([]);
    await svc.syncNow();
    await svc.idle();
    expect(((await w.read(`query($id: ID!) { operations(where: { id: { eq: $id } }) { target { auraId } } }`, { id: op })).operations[0]).target).toEqual([{ auraId: RECS }]);
  });
});
