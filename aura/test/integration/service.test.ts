// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuraService, UserError, type ServiceOptions } from "../../src/service.js";
import { MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, integrationEnabled, startWorld, type World } from "./world.js";

const suite = integrationEnabled ? describe : describe.skip;

suite("the Aura service: connect, disconnect and sync", () => {
  let w: World;
  beforeAll(async () => {
    w = await startWorld();
  });
  afterAll(() => w?.close());
  beforeEach(async () => {
    w.mock.reset();
    await w.wipe();
  });

  const service = (over: Partial<ServiceOptions> = {}) =>
    new AuraService({
      accountId: "default",
      auraBaseUrl: w.mockBase,
      syncConcurrency: 3,
      syncIntervalMs: 0,
      secrets: w.secrets,
      store: w.store,
      sleep: async () => {},
      ...over,
    });
  const count = async (label: string) => Number((await w.cypher(`MATCH (n:${label}) RETURN count(n) AS n`))[0]!.n);
  const waitUntil = async (check: () => Promise<boolean>, what: string) => {
    for (let i = 0; i < 200; i++) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error(`Timed out waiting for ${what}`);
  };

  describe("before anything is connected", () => {
    it("says setup is required, and has nothing to show", async () => {
      expect(await service().setup()).toEqual({
        required: true, connected: false, clientIdHint: null, lastSyncAt: null, syncing: false, lastSyncRunId: null, lastSyncStatus: null, lastSyncError: null,
      });
    });

    it("cannot sync", async () => {
      await expect(service().syncNow()).rejects.toMatchObject({ message: "Connect an Aura account first." });
      expect(await count("SyncRun")).toBe(0);
    });
  });

  describe("connecting", () => {
    it("stores nothing when Aura rejects the credentials", async () => {
      const svc = service();
      const err = await svc.connect(MOCK_CLIENT_ID, "wrong-secret").catch((e) => e);
      expect(err).toBeInstanceOf(UserError);
      expect(err.message).toBe("Aura rejected that client id and secret. Check them in the Aura Console.");
      expect(err.message).not.toContain("wrong-secret");
      expect(await count("AuraSecret")).toBe(0);
      expect(await count("AuraAccount")).toBe(0);
      expect(await count("SyncRun")).toBe(0);
      expect((await svc.setup()).required).toBe(true);
    });

    it("stores nothing when Aura cannot be reached, and says so", async () => {
      const svc = service({ auraBaseUrl: "http://127.0.0.1:1" });
      await expect(svc.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET)).rejects.toMatchObject({ message: "Could not reach Aura to check the credentials. Try again in a moment." });
      expect(await count("AuraSecret")).toBe(0);
      expect(await count("AuraAccount")).toBe(0);
    });

    it("asks for both fields, and refuses absurdly long ones, before calling Aura", async () => {
      const svc = service();
      await expect(svc.connect("", "x")).rejects.toMatchObject({ message: "Enter both the client id and the client secret." });
      await expect(svc.connect("x", "   ")).rejects.toMatchObject({ message: "Enter both the client id and the client secret." });
      await expect(svc.connect("x".repeat(201), "y")).rejects.toMatchObject({ message: "That client id or secret is too long." });
      expect(await count("AuraSecret")).toBe(0);
    });

    it("connects, stores the secret encrypted, records the account and syncs everything", async () => {
      const svc = service();
      const result = await svc.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
      expect(result.connected).toBe(true);
      expect(result.syncRunId).toBeTruthy();
      await svc.idle();

      const setup = await svc.setup();
      expect(setup).toMatchObject({ required: false, connected: true, clientIdHint: "a1b2....a7b8", syncing: false, lastSyncRunId: result.syncRunId, lastSyncStatus: "SUCCEEDED", lastSyncError: null });
      expect(setup.lastSyncAt).toMatch(/Z$/);

      const account = (await w.read(`{ auraAccounts { id label status clientIdHint connectedAt } }`)).auraAccounts[0];
      expect(account).toMatchObject({ id: "default", status: "CONNECTED", clientIdHint: "a1b2....a7b8" });
      expect(account.connectedAt).toMatch(/Z$/);
      expect((await w.read(`{ instancesConnection { totalCount } tenantsConnection { totalCount } instanceConfigurationsConnection { totalCount } }`))).toEqual({
        instancesConnection: { totalCount: 6 }, tenantsConnection: { totalCount: 3 }, instanceConfigurationsConnection: { totalCount: 48 },
      });
    });

    it("keeps the secret and the client id out of the database, in every node and relationship", async () => {
      const svc = service();
      await svc.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
      await svc.idle();
      const dump = await w.dump();
      expect(dump).not.toContain(MOCK_CLIENT_SECRET);
      expect(dump).not.toContain(MOCK_CLIENT_ID);
      expect(await w.secrets.loadAuraSecret("default")).toEqual({ clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET });
    });

    it("trims stray spaces and newlines from what was pasted", async () => {
      const svc = service();
      await svc.connect(`  ${MOCK_CLIENT_ID} `, `${MOCK_CLIENT_SECRET}\n`);
      await svc.idle();
      expect(await w.secrets.loadAuraSecret("default")).toEqual({ clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET });
    });

    it("leaves the working credentials alone when a replacement is refused", async () => {
      const svc = service();
      await svc.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
      await svc.idle();
      await expect(svc.connect(MOCK_CLIENT_ID, "a-typo")).rejects.toBeInstanceOf(UserError);
      expect(await w.secrets.loadAuraSecret("default")).toEqual({ clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET });
      expect((await svc.setup()).connected).toBe(true);
    });
  });

  describe("syncing on demand", () => {
    it("runs one sync at a time: asking again while one runs reports the same run", async () => {
      // Hold every Aura API request until we let go, so the first sync is still running when we ask again
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const gated: typeof fetch = async (url, init) => {
        if (String(url).includes("/v1/")) await gate;
        return fetch(url, init);
      };
      const svc = service({ fetch: gated });
      const first = await svc.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
      expect((await svc.setup()).syncing).toBe(true);

      const again = await svc.syncNow();
      expect(again).toEqual({ started: false, runId: first.syncRunId });
      expect(await count("SyncRun")).toBe(1);

      release();
      await svc.idle();
      expect((await svc.setup()).syncing).toBe(false);

      const next = await svc.syncNow();
      expect(next.started).toBe(true);
      expect(next.runId).not.toBe(first.syncRunId);
      await svc.idle();
      expect(await count("SyncRun")).toBe(2);
    });
  });

  describe("disconnecting", () => {
    it("deletes the secret and stops syncing, but keeps instances, stored passwords and history", async () => {
      const svc = service();
      await svc.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
      await svc.idle();
      // A password this app holds for an instance (the reveal feature stores these)
      await w.cypher(`MATCH (i:Instance {auraId: "a1b2c3d4"}) CREATE (i)-[:HAS_CREDENTIAL]->(:InstanceCredential {instanceAuraId: "a1b2c3d4", username: "neo4j", passwordCipher: "x", nonce: "y", keyVersion: 1})`);

      await svc.disconnect();

      expect(await count("AuraSecret")).toBe(0);
      expect(await w.secrets.hasAuraSecret("default")).toBe(false);
      expect(await svc.setup()).toMatchObject({ required: true, connected: false, syncing: false });
      expect((await w.read(`{ auraAccounts { status } }`)).auraAccounts[0].status).toBe("DISCONNECTED");
      // kept
      expect(await count("Instance")).toBe(6);
      expect(await count("Tenant")).toBe(3);
      expect(await count("InstanceConfiguration")).toBe(48);
      expect(await count("SyncRun")).toBe(1);
      expect(await count("InstanceCredential")).toBe(1);
      expect((await w.read(`{ instances(where: { auraId: { eq: "a1b2c3d4" } }) { hasStoredPassword } }`)).instances[0].hasStoredPassword).toBe(true);
      // and nothing more happens
      await expect(svc.syncNow()).rejects.toMatchObject({ message: "Connect an Aura account first." });
    });

    it("can be done when nothing is connected", async () => {
      await w.store.request(`mutation { createAuraAccounts(input: [{ id: "default", label: "x", status: CONNECTED }]) { info { nodesCreated } } }`);
      await service().disconnect();
      expect((await w.read(`{ auraAccounts { status } }`)).auraAccounts[0].status).toBe("DISCONNECTED");
    });

    it("lets you reconnect: the account is connected again and the data is not duplicated", async () => {
      const svc = service();
      await svc.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
      await svc.idle();
      await svc.disconnect();
      await svc.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
      await svc.idle();
      expect((await w.read(`{ auraAccounts { status clientIdHint } }`)).auraAccounts).toEqual([{ status: "CONNECTED", clientIdHint: "a1b2....a7b8" }]);
      expect(await count("Instance")).toBe(6);
      expect(await count("Tenant")).toBe(3);
      expect(await count("AuraAccount")).toBe(1);
      expect(await count("SyncRun")).toBe(2);
    });
  });

  describe("after a restart", () => {
    it("syncs at start when an account is already connected, and not otherwise", async () => {
      const fresh = service();
      await fresh.start();
      await fresh.idle();
      expect(await count("SyncRun")).toBe(0);

      const first = service();
      await first.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
      await first.idle();
      expect(await count("SyncRun")).toBe(1);

      const restarted = service(); // a new process: no cached token, no memory of the first
      await restarted.start();
      await restarted.idle();
      restarted.stop();
      expect(await count("SyncRun")).toBe(2);
      expect((await restarted.setup()).lastSyncStatus).toBe("SUCCEEDED");
    });

    it("fails the sync and says to replace the credentials when the stored ones have been revoked", async () => {
      const first = service();
      await first.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
      await first.idle();
      await w.secrets.saveAuraSecret("default", { clientId: MOCK_CLIENT_ID, clientSecret: "revoked-in-the-console" });

      const restarted = service();
      await restarted.syncNow();
      await restarted.idle();
      expect(await restarted.setup()).toMatchObject({
        connected: true,
        lastSyncStatus: "FAILED",
        lastSyncError: "Aura rejected the stored client id and secret. Replace the credentials.",
      });
      expect(await count("Instance")).toBe(6); // what we had is still there
      expect(await w.dump()).not.toContain("revoked-in-the-console");
    });
  });

  describe("the timer", () => {
    it("syncs again and again until stopped", async () => {
      const first = service();
      await first.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
      await first.idle();

      const timed = service({ syncIntervalMs: 40 });
      await timed.start();
      await waitUntil(async () => (await count("SyncRun")) >= 4, "several scheduled syncs");
      timed.stop();
      await timed.idle();
      const settled = await count("SyncRun");
      await new Promise((r) => setTimeout(r, 200));
      expect(await count("SyncRun")).toBe(settled);
      expect(await count("Instance")).toBe(6); // repeated syncs never duplicate anything
    });

    it("does not start a second sync while one is still running", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const gated: typeof fetch = async (url, init) => {
        if (String(url).includes("/v1/")) await gate;
        return fetch(url, init);
      };
      const first = service();
      await first.connect(MOCK_CLIENT_ID, MOCK_CLIENT_SECRET);
      await first.idle();
      const before = await count("SyncRun");

      const timed = service({ syncIntervalMs: 20, fetch: gated });
      await timed.start();
      await new Promise((r) => setTimeout(r, 200)); // many ticks pass while the first is held
      expect(await count("SyncRun")).toBe(before + 1);
      release();
      timed.stop();
      await timed.idle();
    });
  });
});
