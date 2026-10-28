// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Kind, parse, type GraphQLObjectType, type GraphQLSchema, type ObjectTypeDefinitionNode } from "graphql";
import { beforeAll, describe, expect, it } from "vitest";
import { buildInternalSchema, buildPublicSchema, nodeTypeNames, publicTypeDefs } from "../src/schemas.js";
import { parseStatements } from "../src/setup.js";

// graphql 16 ships a CommonJS and an ESM build. Plain Node loads the CommonJS one, as @neo4j/graphql does, but Vitest would load
// the ESM one and graphql would then reject the schema as coming from "another module". Loading it with require avoids that.
const { printSchema } = createRequire(import.meta.url)("graphql") as typeof import("graphql");

const typeDefs = readFileSync(new URL("../schema/schema.graphql", import.meta.url), "utf8");
const constraints = readFileSync(new URL("../setup/constraints.cypher", import.meta.url), "utf8");

let publicSchema: GraphQLSchema;
let internalSchema: GraphQLSchema;
beforeAll(async () => {
  publicSchema = await buildPublicSchema(typeDefs);
  internalSchema = await buildInternalSchema(typeDefs);
});

const fields = (schema: GraphQLSchema, type: string) => Object.keys((schema.getType(type) as GraphQLObjectType).getFields());

describe("the types", () => {
  it("defines the node types the plan lists", () => {
    expect(nodeTypeNames(typeDefs).sort()).toEqual(
      ["AuraAccount", "CloudProvider", "Instance", "InstanceConfiguration", "Operation", "OperationStep", "SyncRun", "Tenant", "Tier"].sort(),
    );
  });

  it("gives every type and every declared field a description", () => {
    // Only fields written in schema.graphql: the library adds its own ...Connection fields and operations
    const declared = parse(typeDefs).definitions.filter((d): d is ObjectTypeDefinitionNode => d.kind === Kind.OBJECT_TYPE_DEFINITION);
    const missing: string[] = [];
    for (const def of declared) {
      const type = internalSchema.getType(def.name.value) as GraphQLObjectType;
      if (!type.description) missing.push(def.name.value);
      for (const field of def.fields ?? []) if (!type.getFields()[field.name.value]?.description) missing.push(`${def.name.value}.${field.name.value}`);
    }
    expect(missing).toEqual([]);
  });

  it("makes Instance a federation entity keyed on auraId, so the aura subgraph can extend it", () => {
    const sdl = printSchema(publicSchema);
    expect(sdl).toContain("union _Entity");
    expect(sdl).toMatch(/_Entity\s*=[^\n]*Instance/);
  });
});

describe("secrets stay out of GraphQL", () => {
  it("has no password, secret or cipher field on any type, and no credential type", () => {
    for (const schema of [publicSchema, internalSchema]) {
      const sdl = printSchema(schema);
      expect(sdl).not.toMatch(/InstanceCredential|AuraSecret/);
      const names = Object.values(schema.getTypeMap())
        .filter((t): t is GraphQLObjectType => "getFields" in t && !t.name.startsWith("__"))
        .flatMap((t) => Object.keys((t as GraphQLObjectType).getFields()));
      // hasStoredPassword (and its filters) and passwordRevealCount are the intended metadata; anything else is a leak
      expect(names.filter((n) => /password|secret|cipher|nonce/i.test(n) && !/^(hasStoredPassword|passwordRevealCount)/.test(n))).toEqual([]);
    }
  });

  it("exposes only metadata about the stored password", () => {
    expect(fields(publicSchema, "Instance")).toEqual(expect.arrayContaining(["hasStoredPassword", "credentialUsername", "passwordRevealCount"]));
  });
});

describe("the public schema is read-only", () => {
  it("has no Mutation type and no create, update or delete operations", () => {
    expect(publicSchema.getMutationType()).toBeUndefined();
    expect(printSchema(publicSchema)).not.toMatch(/\b(create|update|delete)(Instances|Operations|Tenants|SyncRuns)\b/);
  });

  // The federation SDL (_service { sdl }) is what the gateway composes from. Querying it needs a database connection,
  // so it is checked in integration.test.ts instead.

  it("still serves the queries the gallery needs", () => {
    const query = fields(publicSchema, "Query");
    expect(query).toEqual(expect.arrayContaining(["instances", "tenants", "instanceConfigurations", "cloudProviders", "tiers", "operations", "syncRuns", "auraAccounts"]));
    expect(query).toEqual(expect.arrayContaining(["instancesConnection", "cloudProvidersConnection", "tiersConnection"]));
  });

  it("adds the extension only to node types", () => {
    const extra = publicTypeDefs(typeDefs).slice(typeDefs.length);
    expect(extra.match(/extend type/g)).toHaveLength(nodeTypeNames(typeDefs).length);
  });
});

describe("the internal schema can change things", () => {
  it("has the create, update and delete mutations the aura subgraph needs", () => {
    const mutation = fields(internalSchema, "Mutation");
    expect(mutation).toEqual(
      expect.arrayContaining([
        "createInstances", "updateInstances", "deleteInstances",
        "createOperations", "updateOperations",
        "createOperationSteps", "createSyncRuns", "updateSyncRuns",
        "createInstanceConfigurations", "deleteInstanceConfigurations",
        "createTenants", "updateTenants", "createAuraAccounts", "updateAuraAccounts",
        "createCloudProviders", "createTiers",
      ]),
    );
  });
});

describe("the setup Cypher", () => {
  const statements = parseStatements(constraints);

  it("parses to separate idempotent statements", () => {
    expect(statements.length).toBeGreaterThan(10);
    for (const s of statements) expect(s).toMatch(/^CREATE (CONSTRAINT|INDEX) \w+ IF NOT EXISTS /);
  });

  it("has a uniqueness constraint for every node's natural key", () => {
    const joined = statements.join("\n");
    for (const [label, key] of [
      ["AuraAccount", "id"], ["Tenant", "auraId"], ["Instance", "auraId"], ["InstanceConfiguration", "key"],
      ["CloudProvider", "name"], ["Tier", "type"], ["Operation", "id"], ["SyncRun", "id"],
      ["InstanceCredential", "instanceAuraId"], ["AuraSecret", "accountId"],
    ]) {
      expect(joined, `${label}.${key}`).toMatch(new RegExp(`FOR \\(n:${label}\\) REQUIRE n\\.${key} IS UNIQUE`));
    }
  });
});
