// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
// Runs against a real Neo4j. Skipped unless NEO4J_TEST_URI is set. For example:
//   podman run -d --rm --name gwa-neo4j-test -p 7688:7687 -e NEO4J_AUTH=neo4j/gwa-test-password neo4j:2026.10-community
//   NEO4J_TEST_URI=bolt://localhost:7688 NEO4J_TEST_PASSWORD=gwa-test-password npm run test:integration -w store
// The test wipes the database first, but only if it holds nothing except this app's own labels.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { GraphQLSchema } from "graphql";
import neo4j, { type Driver } from "neo4j-driver";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildInternalSchema, buildPublicSchema } from "../src/schemas.js";
import { runSetup } from "../src/setup.js";

// See schema.test.ts: graphql must be loaded the way Node loads it, not the way Vitest would
const { graphql } = createRequire(import.meta.url)("graphql") as typeof import("graphql");

const uri = process.env.NEO4J_TEST_URI;
const suite = uri ? describe : describe.skip;

const OUR_LABELS = new Set([
  "AuraAccount", "Tenant", "InstanceConfiguration", "CloudProvider", "Tier", "Instance", "Operation", "OperationStep", "SyncRun",
  "InstanceCredential", "AuraSecret",
]);

suite("the store against a real Neo4j", () => {
  let driver: Driver;
  let publicSchema: GraphQLSchema;
  let internalSchema: GraphQLSchema;
  const database = process.env.NEO4J_TEST_DATABASE ?? "neo4j";
  const typeDefs = readFileSync(new URL("../schema/schema.graphql", import.meta.url), "utf8");
  const setupPath = new URL("../setup/constraints.cypher", import.meta.url).pathname;

  const run = async (schema: GraphQLSchema, source: string, variableValues?: Record<string, unknown>) => {
    const result = await graphql({ schema, source, variableValues, contextValue: { executionContext: driver, sessionConfig: { database } } });
    return result;
  };
  const ok = async (schema: GraphQLSchema, source: string, variableValues?: Record<string, unknown>) => {
    const result = await run(schema, source, variableValues);
    expect(result.errors?.map((e) => e.message)).toBeUndefined();
    return result.data as any;
  };

  beforeAll(async () => {
    driver = neo4j.driver(uri!, neo4j.auth.basic(process.env.NEO4J_TEST_USERNAME ?? "neo4j", process.env.NEO4J_TEST_PASSWORD ?? "neo4j"));
    await driver.verifyConnectivity({ database });
    const session = driver.session({ database });
    try {
      const labels = (await session.run("CALL db.labels() YIELD label RETURN label")).records.map((r) => r.get("label") as string);
      const foreign = labels.filter((l) => !OUR_LABELS.has(l));
      if (foreign.length > 0) throw new Error(`Refusing to wipe a database that holds other labels: ${foreign.join(", ")}`);
      await session.run("MATCH (n) DETACH DELETE n");
    } finally {
      await session.close();
    }
    await runSetup(driver, database, setupPath);
    publicSchema = await buildPublicSchema(typeDefs, driver);
    internalSchema = await buildInternalSchema(typeDefs, driver);
  });

  afterAll(async () => {
    await driver?.close();
  });

  it("runs the setup Cypher again without error and has the constraints", async () => {
    expect(await runSetup(driver, database, setupPath)).toBeGreaterThan(10);
    const session = driver.session({ database });
    try {
      const names = (await session.run("SHOW CONSTRAINTS YIELD name RETURN name")).records.map((r) => r.get("name") as string);
      expect(names).toEqual(expect.arrayContaining(["instance_aura_id", "tenant_aura_id", "instance_credential_instance", "aura_secret_account"]));
    } finally {
      await session.close();
    }
  });

  it("serves a federation SDL with Instance as an entity and no mutations", async () => {
    const data = await ok(publicSchema, "{ _service { sdl } }");
    expect(data._service.sdl).toMatch(/type Instance[^{]*@key\(fields: "auraId"\)/);
    expect(data._service.sdl).not.toMatch(/type Mutation|createOperations|updateInstances|deleteInstances/);
  });

  describe("writing through the internal schema and reading through the public one", () => {
    it("stores an account, a tenant with options, tags and an instance", async () => {
      await ok(internalSchema, `mutation { createAuraAccounts(input: [{ id: "default", label: "Acme", status: CONNECTED, clientIdHint: "a1b2....a7b8" }]) { info { nodesCreated } } }`);
      await ok(
        internalSchema,
        `mutation {
          createTenants(input: [{ auraId: "t-prod", name: "Acme Production", account: { connect: [{ where: { node: { id: { eq: "default" } } } }] } }]) { info { nodesCreated } }
          createCloudProviders(input: [{ name: "gcp" }, { name: "aws" }]) { info { nodesCreated } }
          createTiers(input: [{ type: "professional-db", label: "AuraDB Professional" }, { type: "business-critical", label: "AuraDB Business Critical" }]) { info { nodesCreated } }
        }`,
      );
      await ok(
        internalSchema,
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
        internalSchema,
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
        publicSchema,
        `{ instances(where: { auraId: { eq: "i1" } }) { name statusGroup tenant { name } cloud { name } tier { label } hasStoredPassword } }`,
      );
      expect(data.instances).toEqual([
        { name: "orders-prod", statusGroup: "READY", tenant: [{ name: "Acme Production" }], cloud: [{ name: "gcp" }], tier: [{ label: "AuraDB Professional" }], hasStoredPassword: false },
      ]);
    });

    it("counts each tag's instances, which is what the gallery chips show", async () => {
      const data = await ok(
        publicSchema,
        `{ cloudProviders(sort: [{ name: ASC }]) { name instancesConnection { totalCount } }
           tiers(sort: [{ type: ASC }]) { label instancesConnection { totalCount } } }`,
      );
      expect(data.cloudProviders.map((c: any) => [c.name, c.instancesConnection.totalCount])).toEqual([["aws", 1], ["gcp", 2]]);
      expect(data.tiers.map((t: any) => [t.label, t.instancesConnection.totalCount])).toEqual([["AuraDB Business Critical", 1], ["AuraDB Professional", 2]]);
    });

    it("counts a tag as if its own filter were off, by filtering on the other facets only", async () => {
      // With only the READY filter applied, how many READY instances does each cloud have?
      const data = await ok(
        publicSchema,
        `{ cloudProviders(sort: [{ name: ASC }]) { name instancesConnection(where: { node: { statusGroup: { eq: READY } } }) { totalCount } } }`,
      );
      expect(data.cloudProviders.map((c: any) => [c.name, c.instancesConnection.totalCount])).toEqual([["aws", 1], ["gcp", 1]]);
    });

    it("resolves an Instance from a federation reference", async () => {
      const data = await ok(publicSchema, `{ _entities(representations: [{ __typename: "Instance", auraId: "i2" }]) { ... on Instance { name tier { type } } } }`);
      expect(data._entities).toEqual([{ name: "analytics-gds", tier: [{ type: "business-critical" }] }]);
    });
  });

  describe("secrets", () => {
    it("reports metadata about a stored password and never the password", async () => {
      const session = driver.session({ database });
      try {
        await session.run(
          `MATCH (i:Instance {auraId: "i1"})
           CREATE (i)-[:HAS_CREDENTIAL]->(:InstanceCredential {instanceAuraId: "i1", username: "neo4j", passwordCipher: "CIPHERTEXT-SENTINEL", nonce: "NONCE-SENTINEL", keyVersion: 1, revealCount: 2})`,
        );
      } finally {
        await session.close();
      }
      const data = await ok(publicSchema, `{ instances(where: { auraId: { eq: "i1" } }) { hasStoredPassword credentialUsername passwordRevealCount } }`);
      expect(data.instances).toEqual([{ hasStoredPassword: true, credentialUsername: "neo4j", passwordRevealCount: 2 }]);
      const none = await ok(publicSchema, `{ instances(where: { auraId: { eq: "i2" } }) { hasStoredPassword credentialUsername passwordRevealCount } }`);
      expect(none.instances).toEqual([{ hasStoredPassword: false, credentialUsername: null, passwordRevealCount: 0 }]);
    });

    it("cannot select the cipher, the nonce or a password through either schema", async () => {
      for (const schema of [publicSchema, internalSchema]) {
        const result = await run(schema, `{ instances { passwordCipher } }`);
        expect(result.errors?.[0]?.message).toMatch(/Cannot query field/);
      }
    });

    it("never returns the sentinel values in any broad query", async () => {
      const everything = await ok(
        internalSchema,
        `{ instances { auraId name status statusGroup connectionUrl region memory storage version hasStoredPassword credentialUsername passwordRevealCount tenant { name } cloud { name } tier { label } } }`,
      );
      expect(JSON.stringify(everything)).not.toMatch(/SENTINEL/);
    });
  });

  describe("the public schema cannot change anything", () => {
    it("rejects a mutation", async () => {
      const result = await run(publicSchema, `mutation { createInstances(input: [{ auraId: "x", name: "x", status: "running", statusGroup: READY }]) { instances { auraId } } }`);
      expect(result.errors?.[0]?.message).toMatch(/not configured to execute mutation/);
      const session = driver.session({ database });
      try {
        const count = (await session.run(`MATCH (i:Instance {auraId: "x"}) RETURN count(i) AS n`)).records[0]!.get("n");
        expect(Number(count)).toBe(0);
      } finally {
        await session.close();
      }
    });
  });

  describe("operations", () => {
    it("plans an operation with a generated id, targeting an instance, with steps", async () => {
      const data = await ok(
        internalSchema,
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
      const read = await ok(publicSchema, `{ operations(where: { status: { eq: PLANNED } }) { kind requestedBy target { name } } }`);
      expect(read.operations).toEqual([{ kind: "UPDATE", requestedBy: "admin", target: [{ name: "orders-prod" }] }]);
    });
  });
});
