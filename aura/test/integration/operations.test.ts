// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { UserError } from "../../src/errors.js";
import { createSteps } from "../../src/operations/run.js";
import { moveOperation, setStep } from "../../src/operations/store.js";
import { AuraService, type ServiceOptions } from "../../src/service.js";
import { MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, integrationEnabled, startWorld, type World } from "./world.js";

const suite = integrationEnabled ? describe : describe.skip;

const RECS = "c9d8e7f6"; // recs-staging: running, 4GB / 8GB, Staging, GCP us-central1, Professional
const ORDERS = "a1b2c3d4"; // orders-prod: running, 8GB / 16GB, Production, GCP europe-west1
const SANDBOX = "e5f6a7b8"; // dev-sandbox: paused, Labs, Azure westeurope

interface Call {
  method: string;
  url: string;
  body?: string;
}

suite("changing an instance: plan, confirm, progress", () => {
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
    // Let anything a test left running finish (a test that stalls Aura uses a short timeout), so it cannot reach into the next test
    await Promise.all(services.map((s) => s.operations.idle()));
  });

  const counting: typeof fetch = async (url, init) => {
    calls.push({ method: init?.method ?? "GET", url: String(url), body: typeof init?.body === "string" ? init.body : undefined });
    return fetch(url, init);
  };
  /** Requests that would change something in Aura. Reads are not counted. */
  const changes = () => calls.filter((c) => c.method !== "GET" && c.url.includes("/v1/"));

  const make = (over: Partial<ServiceOptions> = {}) => {
    const svc = new AuraService({
      accountId: "default", auraBaseUrl: w.mockBase, syncConcurrency: 3, syncIntervalMs: 0, secrets: w.secrets, store: w.store,
      fetch: counting, operationPollDelayMs: () => 10, operationTimeoutMs: 20_000, ...over,
    });
    services.push(svc);
    return svc;
  };
  /** A connected account with everything synced. */
  const ready = async (over: Partial<ServiceOptions> = {}) => {
    const svc = make(over);
    await svc.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
    await svc.idle();
    calls = []; // from here on, count only what the test does
    return svc;
  };

  const OP = `query($id: ID!) { operations(where: { id: { eq: $id } }) {
    id kind status error desired before diff basedOnSyncedAt requestedBy createdAt confirmedAt finishedAt
    target { auraId } steps(sort: [{ seq: ASC }]) { seq label status detail at } } }`;
  const readOp = async (id: string) => (await w.read(OP, { id })).operations[0];
  const until = async (check: () => Promise<boolean>, what: string, ms = 15_000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error(`Timed out waiting for ${what}`);
  };
  const stored = async (id: string) =>
    (await w.read(`query($id: String!) { instances(where: { auraId: { eq: $id } }) { name status statusGroup memory storage vectorOptimized graphAnalyticsPlugin } }`, { id })).instances[0];
  const refused = async (work: Promise<unknown>) => {
    const err = await work.then(() => undefined, (e) => e);
    expect(err, "expected a refusal").toBeInstanceOf(UserError);
    return (err as UserError).message;
  };
  const resize = { memory: "8GB", storage: "16GB" };
  const aura = async (method: string, path: string, body?: unknown) => {
    const t = await (await fetch(`${w.mockBase}/oauth/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${MOCK_CLIENT_ID}:${MOCK_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" })).json();
    return fetch(`${w.mockBase}/v1${path}`, { method, headers: { Authorization: `Bearer ${t.access_token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  };

  describe("planning", () => {
    it("records the plan for review and sends nothing to Aura", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.plan("UPDATE", RECS, { ...resize, name: "recs-v2" });
      const op = await readOp(operationId);

      expect(op).toMatchObject({ kind: "UPDATE", status: "PLANNED", requestedBy: "local", error: null, confirmedAt: null, finishedAt: null, steps: [], target: [{ auraId: RECS }] });
      expect(JSON.parse(op.desired)).toEqual({ kind: "UPDATE", changes: { name: "recs-v2", memory: "8GB", storage: "16GB" } });
      expect(JSON.parse(op.before)).toMatchObject({ name: "recs-staging", status: "running", memory: "4GB", storage: "8GB" });
      const plan = JSON.parse(op.diff);
      expect(plan.items.map((i: { label: string; before: string; after: string }) => [i.label, i.before, i.after])).toEqual([["Name", "recs-staging", "recs-v2"], ["Memory", "4 GB", "8 GB"], ["Storage", "8 GB", "16 GB"]]);
      expect(plan.warnings[0]).toContain("billed");
      expect(op.basedOnSyncedAt).toMatch(/Z$/);
      expect(op.createdAt).toMatch(/\.\d{3}Z$/);

      expect(changes()).toEqual([]); // nothing changed in Aura
      expect((await stored(RECS))).toMatchObject({ memory: "4GB", name: "recs-staging" });
      expect(w.mock.state.instances.get(RECS)!.memory).toBe("4GB");
    });

    it("plans a pause and a resume, also without touching Aura", async () => {
      const svc = await ready();
      const pause = await readOp((await svc.operations.plan("PAUSE", ORDERS)).operationId);
      expect(pause).toMatchObject({ kind: "PAUSE", status: "PLANNED" });
      expect(JSON.parse(pause.diff).items).toEqual([{ field: "state", label: "State", before: "Running", after: "Paused" }]);
      const resume = await readOp((await svc.operations.plan("RESUME", SANDBOX)).operationId);
      expect(resume).toMatchObject({ kind: "RESUME", status: "PLANNED" });
      expect(changes()).toEqual([]);
    });

    it("allows several plans for one instance: only a confirmed one holds it", async () => {
      const svc = await ready();
      const a = await svc.operations.plan("UPDATE", RECS, resize);
      const b = await svc.operations.plan("UPDATE", RECS, { name: "other" });
      expect(a.operationId).not.toBe(b.operationId);
    });

    it.each([
      ["an instance that is not in the store", () => ["UPDATE", "nope", { name: "x" }] as const, "That instance is not in the store. Sync, then try again."],
      ["a name that is too long", () => ["UPDATE", RECS, { name: "x".repeat(31) }] as const, "The name can be at most 30 characters."],
      ["an empty name", () => ["UPDATE", RECS, { name: "  " }] as const, "The name cannot be empty."],
      ["memory without storage", () => ["UPDATE", RECS, { memory: "8GB" }] as const, "Memory and storage are chosen together."],
      ["a size the tenant is not offered", () => ["UPDATE", RECS, { memory: "8GB", storage: "999GB" }] as const, "That memory and storage is not offered for this instance's cloud, region and tier."],
      ["a change that changes nothing", () => ["UPDATE", RECS, { name: "recs-staging", memory: "4GB", storage: "8GB" }] as const, "Nothing would change."],
      ["editing a paused instance", () => ["UPDATE", SANDBOX, { name: "x" }] as const, "Resume this instance first. A paused instance cannot be edited."],
      ["pausing a paused instance", () => ["PAUSE", SANDBOX, {}] as const, "Only a running instance can be paused (this one is paused)."],
      ["resuming a running instance", () => ["RESUME", RECS, {}] as const, "Only a paused instance can be resumed (this one is running)."],
    ])("refuses %s, with a plain reason, and records nothing", async (_label, args, reason) => {
      const svc = await ready();
      const [kind, id, input] = args();
      expect(await refused(svc.operations.plan(kind, id, input))).toBe(reason);
      expect((await w.read(`{ operationsConnection { totalCount } }`)).operationsConnection.totalCount).toBe(0);
    });

    it("refuses an instance Aura is working on, or no longer lists", async () => {
      const svc = await ready();
      w.mock.state.instances.get(RECS)!.status = "updating"; // set directly: a real change would finish before we looked
      w.mock.state.instances.delete(ORDERS);
      await svc.syncNow();
      await svc.idle();
      expect(await refused(svc.operations.plan("UPDATE", RECS, { name: "x" }))).toBe("Aura is working on this instance (updating). Wait for it to finish.");
      expect(await refused(svc.operations.plan("PAUSE", ORDERS))).toContain("no longer in Aura");
    });
  });

  describe("confirming and carrying out", () => {
    it("resizes: sends one request, follows it, and leaves the stored copy and every step right", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.plan("UPDATE", RECS, resize);
      const result = await svc.operations.confirm(operationId);
      expect(result).toEqual({ operationId, status: "CONFIRMED" });
      await svc.operations.idle();

      const op = await readOp(operationId);
      expect(op).toMatchObject({ status: "SUCCEEDED", error: null });
      expect(op.confirmedAt).toMatch(/Z$/);
      expect(op.finishedAt).toMatch(/Z$/);
      expect(op.finishedAt >= op.confirmedAt).toBe(true);
      expect(op.steps.map((s: { seq: number; status: string }) => [s.seq, s.status])).toEqual([[1, "DONE"], [2, "DONE"], [3, "DONE"], [4, "DONE"], [5, "DONE"], [6, "DONE"]]);
      expect(op.steps.map((s: { label: string }) => s.label)).toEqual(["Change confirmed", "Request sent to Aura", "Accepted by Aura", "Waiting for Aura to finish", "Updating the stored copy", "Done"]);
      for (const s of op.steps) expect(s.at, `step ${s.seq} has a time`).toMatch(/Z$/);

      expect(changes()).toHaveLength(1);
      expect(changes()[0]).toMatchObject({ method: "PATCH" });
      expect(changes()[0]!.url).toContain(`/instances/${RECS}`);
      expect(JSON.parse(changes()[0]!.body!)).toEqual({ memory: "8GB", storage: "16GB" }); // only what was asked
      expect(w.mock.state.instances.get(RECS)).toMatchObject({ memory: "8GB", storage: "16GB", status: "running" });
      expect(await stored(RECS)).toMatchObject({ memory: "8GB", storage: "16GB", status: "running", statusGroup: "READY" });
    });

    it("renames (Aura answers 200 at once) and sends only the name", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.plan("UPDATE", RECS, { name: "recs-renamed" });
      await svc.operations.confirm(operationId);
      await svc.operations.idle();
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
      expect(JSON.parse(changes()[0]!.body!)).toEqual({ name: "recs-renamed" });
      expect(await stored(RECS)).toMatchObject({ name: "recs-renamed" });
    });

    it("turns the switches on, using Aura's field names", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.plan("UPDATE", RECS, { vectorOptimized: true, graphAnalyticsPlugin: true });
      await svc.operations.confirm(operationId);
      await svc.operations.idle();
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
      expect(JSON.parse(changes()[0]!.body!)).toEqual({ vector_optimized: true, graph_analytics_plugin: true });
      expect(await stored(RECS)).toMatchObject({ vectorOptimized: true, graphAnalyticsPlugin: true });
    });

    it("pauses, then resumes", async () => {
      const svc = await ready();
      const pause = await svc.operations.plan("PAUSE", ORDERS);
      await svc.operations.confirm(pause.operationId);
      await svc.operations.idle();
      expect((await readOp(pause.operationId)).status).toBe("SUCCEEDED");
      expect(changes()[0]!.url).toContain(`/instances/${ORDERS}/pause`);
      expect(await stored(ORDERS)).toMatchObject({ status: "paused", statusGroup: "STOPPED" });

      const resume = await svc.operations.plan("RESUME", ORDERS);
      await svc.operations.confirm(resume.operationId);
      await svc.operations.idle();
      expect((await readOp(resume.operationId)).status).toBe("SUCCEEDED");
      expect(await stored(ORDERS)).toMatchObject({ status: "running", statusGroup: "READY" });
      expect(changes()).toHaveLength(2);
    });

    it("shows progress while it waits: running, with the step and what Aura says", async () => {
      const svc = await ready();
      w.mock.state.faults = { stall: true }; // Aura accepts the change but does not finish
      const { operationId } = await svc.operations.plan("UPDATE", RECS, resize);
      await svc.operations.confirm(operationId);
      await until(async () => (await readOp(operationId)).steps.find((s: { seq: number }) => s.seq === 4)?.detail === "Aura says: updating", "the waiting step to show Aura's status");

      const op = await readOp(operationId);
      expect(op.status).toBe("RUNNING");
      expect(op.steps.map((s: { status: string }) => s.status)).toEqual(["DONE", "DONE", "DONE", "ACTIVE", "PENDING", "PENDING"]);
      expect(op.finishedAt).toBeNull();
      expect(await stored(RECS)).toMatchObject({ memory: "4GB" }); // the stored copy is not touched until Aura has finished

      // Aura finishes
      w.mock.state.faults = {};
      w.mock.state.instances.get(RECS)!.status = "running";
      await svc.operations.idle();
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
      expect(await stored(RECS)).toMatchObject({ memory: "8GB" });
    });
  });

  describe("the rules at confirmation", () => {
    it("lets only one of two simultaneous confirmations through, and sends one request", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.plan("UPDATE", RECS, resize);
      const results = await Promise.allSettled([svc.operations.confirm(operationId), svc.operations.confirm(operationId), svc.operations.confirm(operationId)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const messages = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => (r.reason as Error).message);
      expect(messages).toHaveLength(2);
      for (const m of messages) expect(m).toMatch(/already confirmed|being confirmed/);
      await svc.operations.idle();
      expect(changes()).toHaveLength(1);
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
    });

    it("cannot confirm a plan twice, in turn", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.plan("UPDATE", RECS, { name: "once" });
      await svc.operations.confirm(operationId);
      await svc.operations.idle();
      expect(await refused(svc.operations.confirm(operationId))).toBe("This change was already confirmed.");
      expect(changes()).toHaveLength(1);
    });

    it("cancels a plan, and then it can neither be confirmed nor cancelled again, and Aura is never asked", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.plan("UPDATE", RECS, resize);
      await svc.operations.cancel(operationId);
      const op = await readOp(operationId);
      expect(op).toMatchObject({ status: "CANCELLED" });
      expect(op.finishedAt).toMatch(/Z$/);
      expect(await refused(svc.operations.confirm(operationId))).toBe("This change was cancelled.");
      expect(await refused(svc.operations.cancel(operationId))).toBe("This change was already cancelled.");
      expect(changes()).toEqual([]);
    });

    it("cannot cancel a change that has been sent", async () => {
      const svc = await ready();
      w.mock.state.faults = { stall: true };
      const { operationId } = await svc.operations.plan("UPDATE", RECS, resize);
      await svc.operations.confirm(operationId);
      expect(await refused(svc.operations.cancel(operationId))).toBe("This change has already been sent to Aura, so it can no longer be cancelled.");
      w.mock.state.faults = {};
      w.mock.state.instances.get(RECS)!.status = "running";
    });

    it("refuses a plan the instance has moved on from, and sends nothing", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.plan("UPDATE", RECS, resize);
      w.mock.state.instances.get(RECS)!.name = "renamed-in-the-console"; // someone changed it in Aura
      await svc.syncNow();
      await svc.idle();
      expect(await refused(svc.operations.confirm(operationId))).toBe("This instance changed after you planned this. Plan the change again.");
      expect((await readOp(operationId)).status).toBe("PLANNED"); // left for the person to cancel or replace
      expect(changes()).toEqual([]);
    });

    it("does not call a plan stale just because a sync ran: only a real change to the instance does", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.plan("UPDATE", RECS, resize);
      const planned = await readOp(operationId);
      await new Promise((r) => setTimeout(r, 20));
      await svc.syncNow(); // rereads every instance and stamps a new syncedAt, but finds nothing different
      await svc.idle();
      expect((await w.read(`query($id: String!) { instances(where: { auraId: { eq: $id } }) { syncedAt } }`, { id: RECS })).instances[0].syncedAt > planned.basedOnSyncedAt).toBe(true);

      expect(await svc.operations.confirm(operationId)).toEqual({ operationId, status: "CONFIRMED" });
      await svc.operations.idle();
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
    });

    it("refuses a second change while one holds the instance, and planning one too", async () => {
      const svc = await ready({ operationTimeoutMs: 600 });
      w.mock.state.faults = { stall: true };
      const first = await svc.operations.plan("UPDATE", RECS, resize);
      const second = await svc.operations.plan("UPDATE", RECS, { name: "other" }); // planned before the first holds the instance
      await svc.operations.confirm(first.operationId);
      expect(await refused(svc.operations.confirm(second.operationId))).toBe("Another change to this instance is already in progress.");
      // The stored status still says running (it follows Aura only when the change is done), so it is the hold that stops this
      expect(await refused(svc.operations.plan("PAUSE", RECS))).toBe("Another change to this instance is already in progress.");
      // a different instance is not held
      expect((await svc.operations.plan("UPDATE", ORDERS, { name: "free-to-plan" })).operationId).toBeTruthy();
    });

    it("refuses when no account is connected", async () => {
      const svc = await ready();
      const { operationId } = await svc.operations.plan("UPDATE", RECS, resize);
      await svc.disconnect();
      expect(await refused(svc.operations.confirm(operationId))).toBe("Connect an Aura account first.");
      expect(changes()).toEqual([]);
    });

    it("refuses a change that does not exist", async () => {
      const svc = await ready();
      expect(await refused(svc.operations.confirm("00000000-0000-0000-0000-000000000000"))).toBe("That change does not exist.");
      expect(await refused(svc.operations.cancel("00000000-0000-0000-0000-000000000000"))).toBe("That change does not exist.");
    });
  });

  describe("when Aura says no or goes wrong", () => {
    const failedWith = async (plan: (svc: AuraService) => Promise<{ operationId: string }>, over: Partial<ServiceOptions> = {}) => {
      const svc = await ready(over);
      const { operationId } = await plan(svc);
      await svc.operations.confirm(operationId);
      await svc.operations.idle();
      return { svc, operationId, op: await readOp(operationId) };
    };

    it("records Aura's 409 plainly, fails at the sending step, and changes nothing", async () => {
      w.mock.state.faults = { rejectNext: { status: 409, message: "The database is current undergoing an operation: updating", reason: "ongoing-database-operation" } };
      const { op } = await failedWith((s) => s.operations.plan("UPDATE", RECS, resize));
      expect(op).toMatchObject({ status: "FAILED", error: "Aura is already working on this instance. Wait for it to finish, then plan the change again." });
      expect(op.steps.map((s: { status: string }) => s.status)).toEqual(["DONE", "FAILED", "PENDING", "PENDING", "PENDING", "PENDING"]);
      expect(op.steps[1].detail).toBe(op.error);
      expect(op.finishedAt).toMatch(/Z$/);
      expect(await stored(RECS)).toMatchObject({ memory: "4GB" });
      expect(changes()).toHaveLength(1); // asked once, not again
    });

    it("passes on Aura's reason for refusing a change", async () => {
      w.mock.state.faults = { rejectNext: { status: 400, message: "That memory is not available for this instance", reason: "invalid-configuration" } };
      const { op } = await failedWith((s) => s.operations.plan("UPDATE", RECS, resize));
      expect(op.error).toBe("Aura refused the change: That memory is not available for this instance");
    });

    it("does NOT send the change again after a server error, because it may have been made", async () => {
      w.mock.state.faults = { rejectNext: { status: 500, message: "boom", reason: "bug" } };
      const { op } = await failedWith((s) => s.operations.plan("UPDATE", RECS, resize));
      expect(op.status).toBe("FAILED");
      expect(op.error).toContain("Aura answered 500: boom");
      expect(op.error).toContain("It is not known whether the change was made");
      expect(changes()).toHaveLength(1); // a retry would have succeeded here, and the operation would have succeeded
      expect(w.mock.state.instances.get(RECS)!.memory).toBe("4GB");
    });

    it("says it is not known whether a change was made when the connection dropped after Aura did it, and the next sync shows the truth", async () => {
      w.mock.state.faults = { dropNext: true };
      const { svc, op } = await failedWith((s) => s.operations.plan("UPDATE", RECS, resize));
      expect(op.status).toBe("FAILED");
      expect(op.error).toContain("not known whether Aura received it");
      expect(changes()).toHaveLength(1); // not sent a second time
      expect(w.mock.state.instances.get(RECS)!.memory).toBe("8GB"); // it was done after all

      await until(async () => w.mock.state.instances.get(RECS)!.status === "running", "Aura to finish");
      expect(await stored(RECS)).toMatchObject({ memory: "4GB" }); // the stored copy has not heard yet
      await svc.syncNow();
      await svc.idle();
      expect(await stored(RECS)).toMatchObject({ memory: "8GB" }); // and now it has
    });

    it("fails when Aura reports the instance as 'loading failed'", async () => {
      w.mock.state.faults = { endAs: "loading failed" };
      const { op } = await failedWith((s) => s.operations.plan("UPDATE", RECS, resize));
      expect(op).toMatchObject({ status: "FAILED", error: "Aura reports this instance as 'loading failed'." });
      expect(op.steps.find((s: { seq: number }) => s.seq === 4)).toMatchObject({ status: "FAILED" });
      expect(op.steps.slice(4).map((s: { status: string }) => s.status)).toEqual(["PENDING", "PENDING"]);
    });

    it("gives up after the time allowed, saying so and that it may still finish", async () => {
      w.mock.state.faults = { stall: true };
      const { op } = await failedWith((s) => s.operations.plan("UPDATE", RECS, resize), { operationTimeoutMs: 1500 });
      expect(op.status).toBe("FAILED");
      expect(op.error).toMatch(/^Aura did not show the change within \d+ seconds?\. It may still finish; the stored copy will catch up at the next sync\.$/);
      expect(op.steps.find((s: { seq: number }) => s.seq === 4)).toMatchObject({ status: "FAILED" });
    });

    it("fails if Aura loses the instance while it waits", async () => {
      w.mock.state.faults = { stall: true };
      const svc = await ready();
      const { operationId } = await svc.operations.plan("UPDATE", RECS, resize);
      await svc.operations.confirm(operationId);
      await until(async () => (await readOp(operationId)).steps.find((s: { seq: number }) => s.seq === 4)?.status === "ACTIVE", "waiting");
      w.mock.state.instances.delete(RECS);
      await svc.operations.idle();
      expect(await readOp(operationId)).toMatchObject({ status: "FAILED", error: "Aura no longer has this instance." });
    });

    it("keeps going through a couple of lost looks at Aura, and succeeds", async () => {
      let blips = 2;
      const svc = await ready({
        fetch: async (url, init) => {
          // Two reads of the instance fail as if the network dropped, once the change has been sent
          if (blips > 0 && (init?.method ?? "GET") === "GET" && String(url).endsWith(`/v1/instances/${RECS}`) && changes().length > 0) {
            blips--;
            throw new TypeError("fetch failed");
          }
          return counting(url, init);
        },
      });
      const { operationId } = await svc.operations.plan("UPDATE", RECS, resize);
      await svc.operations.confirm(operationId);
      await svc.operations.idle();
      expect(blips).toBe(0);
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
    });

    it("gives up, honestly, when contact stays lost while it waits", async () => {
      const svc = await ready({
        fetch: async (url, init) => {
          if ((init?.method ?? "GET") === "GET" && String(url).endsWith(`/v1/instances/${RECS}`) && changes().length > 0) throw new TypeError("fetch failed");
          return counting(url, init);
        },
      });
      const { operationId } = await svc.operations.plan("UPDATE", RECS, resize);
      await svc.operations.confirm(operationId);
      await svc.operations.idle();
      const op = await readOp(operationId);
      expect(op.status).toBe("FAILED");
      expect(op.error).toBe("Lost contact with Aura while waiting. The change may still finish; the stored copy will catch up at the next sync.");
      expect(changes()).toHaveLength(1);
    });

    it("never puts a secret into an operation, a step or an error", async () => {
      w.mock.state.faults = { rejectNext: { status: 409, message: "busy", reason: "ongoing-database-operation" } };
      await failedWith((s) => s.operations.plan("UPDATE", RECS, resize));
      const dump = await w.dump();
      expect(dump).not.toContain(MOCK_CLIENT_SECRET);
      expect(dump).not.toContain(MOCK_CLIENT_ID);
    });
  });

  describe("after a restart", () => {
    /** Confirm by hand, as the service does, and stop there: the state a crash right after confirming leaves behind. */
    const crashAfterConfirm = async (svc: AuraService, kind: "UPDATE" | "PAUSE" = "UPDATE") => {
      const { operationId } = kind === "UPDATE" ? await svc.operations.plan("UPDATE", RECS, resize) : await svc.operations.plan("PAUSE", ORDERS);
      const at = new Date().toISOString();
      await moveOperation(w.store, operationId, "PLANNED", "CONFIRMED", { confirmedAt: at }, at);
      await createSteps(w.store, operationId, at);
      return operationId;
    };

    it("finds nothing to do when nothing was interrupted", async () => {
      expect(await (await ready()).operations.recover()).toBe(0);
    });

    it("leaves an interrupted change alone when no account is connected, because it cannot ask Aura anything", async () => {
      const svc = await ready();
      const operationId = await crashAfterConfirm(svc);
      await svc.disconnect();
      expect(await make().operations.recover()).toBe(0);
      expect((await readOp(operationId)).status).toBe("CONFIRMED");
      expect(changes()).toEqual([]);
    });

    it("runs a change that was confirmed but never sent", async () => {
      const operationId = await crashAfterConfirm(await ready());
      const restarted = make();
      expect(await restarted.operations.recover()).toBe(1);
      await restarted.operations.idle();
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
      expect(changes()).toHaveLength(1);
      expect(await stored(RECS)).toMatchObject({ memory: "8GB" });
    });

    it("only watches a change that was sent and answered, and does not send it again", async () => {
      const svc = await ready();
      const operationId = await crashAfterConfirm(svc);
      const at = new Date().toISOString();
      await moveOperation(w.store, operationId, "CONFIRMED", "RUNNING", {}, at);
      await setStep(w.store, operationId, 2, "DONE", at);
      await setStep(w.store, operationId, 3, "DONE", at);
      expect((await aura("PATCH", `/instances/${RECS}`, resize)).status).toBe(202); // what the lost process had sent
      calls = [];

      const restarted = make();
      await restarted.operations.recover();
      await restarted.operations.idle();
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
      expect(changes()).toEqual([]); // not sent a second time
      expect(await stored(RECS)).toMatchObject({ memory: "8GB" });
    });

    it("records success without sending again when it was being sent and Aura already shows the change", async () => {
      const svc = await ready();
      const operationId = await crashAfterConfirm(svc);
      await setStep(w.store, operationId, 2, "ACTIVE", new Date().toISOString());
      await aura("PATCH", `/instances/${RECS}`, resize);
      await until(async () => w.mock.state.instances.get(RECS)!.status === "running", "Aura to finish");
      calls = [];

      const restarted = make();
      await restarted.operations.recover();
      await restarted.operations.idle();
      const op = await readOp(operationId);
      expect(op.status).toBe("SUCCEEDED");
      expect(op.steps.map((s: { status: string }) => s.status)).toEqual(["DONE", "DONE", "DONE", "DONE", "DONE", "DONE"]);
      expect(changes()).toEqual([]);
      expect(await stored(RECS)).toMatchObject({ memory: "8GB" });
    });

    it("keeps watching when it was being sent and Aura is part way through", async () => {
      const svc = await ready();
      const operationId = await crashAfterConfirm(svc);
      await setStep(w.store, operationId, 2, "ACTIVE", new Date().toISOString());
      w.mock.state.faults = { stall: true };
      await aura("PATCH", `/instances/${RECS}`, resize); // now "updating"
      calls = [];

      const restarted = make();
      await restarted.operations.recover();
      await until(async () => (await readOp(operationId)).status === "RUNNING", "it to be watched");
      expect(changes()).toEqual([]);
      w.mock.state.faults = {};
      w.mock.state.instances.get(RECS)!.status = "running";
      await restarted.operations.idle();
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
      expect(changes()).toEqual([]);
    });

    it("fails, and says why, when it was being sent and there is no sign Aura got it, rather than ask Aura a second time", async () => {
      const svc = await ready();
      const operationId = await crashAfterConfirm(svc);
      await setStep(w.store, operationId, 2, "ACTIVE", new Date().toISOString());
      calls = [];

      const restarted = make();
      await restarted.operations.recover();
      const op = await readOp(operationId);
      expect(op.status).toBe("FAILED");
      expect(op.error).toBe("This app stopped while it was sending the change, so it is not known whether Aura received it. Check the instance, then plan the change again if it did not happen.");
      expect(op.steps[1]).toMatchObject({ status: "FAILED" });
      expect(changes()).toEqual([]);
      expect(await stored(RECS)).toMatchObject({ memory: "4GB" });
    });

    it("start() recovers interrupted changes before syncing", async () => {
      const operationId = await crashAfterConfirm(await ready());
      const restarted = make();
      await restarted.start();
      await restarted.operations.idle();
      await restarted.idle();
      expect((await readOp(operationId)).status).toBe("SUCCEEDED");
    });
  });
});
