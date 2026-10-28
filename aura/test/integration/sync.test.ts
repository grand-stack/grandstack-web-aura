// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuraClient } from "../../src/client.js";
import { startSync } from "../../src/sync.js";
import { MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, integrationEnabled, startWorld, type World } from "./world.js";

const suite = integrationEnabled ? describe : describe.skip;

const INSTANCES = `{ instances(sort: [{ name: ASC }]) {
  auraId name status statusGroup connectionUrl region memory storage vectorOptimized deletedInAuraAt createdAt syncedAt
  tenant { name } cloud { name } tier { type label } } }`;

suite("syncing Aura into the store", () => {
  let w: World;
  beforeAll(async () => {
    w = await startWorld();
  });
  afterAll(() => w?.close());
  beforeEach(async () => {
    w.mock.reset();
    await w.wipe();
    // The sync links tenants to the account, so the account has to exist first (connecting creates it)
    await w.store.request(`mutation { createAuraAccounts(input: [{ id: "default", label: "Aura account", status: CONNECTED }]) { info { nodesCreated } } }`);
  });

  const client = (fetchImpl?: typeof fetch, baseUrl = w.mockBase, clientSecret = MOCK_CLIENT_SECRET) =>
    new AuraClient({ baseUrl, fetch: fetchImpl, sleep: async () => {}, credentials: async () => ({ clientId: MOCK_CLIENT_ID, clientSecret }) });
  const sync = async (aura = client(), at?: string) => (await startSync({ aura, store: w.store, accountId: "default", now: at ? () => new Date(at) : undefined })).done;
  const counts = async () => Object.fromEntries((await w.cypher("MATCH (n) RETURN labels(n)[0] AS label, count(n) AS n ORDER BY label")).map((r) => [r.label, Number(r.n)]));
  const relationshipCount = async (type: string) => Number((await w.cypher(`MATCH ()-[r:${type}]->() RETURN count(r) AS n`))[0]!.n);
  const instances = async () => (await w.read(INSTANCES)).instances as any[];
  const waitFor = async (id: string, status: string) => {
    for (let i = 0; i < 100; i++) {
      if (w.mock.state.instances.get(id)?.status === status || (status === "gone" && !w.mock.state.instances.has(id))) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`${id} never reached ${status}`);
  };
  const aura = (method: string, path: string, body?: unknown) =>
    w.mock.server.listening
      ? (async () => {
          const t = await (await fetch(`${w.mockBase}/oauth/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${MOCK_CLIENT_ID}:${MOCK_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" })).json();
          return fetch(`${w.mockBase}/v1${path}`, { method, headers: { Authorization: `Bearer ${t.access_token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
        })()
      : Promise.reject(new Error("mock not listening"));

  describe("the first sync", () => {
    it("fills the store with the tenants, their options, the instances and the tags", async () => {
      const result = await sync();
      expect(result).toMatchObject({ status: "SUCCEEDED", tenants: 3, instances: 6, configurations: 48, vanished: 0, markedDeleted: 0 });
      expect(result.error).toBeUndefined();

      const tenants = (await w.read(`{ tenants(sort: [{ name: ASC }]) { name configsSyncedAt account { id } configurationsConnection { totalCount } instancesConnection { totalCount } } }`)).tenants;
      expect(tenants.map((t: any) => [t.name, t.configurationsConnection.totalCount, t.instancesConnection.totalCount])).toEqual([
        ["Acme Labs", 8, 1],
        ["Acme Production", 24, 3],
        ["Acme Staging", 16, 2],
      ]);
      for (const t of tenants) {
        expect(t.account).toEqual([{ id: "default" }]);
        expect(t.configsSyncedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      }

      const tags = await w.read(`{ cloudProviders(sort: [{ name: ASC }]) { name instancesConnection { totalCount } } tiers(sort: [{ type: ASC }]) { type label instancesConnection { totalCount } } }`);
      expect(tags.cloudProviders.map((c: any) => [c.name, c.instancesConnection.totalCount])).toEqual([["aws", 2], ["azure", 1], ["gcp", 3]]);
      expect(tags.tiers.map((t: any) => [t.label, t.instancesConnection.totalCount])).toEqual([["AuraDB Business Critical", 1], ["AuraDB Professional", 5]]);
    });

    it("stores each instance as Aura reports it, with its status group, tenant and tags", async () => {
      await sync();
      const list = await instances();
      expect(list.map((i) => i.name)).toEqual(["analytics-gds", "billing-staging", "dev-sandbox", "orders-prod", "recs-staging", "search-prod"]);
      const orders = list.find((i) => i.name === "orders-prod");
      expect(orders).toMatchObject({
        auraId: "a1b2c3d4",
        status: "running",
        statusGroup: "READY",
        connectionUrl: "neo4j+s://a1b2c3d4.databases.neo4j.io",
        region: "europe-west1",
        memory: "8GB",
        storage: "16GB",
        vectorOptimized: false,
        deletedInAuraAt: null,
        createdAt: "2026-03-12T09:03:00Z",
        tenant: [{ name: "Acme Production" }],
        cloud: [{ name: "gcp" }],
        tier: [{ type: "professional-db", label: "AuraDB Professional" }],
      });
      expect(orders.syncedAt).toMatch(/Z$/);
      expect(list.find((i) => i.name === "dev-sandbox")).toMatchObject({ status: "paused", statusGroup: "STOPPED", cloud: [{ name: "azure" }] });
    });

    it("stores every option with the fields the create form needs", async () => {
      await sync();
      const options = (await w.read(`{ instanceConfigurations(where: { cloudProvider: { eq: "aws" }, type: { eq: "business-critical" } }, sort: [{ memory: ASC }]) { cloudProvider region regionName type memory storage version tenant { name } } }`)).instanceConfigurations;
      expect(options).toHaveLength(4);
      expect(options[0]).toMatchObject({ cloudProvider: "aws", region: "eu-west-1", regionName: "Ireland (eu-west-1)", type: "business-critical", version: "5", tenant: [{ name: "Acme Production" }] });
      expect(options.map((o: any) => [o.memory, o.storage]).sort()).toEqual([["16GB", "32GB"], ["32GB", "64GB"], ["64GB", "128GB"], ["8GB", "16GB"]]);
    });

    it("records the run, with what it read and how many requests it took", async () => {
      const result = await sync();
      const run = (await w.read(`{ syncRuns { id status tenants instances configurations requests retries startedAt finishedAt error } }`)).syncRuns[0];
      expect(run).toMatchObject({ id: result.runId, status: "SUCCEEDED", tenants: 3, instances: 6, configurations: 48, retries: 0, error: null });
      // one token, the tenant list, three tenant details, the instance list, six instance details
      expect(run.requests).toBe(12);
      expect(run.startedAt <= run.finishedAt).toBe(true);
      const account = (await w.read(`{ auraAccounts { id lastSyncAt } }`)).auraAccounts[0];
      expect(account.lastSyncAt).toMatch(/Z$/);
    });
  });

  describe("syncing again", () => {
    it("changes nothing when nothing changed: no duplicates, same counts", async () => {
      await sync();
      const before = await counts();
      const result = await sync();
      expect(result).toMatchObject({ status: "SUCCEEDED", tenants: 3, instances: 6, configurations: 48 });
      const after = await counts();
      expect({ ...after, SyncRun: 0 }).toEqual({ ...before, SyncRun: 0 });
      expect(after.SyncRun).toBe(2);
    });

    it("picks up a rename, a resize and a pause made in Aura", async () => {
      await sync();
      expect((await aura("PATCH", "/instances/c3d4e5f6", { name: "search-v2" })).status).toBe(200);
      expect((await aura("PATCH", "/instances/d4e5f6a7", { memory: "8GB", storage: "16GB" })).status).toBe(202);
      expect((await aura("POST", "/instances/a1b2c3d4/pause", {})).status).toBe(202);
      await waitFor("d4e5f6a7", "running");
      await waitFor("a1b2c3d4", "paused");
      await sync();
      const list = await instances();
      expect(list.find((i) => i.auraId === "c3d4e5f6")).toMatchObject({ name: "search-v2" });
      expect(list.find((i) => i.auraId === "d4e5f6a7")).toMatchObject({ memory: "8GB", storage: "16GB", statusGroup: "READY" });
      expect(list.find((i) => i.auraId === "a1b2c3d4")).toMatchObject({ status: "paused", statusGroup: "STOPPED" });
    });

    it("sees an instance that is still changing as in progress", async () => {
      await sync();
      w.mock.state.instances.get("d4e5f6a7")!.status = "updating"; // set directly: a real change would finish before we looked
      await sync();
      expect((await instances()).find((i) => i.auraId === "d4e5f6a7")).toMatchObject({ status: "updating", statusGroup: "IN_PROGRESS" });
    });

    it("adds an instance created in Aura", async () => {
      await sync();
      // Arranged directly, so it is still "creating" when we sync (a real create would finish in minutes, the mock's in milliseconds)
      w.mock.state.instances.set("f00dcafe", {
        ...w.mock.state.instances.get("a1b2c3d4")!,
        id: "f00dcafe", name: "brand-new", status: "creating", connection_url: "neo4j+s://f00dcafe.databases.neo4j.io",
      });
      await sync();
      const added = (await instances()).find((i) => i.name === "brand-new");
      expect(added).toMatchObject({ auraId: "f00dcafe", status: "creating", statusGroup: "IN_PROGRESS", tenant: [{ name: "Acme Production" }], cloud: [{ name: "gcp" }] });
      expect((await w.read(`{ cloudProviders(where: { name: { eq: "gcp" } }) { instancesConnection { totalCount } } }`)).cloudProviders[0].instancesConnection.totalCount).toBe(4);
    });

    it("keeps an instance that is gone from Aura, marked deleted, and does not mark it again", async () => {
      await sync(client(), "2026-10-28T10:00:00.000Z");
      expect((await aura("DELETE", "/instances/e5f6a7b8")).status).toBe(202); // dev-sandbox, paused
      await waitFor("e5f6a7b8", "gone");

      const first = await sync(client(), "2026-10-28T11:00:00.000Z");
      expect(first).toMatchObject({ status: "SUCCEEDED", instances: 5, markedDeleted: 1 });
      const gone = (await instances()).find((i) => i.auraId === "e5f6a7b8");
      expect(gone).toMatchObject({ name: "dev-sandbox", deletedInAuraAt: "2026-10-28T11:00:00.000Z", tenant: [{ name: "Acme Labs" }] });
      expect((await instances()).filter((i) => i.deletedInAuraAt === null)).toHaveLength(5);

      const second = await sync(client(), "2026-10-28T12:00:00.000Z");
      expect(second.markedDeleted).toBe(0);
      expect((await instances()).find((i) => i.auraId === "e5f6a7b8")!.deletedInAuraAt).toBe("2026-10-28T11:00:00.000Z");
    });

    it("moves the tier tag when Aura reports a different type", async () => {
      await sync();
      w.mock.state.instances.get("d4e5f6a7")!.type = "business-critical";
      const result = await sync();
      expect(result.status).toBe("SUCCEEDED");
      const moved = (await instances()).find((i) => i.auraId === "d4e5f6a7");
      expect(moved.tier).toEqual([{ type: "business-critical", label: "AuraDB Business Critical" }]);
      const tiers = (await w.read(`{ tiers(sort: [{ type: ASC }]) { type instancesConnection { totalCount } } }`)).tiers;
      expect(tiers.map((t: any) => [t.type, t.instancesConnection.totalCount])).toEqual([["business-critical", 2], ["professional-db", 4]]);
      expect(await relationshipCount("HAS_TIER")).toBe(6); // exactly one tier link per instance, none doubled
    });

    it("never doubles a link, however many times it syncs", async () => {
      await sync();
      await sync();
      await sync();
      expect(await relationshipCount("HAS_TIER")).toBe(6);
      expect(await relationshipCount("ON_CLOUD")).toBe(6);
      expect(await relationshipCount("HAS_INSTANCE")).toBe(6);
      expect(await relationshipCount("OFFERS")).toBe(48);
      expect(await relationshipCount("HAS_TENANT")).toBe(3);
    });

    it("moves the cloud tag when Aura reports a different provider", async () => {
      await sync();
      w.mock.state.instances.get("d4e5f6a7")!.cloud_provider = "gcp";
      expect((await sync()).status).toBe("SUCCEEDED");
      expect((await instances()).find((i) => i.auraId === "d4e5f6a7")!.cloud).toEqual([{ name: "gcp" }]);
      const clouds = (await w.read(`{ cloudProviders(sort: [{ name: ASC }]) { name instancesConnection { totalCount } } }`)).cloudProviders;
      expect(clouds.map((c: any) => [c.name, c.instancesConnection.totalCount])).toEqual([["aws", 1], ["azure", 1], ["gcp", 4]]);
    });

    it("removes an option Aura stopped offering and adds a new one", async () => {
      await sync();
      const labs = w.mock.state.tenants.find((t) => t.name === "Acme Labs")!;
      const removed = labs.instance_configurations.pop()!;
      labs.instance_configurations.push({ ...removed, memory: "64GB", storage: "128GB" });
      labs.instance_configurations.shift();
      const result = await sync();
      expect(result.configurations).toBe(48 - 1);
      const options = (await w.read(`{ instanceConfigurations(where: { tenant: { some: { name: { eq: "Acme Labs" } } } }) { memory } }`)).instanceConfigurations;
      expect(options).toHaveLength(7);
      expect(options.map((o: any) => o.memory)).toContain("64GB");
    });
  });

  describe("when things go wrong", () => {
    it("carries on when an instance vanishes between the list and its details", async () => {
      const target = "a1b2c3d4";
      const missing: typeof fetch = async (url, init) =>
        String(url).endsWith(`/v1/instances/${target}`)
          ? new Response(JSON.stringify({ errors: [{ message: `DB not found: ${target}`, reason: "db-not-found" }] }), { status: 404, headers: { "Content-Type": "application/json" } })
          : fetch(url, init);
      const result = await sync(client(missing));
      expect(result).toMatchObject({ status: "SUCCEEDED", vanished: 1, instances: 5 });
      expect((await instances()).map((i) => i.auraId)).not.toContain(target);
    });

    it("finishes as SLOWED when Aura asked it to wait, with every instance still stored", async () => {
      let refused = false;
      const once429: typeof fetch = async (url, init) => {
        if (!refused && String(url).endsWith("/v1/instances")) {
          refused = true;
          return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "1" } });
        }
        return fetch(url, init);
      };
      const result = await sync(client(once429));
      expect(result).toMatchObject({ status: "SLOWED", instances: 6 });
      expect(result.retries).toBeGreaterThanOrEqual(1);
      expect((await w.read(`{ syncRuns { status retries } }`)).syncRuns[0]).toMatchObject({ status: "SLOWED" });
      expect(await instances()).toHaveLength(6);
    });

    it("fails with a plain message, and keeps what it already had, when Aura cannot be reached", async () => {
      await sync(client(), "2026-10-28T10:00:00.000Z");
      const lastGood = (await w.read(`{ auraAccounts { lastSyncAt } }`)).auraAccounts[0].lastSyncAt;
      expect(lastGood).toBe("2026-10-28T10:00:00.000Z");
      const before = await counts();
      const result = await sync(client(undefined, "http://127.0.0.1:1"), "2026-10-28T11:00:00.000Z");
      expect(result.status).toBe("FAILED");
      expect(result.error).toBe("Could not reach Aura. Try again in a moment.");
      expect(await counts()).toEqual({ ...before, SyncRun: before.SyncRun! + 1 });
      expect((await w.read(`{ syncRuns(sort: [{ startedAt: DESC }], limit: 1) { status error finishedAt } }`)).syncRuns[0]).toMatchObject({ status: "FAILED", error: "Could not reach Aura. Try again in a moment." });
      // a failed run does not claim a successful sync: the time of the last good one is unchanged
      expect((await w.read(`{ auraAccounts { lastSyncAt } }`)).auraAccounts[0].lastSyncAt).toBe(lastGood);
    });

    it("fails and says to replace the credentials when Aura rejects the stored ones", async () => {
      const result = await sync(client(undefined, w.mockBase, "a-revoked-secret"));
      expect(result.status).toBe("FAILED");
      expect(result.error).toBe("Aura rejected the stored client id and secret. Replace the credentials.");
      expect(result.error).not.toContain("a-revoked-secret");
      expect(await instances()).toEqual([]);
    });

    it("fails without a trace of a secret in the run's error", async () => {
      const result = await sync(client(undefined, w.mockBase, "a-revoked-secret"));
      expect(await w.dump()).not.toContain("a-revoked-secret");
      expect(JSON.stringify(result)).not.toContain("a-revoked-secret");
    });
  });
});
