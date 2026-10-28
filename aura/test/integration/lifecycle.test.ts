// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SecretBox } from "../../src/crypto.js";
import { UserError } from "../../src/errors.js";
import { createSteps } from "../../src/operations/run.js";
import { moveOperation, setStep } from "../../src/operations/store.js";
import { SecretStore } from "../../src/secrets.js";
import { AuraService, type ServiceOptions } from "../../src/service.js";
import { MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, integrationEnabled, startWorld, type World } from "./world.js";

const suite = integrationEnabled ? describe : describe.skip;

const RECS = "c9d8e7f6"; // recs-staging: running, Staging, GCP us-central1, Professional
const ORDERS = "a1b2c3d4"; // orders-prod: running
const SANDBOX = "e5f6a7b8"; // dev-sandbox: paused

interface Call {
  method: string;
  url: string;
}

suite("creating and deleting an instance, and showing its password", () => {
  let w: World;
  let calls: Call[];
  let services: AuraService[];

  beforeAll(async () => {
    w = await startWorld({ stepMs: 40 });
  });
  afterAll(() => w?.close());
  beforeEach(async () => {
    w.mock.reset();
    await w.wipe();
    calls = [];
    services = [];
  });
  afterEach(async () => {
    await Promise.all(services.map((s) => s.operations.idle()));
  });

  const counting: typeof fetch = async (url, init) => {
    calls.push({ method: init?.method ?? "GET", url: String(url) });
    return fetch(url, init);
  };
  const changes = () => calls.filter((c) => c.method !== "GET" && c.url.includes("/v1/"));
  const make = (over: Partial<ServiceOptions> = {}) => {
    const svc = new AuraService({
      accountId: "default", auraBaseUrl: w.mockBase, syncConcurrency: 3, syncIntervalMs: 0, secrets: w.secrets, store: w.store,
      fetch: counting, operationPollDelayMs: () => 10, operationTimeoutMs: 20_000, ...over,
    });
    services.push(svc);
    return svc;
  };
  const ready = async () => {
    const svc = make();
    await svc.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
    await svc.idle();
    calls = [];
    return svc;
  };
  const OP = `query($id: ID!) { operations(where: { id: { eq: $id } }) { id kind status error desired before diff target { auraId name } steps(sort: [{ seq: ASC }]) { seq status detail } } }`;
  const readOp = async (id: string) => (await w.read(OP, { id })).operations[0];
  const until = async (check: () => Promise<boolean>, what: string, ms = 15_000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error(`Timed out waiting for ${what}`);
  };
  const refused = async (work: Promise<unknown>) => {
    const err = await work.then(() => undefined, (e) => e);
    expect(err, "expected a refusal").toBeInstanceOf(UserError);
    return (err as UserError).message;
  };
  const instance = async (id: string) =>
    (await w.read(
      `query($id: String!) { instances(where: { auraId: { eq: $id } }) { auraId name status memory storage version connectionUrl deletedInAuraAt hasStoredPassword credentialUsername passwordRevealCount tenant { auraId } cloud { name } tier { type } } }`,
      { id },
    )).instances[0];

  /** A combination the Staging tenant is offered, read from the store as the create form would. */
  const staging = async () => {
    const tenant = (await w.read(`{ tenants(where: { name: { eq: "Acme Staging" } }) { auraId } }`)).tenants[0].auraId as string;
    const options = (await w.read(`query($t: String!) { instanceConfigurations(where: { AND: [{ tenant: { some: { auraId: { eq: $t } } } }, { cloudProvider: { eq: "gcp" } }, { type: { eq: "professional-db" } }] }) { region memory storage version } }`, { t: tenant })).instanceConfigurations;
    return { tenant, option: options[0] as { region: string; memory: string; storage: string; version: string } };
  };
  const createInput = async (over: Record<string, unknown> = {}) => {
    const { tenant, option } = await staging();
    return { tenantId: tenant, cloudProvider: "gcp", region: option.region, type: "professional-db", memory: option.memory, name: "new-instance", ...over };
  };
  const created = async (svc: AuraService, over: Record<string, unknown> = {}) => {
    const { operationId } = await svc.operations.planCreate((await createInput(over)) as never);
    await svc.operations.confirm(operationId);
    await svc.operations.idle();
    return operationId;
  };
  const oneNewInstanceId = () => [...w.mock.state.instances.keys()].find((id) => w.mock.state.instances.get(id)!.name === "new-instance")!;

  describe("planning a create", () => {
    it("records what would be made, with no instance yet, and sends nothing to Aura", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.planCreate((await createInput({ vectorOptimized: true })) as never);
      const op = await readOp(operationId);
      expect(op).toMatchObject({ kind: "CREATE", status: "PLANNED", target: [], steps: [] });
      const plan = JSON.parse(op.diff);
      expect(plan.items.map((i: { label: string }) => i.label)).toEqual(["Name", "Tenant", "Cloud", "Region", "Tier", "Memory", "Storage", "Vector optimized"]);
      expect(plan.items.find((i: { label: string }) => i.label === "Name")).toMatchObject({ before: "", after: "new-instance" });
      expect(plan.warnings.join(" ")).toMatch(/billed/);
      expect(JSON.parse(op.desired).create).toMatchObject({ name: "new-instance", tenantName: "Acme Staging", vectorOptimized: true });
      expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
      expect(w.mock.state.instances.size).toBe(6);
    });

    it("fills in the storage and version of the offered combination", async () => {
      const { operationId } = await (await ready()).operations.planCreate((await createInput()) as never);
      const { option } = await staging();
      expect(JSON.parse((await readOp(operationId)).desired).create).toMatchObject({ storage: option.storage, version: option.version });
    });

    it("refuses what the tenant is not offered, a long or empty name, and an unknown tenant", async () => {
      const svc = await ready();
      expect(await refused(svc.operations.planCreate((await createInput({ memory: "999GB" })) as never))).toMatch(/not offered/);
      expect(await refused(svc.operations.planCreate((await createInput({ region: "mars-1" })) as never))).toMatch(/not offered/);
      expect(await refused(svc.operations.planCreate((await createInput({ name: "x".repeat(31) })) as never))).toMatch(/at most 30/);
      expect(await refused(svc.operations.planCreate((await createInput({ name: "   " })) as never))).toMatch(/cannot be empty/);
      expect(await refused(svc.operations.planCreate((await createInput({ tenantId: "nope" })) as never))).toMatch(/not in the store/);
      expect((await w.read(`{ operations { id } }`)).operations).toEqual([]);
    });
  });

  describe("confirming a create", () => {
    it("creates the instance, records it with its tenant, cloud and tier, and watches it until it is running", async () => {
      const svc = await ready();
      const operationId = await created(svc);
      const op = await readOp(operationId);
      expect(op.status).toBe("SUCCEEDED");
      expect(op.steps.map((s: { status: string }) => s.status)).toEqual(Array(6).fill("DONE"));
      const id = oneNewInstanceId();
      expect(op.target).toEqual([{ auraId: id, name: "new-instance" }]);
      expect(await instance(id)).toMatchObject({
        name: "new-instance", status: "running", version: expect.any(String), connectionUrl: `neo4j+s://${id}.databases.neo4j.io`,
        tenant: [{ auraId: expect.any(String) }], cloud: [{ name: "gcp" }], tier: [{ type: "professional-db" }], deletedInAuraAt: null,
      });
      expect(changes().map((c) => c.method)).toEqual(["POST"]);
    });

    it("stores the password Aura shows once, sealed, and links it to the instance", async () => {
      const svc = await ready();
      await created(svc);
      const id = oneNewInstanceId();
      const password = w.mock.state.passwords.get(id)!;
      expect(password.length).toBeGreaterThan(8);
      expect(await instance(id)).toMatchObject({ hasStoredPassword: true, credentialUsername: "neo4j", passwordRevealCount: 0 });
      // Nothing in the database, and no list or detail query, holds it in the clear
      expect(await w.dump()).not.toContain(password);
      const [row] = await w.cypher(`MATCH (:Instance {auraId: $id})-[:HAS_CREDENTIAL]->(c:InstanceCredential) RETURN c.cipher AS cipher, c.nonce AS nonce`, { id });
      expect(row.cipher).toBeTruthy();
      expect(row.cipher).not.toContain(password);
    });

    it("refuses a create whose combination stopped being offered after it was planned", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.planCreate((await createInput()) as never);
      await w.cypher(`MATCH (c:InstanceConfiguration) DETACH DELETE c`);
      expect(await refused(svc.operations.confirm(operationId))).toMatch(/not offered/);
      expect(changes()).toEqual([]);
      expect((await readOp(operationId)).status).toBe("PLANNED");
    });

    it("sends once when confirmed twice at the same time", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.planCreate((await createInput()) as never);
      const results = await Promise.allSettled([svc.operations.confirm(operationId), svc.operations.confirm(operationId)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      await svc.operations.idle();
      expect(changes().filter((c) => c.method === "POST")).toHaveLength(1);
      expect([...w.mock.state.instances.values()].filter((i) => i.name === "new-instance")).toHaveLength(1);
    });

    it("fails with Aura's reason when Aura refuses, and records no instance", async () => {
      const svc = await ready();
      w.mock.state.faults = { rejectNext: { status: 405, message: "You have reached the maximum number of instances", reason: "instance-limit-reached" } };
      const operationId = await created(svc);
      const op = await readOp(operationId);
      expect(op.status).toBe("FAILED");
      expect(op.error).toMatch(/maximum number of instances/);
      expect((await w.read(`{ instances { auraId } }`)).instances).toHaveLength(6);
      expect(await w.cypher(`MATCH (c:InstanceCredential) RETURN c`)).toEqual([]);
    });

    it("does not ask again when the answer is lost, because a second instance costs money", async () => {
      const svc = await ready();
      w.mock.state.faults = { dropNext: true };
      const operationId = await created(svc);
      const op = await readOp(operationId);
      expect(op.status).toBe("FAILED");
      expect(op.error).toMatch(/not known whether/);
      expect(changes().filter((c) => c.method === "POST")).toHaveLength(1);
      expect([...w.mock.state.instances.values()].filter((i) => i.name === "new-instance")).toHaveLength(1);
      // A sync finds it, without a password: Aura never showed this app one
      await svc.syncNow();
      await svc.idle();
      expect(await instance(oneNewInstanceId())).toMatchObject({ hasStoredPassword: false });
    });
  });

  describe("after a restart", () => {
    const crash = async (svc: AuraService, step2: "PENDING" | "ACTIVE") => {
      const { operationId } = await svc.operations.planCreate((await createInput()) as never);
      const at = new Date().toISOString();
      await moveOperation(w.store, operationId, "PLANNED", "CONFIRMED", { confirmedAt: at }, at);
      await createSteps(w.store, operationId, at);
      if (step2 === "ACTIVE") {
        await setStep(w.store, operationId, 2, "ACTIVE", at);
        await moveOperation(w.store, operationId, "CONFIRMED", "RUNNING", {}, at);
      }
      return operationId;
    };

    it("creates it when the request was never sent", async () => {
      const operationId = await crash(await ready(), "PENDING");
      const restarted = make();
      expect(await restarted.operations.recover()).toBe(1);
      await restarted.operations.idle();
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
      expect(changes().filter((c) => c.method === "POST")).toHaveLength(1);
    });

    it("does not create it a second time when it may have been sent, and says so", async () => {
      const operationId = await crash(await ready(), "ACTIVE");
      const restarted = make();
      await restarted.operations.recover();
      await restarted.operations.idle();
      const op = await readOp(operationId);
      expect(op.status).toBe("FAILED");
      expect(op.error).toMatch(/not known whether Aura made it/);
      expect(changes()).toEqual([]);
    });
  });

  describe("deleting", () => {
    it("records the plan, which says it cannot be undone, and sends nothing", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.planDelete(ORDERS);
      const op = await readOp(operationId);
      expect(op).toMatchObject({ kind: "DELETE", status: "PLANNED", target: [{ auraId: ORDERS }] });
      expect(JSON.parse(op.diff).warnings.join(" ")).toMatch(/cannot be undone/);
      expect(changes()).toEqual([]);
    });

    it("needs the instance's name typed exactly, and checks it on the server", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.planDelete(ORDERS);
      for (const typed of [undefined, null, "", "orders", "ORDERS-PROD", "orders-prod-x", "recs-staging"]) {
        expect(await refused(svc.operations.confirm(operationId, typed))).toMatch(/Type the instance's name exactly/);
      }
      expect(changes()).toEqual([]);
      expect((await readOp(operationId)).status).toBe("PLANNED");
      expect(w.mock.state.instances.has(ORDERS)).toBe(true);
    });

    it("deletes when the name is typed, watches until Aura no longer has it, and keeps the record marked as gone", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.planDelete(ORDERS);
      await svc.operations.confirm(operationId, "orders-prod");
      await svc.operations.idle();
      const op = await readOp(operationId);
      expect(op.status).toBe("SUCCEEDED");
      expect(op.steps.map((s: { status: string }) => s.status)).toEqual(Array(6).fill("DONE"));
      expect(w.mock.state.instances.has(ORDERS)).toBe(false);
      expect(await instance(ORDERS)).toMatchObject({ name: "orders-prod", deletedInAuraAt: expect.any(String) });
      expect(changes().map((c) => c.method)).toEqual(["DELETE"]);
    });

    it("deletes the stored password with the instance", async () => {
      const svc = await ready();
      await created(svc);
      const id = oneNewInstanceId();
      expect((await instance(id)).hasStoredPassword).toBe(true);
      const { operationId } = await svc.operations.planDelete(id);
      await svc.operations.confirm(operationId, "new-instance");
      await svc.operations.idle();
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
      expect(await w.cypher(`MATCH (c:InstanceCredential) RETURN c`)).toEqual([]);
      expect((await instance(id)).hasStoredPassword).toBe(false);
    });

    it("treats an instance Aura already deleted as done", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.planDelete(ORDERS);
      w.mock.state.instances.delete(ORDERS); // removed in the Console after planning
      await svc.operations.confirm(operationId, "orders-prod");
      await svc.operations.idle();
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
      expect(await instance(ORDERS)).toMatchObject({ deletedInAuraAt: expect.any(String) });
    });

    it("can delete a paused instance", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.planDelete(SANDBOX);
      await svc.operations.confirm(operationId, "dev-sandbox");
      await svc.operations.idle();
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
    });

    it("fails with Aura's reason and keeps the instance when Aura refuses", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.planDelete(ORDERS);
      w.mock.state.faults = { rejectNext: { status: 409, message: "Another operation is in progress", reason: "instance-busy" } };
      await svc.operations.confirm(operationId, "orders-prod");
      await svc.operations.idle();
      expect(await readOp(operationId)).toMatchObject({ status: "FAILED", error: expect.stringMatching(/already working/) });
      expect(await instance(ORDERS)).toMatchObject({ deletedInAuraAt: null });
    });

    it("refuses to plan while Aura is working on the instance, and for an instance already gone", async () => {
      const svc = await ready();
      await w.cypher(`MATCH (i:Instance {auraId: $id}) SET i.status = 'updating', i.statusGroup = 'IN_PROGRESS'`, { id: RECS });
      expect(await refused(svc.operations.planDelete(RECS))).toMatch(/Aura is working on this instance/);
      await w.cypher(`MATCH (i:Instance {auraId: $id}) SET i.deletedInAuraAt = '2026-10-28T10:00:00.000Z'`, { id: ORDERS });
      expect(await refused(svc.operations.planDelete(ORDERS))).toMatch(/no longer in Aura/);
    });

    it("refuses a delete planned before the instance changed", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.planDelete(RECS);
      await w.cypher(`MATCH (i:Instance {auraId: $id}) SET i.name = 'renamed-meanwhile'`, { id: RECS });
      expect(await refused(svc.operations.confirm(operationId, "recs-staging"))).toMatch(/Plan the change again/);
      expect(changes()).toEqual([]);
    });
  });

  describe("a delete after a restart", () => {
    const crash = async (svc: AuraService) => {
      const { operationId } = await svc.operations.planDelete(ORDERS);
      const at = new Date().toISOString();
      await moveOperation(w.store, operationId, "PLANNED", "CONFIRMED", { confirmedAt: at }, at);
      await createSteps(w.store, operationId, at);
      await setStep(w.store, operationId, 2, "ACTIVE", at);
      await moveOperation(w.store, operationId, "CONFIRMED", "RUNNING", {}, at);
      return operationId;
    };
    it("finishes when Aura already deleted it, without sending a second delete", async () => {
      const operationId = await crash(await ready());
      w.mock.state.instances.delete(ORDERS);
      const restarted = make();
      await restarted.operations.recover();
      await restarted.operations.idle();
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
      expect(changes()).toEqual([]);
      expect(await instance(ORDERS)).toMatchObject({ deletedInAuraAt: expect.any(String) });
    });
    it("keeps watching when Aura is already destroying it, and does not call that done", async () => {
      const operationId = await crash(await ready());
      w.mock.state.instances.get(ORDERS)!.status = "destroying";
      const restarted = make();
      await restarted.operations.recover();
      await until(async () => (await readOp(operationId)).steps[3].status === "ACTIVE", "watching");
      expect((await readOp(operationId)).status).toBe("RUNNING");
      w.mock.state.instances.delete(ORDERS);
      await restarted.operations.idle();
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
    });
    it("does not send a delete again when it cannot tell whether one was sent", async () => {
      const operationId = await crash(await ready());
      const restarted = make();
      await restarted.operations.recover();
      await restarted.operations.idle();
      expect(await readOp(operationId)).toMatchObject({ status: "FAILED", error: expect.stringMatching(/not known whether Aura received it/) });
      expect(changes()).toEqual([]);
      expect(w.mock.state.instances.has(ORDERS)).toBe(true);
    });
  });

  describe("showing a password", () => {
    it("shows it, counts the reveal and records who asked", async () => {
      const svc = await ready();
      await created(svc);
      const id = oneNewInstanceId();
      const password = w.mock.state.passwords.get(id)!;
      expect(await svc.revealPassword(id)).toEqual({ username: "neo4j", password });
      expect(await svc.revealPassword(id, "someone")).toEqual({ username: "neo4j", password });
      expect((await instance(id)).passwordRevealCount).toBe(2);
      const events = await w.cypher(`MATCH (e:AuditEvent {instanceAuraId: $id}) RETURN e.kind AS kind, e.by AS by, e.at AS at ORDER BY e.at`, { id });
      expect(events.map((e) => [e.kind, e.by])).toEqual([["PASSWORD_REVEAL", "local"], ["PASSWORD_REVEAL", "someone"]]);
      const [credential] = await w.cypher(`MATCH (c:InstanceCredential {instanceAuraId: $id}) RETURN c.lastRevealedAt AS at`, { id });
      expect(credential.at).toBe(events[1]!.at);
      // Recording a reveal does not put the password anywhere
      expect(await w.dump()).not.toContain(password);
    });

    it("says why there is nothing to show for an instance found by a sync", async () => {
      const svc = await ready();
      expect(await refused(svc.revealPassword(ORDERS))).toMatch(/found by a sync/);
      expect(await w.cypher(`MATCH (e:AuditEvent) RETURN e`)).toEqual([]);
    });

    it("cannot be opened with another key, or moved to another instance", async () => {
      const svc = await ready();
      await created(svc);
      const id = oneNewInstanceId();
      const wrongKey = new SecretStore(w.driver, w.database, new SecretBox(new Map([[1, randomBytes(32)]]), 1));
      await expect(wrongKey.revealInstanceCredential(id, "x", new Date().toISOString())).rejects.toThrow(/Could not open/);
      // Copy the sealed value onto another instance's credential: the owner is part of what is sealed, so it will not open
      await w.cypher(`MATCH (c:InstanceCredential {instanceAuraId: $id}) CREATE (:InstanceCredential {instanceAuraId: 'other', username: 'neo4j', cipher: c.cipher, nonce: c.nonce, keyVersion: c.keyVersion})`, { id });
      await expect(w.secrets.revealInstanceCredential("other", "x", new Date().toISOString())).rejects.toThrow(/Could not open/);
      expect((await instance(id)).passwordRevealCount).toBe(0);
    });

    it("does not count a reveal it could not record", async () => {
      const svc = await ready();
      await created(svc);
      const id = oneNewInstanceId();
      const broken = new SecretStore({ session: () => { throw new Error("db down"); } } as never, w.database, w.box);
      await expect(broken.revealInstanceCredential(id, "x", new Date().toISOString())).rejects.toThrow();
      expect((await instance(id)).passwordRevealCount).toBe(0);
    });
  });

  describe("checking an instance against Aura", () => {
    it("reports no difference when they agree", async () => {
      const svc = await ready();
      expect(await svc.checkInstance(RECS)).toMatchObject({ inAura: true, differences: [] });
    });

    it("lists what differs and does not change the stored copy", async () => {
      const svc = await ready();
      w.mock.state.instances.get(RECS)!.name = "renamed-in-the-console";
      w.mock.state.instances.get(RECS)!.memory = "16GB";
      const check = await svc.checkInstance(RECS);
      expect(check.differences).toEqual([
        { field: "name", label: "Name", stored: "recs-staging", live: "renamed-in-the-console" },
        { field: "memory", label: "Memory", stored: "4GB", live: "16GB" },
      ]);
      expect((await instance(RECS)).name).toBe("recs-staging");
    });

    it("says when Aura no longer has the instance, and needs an account", async () => {
      const svc = await ready();
      w.mock.state.instances.delete(RECS);
      expect(await svc.checkInstance(RECS)).toMatchObject({ inAura: false, differences: [] });
      expect(await refused(svc.checkInstance("nope"))).toMatch(/not in the store/);
      await svc.disconnect();
      expect(await refused(svc.checkInstance(RECS))).toMatch(/Connect an Aura account/);
    });
  });

  it("never puts the client secret or a password in an operation, whatever it did", async () => {
    const svc = await ready();
    await created(svc);
    const id = oneNewInstanceId();
    const password = w.mock.state.passwords.get(id)!;
    const { operationId } = await svc.operations.planDelete(id);
    await svc.operations.confirm(operationId, "new-instance");
    await svc.operations.idle();
    const dump = await w.dump();
    expect(dump).not.toContain(password);
    expect(dump).not.toContain(MOCK_CLIENT_SECRET);
  });
});
