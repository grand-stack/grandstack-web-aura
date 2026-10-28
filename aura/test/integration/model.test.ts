// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
// The aura model on the real grandstack-server, against a real Neo4j: one server that can write and one that can only read, as in the
// compose stack. Skipped unless NEO4J_TEST_URI is set (see docs/testing.md).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationEnabled, startWorld, type World } from "./world.js";

const suite = integrationEnabled ? describe : describe.skip;

type Target = "public" | "internal";

suite("the aura model on the real server", () => {
  let w: World;
  beforeAll(async () => {
    w = await startWorld();
    await w.wipe();
  });
  afterAll(() => w?.close());

  const run = async (target: Target, source: string, variables?: Record<string, unknown>) => {
    const res = await fetch(target === "public" ? w.publicUrl : w.writerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: source, variables }),
    });
    return (await res.json()) as { data?: any; errors?: { message: string }[] };
  };
  const ok = async (target: Target, source: string, variables?: Record<string, unknown>) => {
    const result = await run(target, source, variables);
    expect(result.errors?.map((e) => e.message)).toBeUndefined();
    return result.data as any;
  };

  it("has the constraints, from the model's setup Cypher", async () => {
    const names = (await w.cypher("SHOW CONSTRAINTS YIELD name RETURN name")).map((r) => r.name as string);
    expect(names).toEqual(expect.arrayContaining(["instance_aura_id", "tenant_aura_id", "instance_credential_instance", "aura_secret_account"]));
  });

  it("starts empty: the model has no seed, and no movie data is loaded", async () => {
    expect(Number((await w.cypher("MATCH (m:Movie) RETURN count(m) AS n"))[0]!.n)).toBe(0);
  });

  it("serves a federation SDL with Instance as an entity, and the read-only server has no mutations", async () => {
    const data = await ok("public", "{ _service { sdl } }");
    expect(data._service.sdl).toMatch(/type Instance[^{]*@key\(fields: "auraId"\)/);
    expect(data._service.sdl).not.toMatch(/type Mutation|createOperations|updateInstances|deleteInstances/);
  });

  describe("writing through the writable server and reading through the read-only one", () => {
    it("stores an account, a tenant with options, tags and an instance", async () => {
      await ok("internal", `mutation { createAuraAccounts(input: [{ id: "default", label: "Acme", status: CONNECTED, clientIdHint: "a1b2....a7b8" }]) { info { nodesCreated } } }`);
      await ok(
        "internal",
        `mutation {
          createTenants(input: [{ auraId: "t-prod", name: "Acme Production", account: { connect: [{ where: { node: { id: { eq: "default" } } } }] } }]) { info { nodesCreated } }
          createCloudProviders(input: [{ name: "gcp" }, { name: "aws" }]) { info { nodesCreated } }
          createTiers(input: [{ type: "professional-db", label: "AuraDB Professional" }, { type: "business-critical", label: "AuraDB Business Critical" }]) { info { nodesCreated } }
        }`,
      );
      await ok(
        "internal",
        `mutation {
          createInstanceConfigurations(input: [
            { key: "k1", cloudProvider: "gcp", region: "europe-west1", regionName: "Belgium (europe-west1)", type: "professional-db", memory: "8GB", storage: "16GB", version: "5",
              tenant: { connect: [{ where: { node: { auraId: { eq: "t-prod" } } } }] } }
          ]) { info { nodesCreated } }
        }`,
      );
      const instance = (id: string, name: string, status: string, group: string, cloud: string, tier: string) => `{
        auraId: "${id}", name: "${name}", status: "${status}", statusGroup: ${group}, region: "europe-west1", memory: "8GB", storage: "16GB", version: "5",
        connectionUrl: "neo4j+s://${id}.databases.neo4j.io",
        tenant: { connect: [{ where: { node: { auraId: { eq: "t-prod" } } } }] },
        cloud: { connect: [{ where: { node: { name: { eq: "${cloud}" } } } }] },
        tier: { connect: [{ where: { node: { type: { eq: "${tier}" } } } }] } }`;
      const created = await ok(
        "internal",
        `mutation { createInstances(input: [
          ${instance("i1", "orders-prod", "running", "READY", "gcp", "professional-db")},
          ${instance("i2", "analytics-gds", "running", "READY", "aws", "business-critical")},
          ${instance("i3", "recs-staging", "updating", "IN_PROGRESS", "gcp", "professional-db")}
        ]) { instances { auraId } } }`,
      );
      expect(created.createInstances.instances).toHaveLength(3);
    });

    it("lets the gallery read an instance with its tenant, cloud and tier", async () => {
      const data = await ok(
        "public",
        `{ instances(where: { auraId: { eq: "i1" } }) { name statusGroup tenant { name } cloud { name } tier { label } hasStoredPassword } }`,
      );
      expect(data.instances).toEqual([
        { name: "orders-prod", statusGroup: "READY", tenant: [{ name: "Acme Production" }], cloud: [{ name: "gcp" }], tier: [{ label: "AuraDB Professional" }], hasStoredPassword: false },
      ]);
    });

    it("counts each tag's instances, which is what the gallery chips show", async () => {
      const data = await ok(
        "public",
        `{ cloudProviders(sort: [{ name: ASC }]) { name instancesConnection { totalCount } }
           tiers(sort: [{ type: ASC }]) { label instancesConnection { totalCount } } }`,
      );
      expect(data.cloudProviders.map((c: any) => [c.name, c.instancesConnection.totalCount])).toEqual([["aws", 1], ["gcp", 2]]);
      expect(data.tiers.map((t: any) => [t.label, t.instancesConnection.totalCount])).toEqual([["AuraDB Business Critical", 1], ["AuraDB Professional", 2]]);
    });

    it("counts a tag as if its own filter were off, by filtering on the other facets only", async () => {
      // With only the READY filter applied, how many READY instances does each cloud have?
      const data = await ok(
        "public",
        `{ cloudProviders(sort: [{ name: ASC }]) { name instancesConnection(where: { node: { statusGroup: { eq: READY } } }) { totalCount } } }`,
      );
      expect(data.cloudProviders.map((c: any) => [c.name, c.instancesConnection.totalCount])).toEqual([["aws", 1], ["gcp", 1]]);
    });

    it("resolves an Instance from a federation reference", async () => {
      const data = await ok("public", `{ _entities(representations: [{ __typename: "Instance", auraId: "i2" }]) { ... on Instance { name tier { type } } } }`);
      expect(data._entities).toEqual([{ name: "analytics-gds", tier: [{ type: "business-critical" }] }]);
    });
  });

  describe("secrets", () => {
    it("reports metadata about a stored password and never the password", async () => {
      await w.cypher(
        `MATCH (i:Instance {auraId: "i1"})
         CREATE (i)-[:HAS_CREDENTIAL]->(:InstanceCredential {instanceAuraId: "i1", username: "neo4j", passwordCipher: "CIPHERTEXT-SENTINEL", nonce: "NONCE-SENTINEL", keyVersion: 1, revealCount: 2})`,
      );
      const data = await ok("public", `{ instances(where: { auraId: { eq: "i1" } }) { hasStoredPassword credentialUsername passwordRevealCount } }`);
      expect(data.instances).toEqual([{ hasStoredPassword: true, credentialUsername: "neo4j", passwordRevealCount: 2 }]);
      const none = await ok("public", `{ instances(where: { auraId: { eq: "i2" } }) { hasStoredPassword credentialUsername passwordRevealCount } }`);
      expect(none.instances).toEqual([{ hasStoredPassword: false, credentialUsername: null, passwordRevealCount: 0 }]);
    });

    it("cannot select the cipher, the nonce or a password through either server", async () => {
      for (const target of ["public", "internal"] as const) {
        const result = await run(target, `{ instances { passwordCipher } }`);
        expect(result.errors?.[0]?.message).toMatch(/Cannot query field/);
      }
    });

    it("never returns the sentinel values in any broad query", async () => {
      const everything = await ok(
        "internal",
        `{ instances { auraId name status statusGroup connectionUrl region memory storage version hasStoredPassword credentialUsername passwordRevealCount tenant { name } cloud { name } tier { label } } }`,
      );
      expect(JSON.stringify(everything)).not.toMatch(/SENTINEL/);
    });
  });

  describe("the read-only server cannot change anything", () => {
    it("rejects a mutation", async () => {
      const result = await run("public", `mutation { createInstances(input: [{ auraId: "x", name: "x", status: "running", statusGroup: READY }]) { instances { auraId } } }`);
      expect(result.errors?.[0]?.message).toMatch(/not configured to execute mutation/);
      expect(Number((await w.cypher(`MATCH (i:Instance {auraId: "x"}) RETURN count(i) AS n`))[0]!.n)).toBe(0);
    });
  });

  describe("operations", () => {
    it("plans an operation with a generated id, targeting an instance, with steps", async () => {
      const data = await ok(
        "internal",
        `mutation { createOperations(input: [{
            kind: UPDATE, status: PLANNED, requestedBy: "admin", createdAt: "2026-10-28T09:00:00Z", updatedAt: "2026-10-28T09:00:00Z",
            desired: "{\\"memory\\":\\"16GB\\",\\"storage\\":\\"32GB\\"}",
            target: { connect: [{ where: { node: { auraId: { eq: "i1" } } } }] },
            steps: { create: [{ node: { seq: 1, label: "Plan reviewed", status: DONE } }, { node: { seq: 2, label: "Request sent to Aura", status: PENDING } }] }
          }]) { operations { id kind status createdAt updatedAt target { name } steps { seq label status } } } }`,
      );
      const op = data.createOperations.operations[0];
      expect(op.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(op.createdAt).toBe("2026-10-28T09:00:00Z");
      expect(op.target).toEqual([{ name: "orders-prod" }]);
      expect(op.steps.map((s: any) => s.seq).sort()).toEqual([1, 2]);

      // And the review screen can read it back through the public schema
      const read = await ok("public", `{ operations(where: { status: { eq: PLANNED } }) { kind requestedBy target { name } } }`);
      expect(read.operations).toEqual([{ kind: "UPDATE", requestedBy: "admin", target: [{ name: "orders-prod" }] }]);
    });
  });
});
