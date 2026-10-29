// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
// Checks of the graph model that grandstack-server loads with MODEL=aura (models/aura). No database or server is needed.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Neo4jGraphQL } from "@neo4j/graphql";
import { Kind, parse, type GraphQLObjectType, type GraphQLSchema, type ObjectTypeDefinitionNode } from "graphql";
import { beforeAll, describe, expect, it } from "vitest";

// graphql 16 ships a CommonJS and an ESM build. Plain Node loads the CommonJS one, as @neo4j/graphql does, but Vitest would load
// the ESM one and graphql would then reject the schema as coming from "another module". Loading it with require avoids that.
const { printSchema } = createRequire(import.meta.url)("graphql") as typeof import("graphql");

const typeDefs = readFileSync(new URL("../../models/aura/schema.graphql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../../models/aura/setup.cypher", import.meta.url), "utf8");
const modelJson = JSON.parse(readFileSync(new URL("../../models/aura/model.json", import.meta.url), "utf8")) as Record<string, unknown>;

const nodeTypeNames = (text: string): string[] =>
  parse(text)
    .definitions.filter((d): d is ObjectTypeDefinitionNode => d.kind === Kind.OBJECT_TYPE_DEFINITION && (d.directives ?? []).some((x) => x.name.value === "node"))
    .map((d) => d.name.value);

let schema: GraphQLSchema;
beforeAll(async () => {
  // As the server builds it with FEDERATION=true
  schema = await new Neo4jGraphQL({ typeDefs }).getSubgraphSchema();
});

const fields = (type: string) => Object.keys((schema.getType(type) as GraphQLObjectType).getFields());

describe("the model folder", () => {
  it("has what grandstack-server looks for, and nothing it would reject", () => {
    // model.json keys are checked by the server; these are the ones it allows
    expect(Object.keys(modelJson).filter((k) => !["seedProbeLabel", "refreshCounts"].includes(k))).toEqual([]);
    // No seed: the store starts empty and is filled by a sync, so it needs no probe label
    expect(modelJson.refreshCounts).toBe(false);
  });
});

describe("the types", () => {
  it("defines the node types the design lists", () => {
    expect(nodeTypeNames(typeDefs).sort()).toEqual(
      ["AuraAccount", "CloudProvider", "Instance", "InstanceConfiguration", "Operation", "OperationStep", "SyncRun", "Tenant", "Tier"].sort(),
    );
  });

  it("gives every type and every declared field a description", () => {
    // Only fields written in schema.graphql: the library adds its own ...Connection fields and operations
    const declared = parse(typeDefs).definitions.filter((d): d is ObjectTypeDefinitionNode => d.kind === Kind.OBJECT_TYPE_DEFINITION);
    const missing: string[] = [];
    for (const def of declared) {
      const type = schema.getType(def.name.value) as GraphQLObjectType;
      if (!type.description) missing.push(def.name.value);
      for (const field of def.fields ?? []) if (!type.getFields()[field.name.value]?.description) missing.push(`${def.name.value}.${field.name.value}`);
    }
    expect(missing).toEqual([]);
  });

  it("makes Instance a federation entity keyed on auraId, so the aura subgraph can extend it", () => {
    const sdl = printSchema(schema);
    expect(sdl).toContain("union _Entity");
    expect(sdl).toMatch(/_Entity\s*=[^\n]*Instance/);
  });
});

describe("secrets stay out of GraphQL", () => {
  it("has no password, secret or cipher field on any type, and no credential type", () => {
    expect(printSchema(schema)).not.toMatch(/InstanceCredential|AuraSecret|AuditEvent/);
    const names = Object.values(schema.getTypeMap())
      .filter((t): t is GraphQLObjectType => "getFields" in t && !t.name.startsWith("__"))
      .flatMap((t) => Object.keys((t as GraphQLObjectType).getFields()));
    // hasStoredPassword (and its filters) and passwordRevealCount are the intended metadata; anything else is a leak
    expect(names.filter((n) => /password|secret|cipher|nonce/i.test(n) && !/^(hasStoredPassword|passwordRevealCount)/.test(n))).toEqual([]);
  });

  it("exposes only metadata about the stored password", () => {
    expect(fields("Instance")).toEqual(expect.arrayContaining(["hasStoredPassword", "credentialUsername", "passwordRevealCount"]));
  });
});

describe("the setup Cypher", () => {
  // The server splits on a semicolon at the end of a line and skips comment-only chunks
  const statements = setup
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.split("\n").every((l) => l.trim().startsWith("//")));

  it("parses to separate idempotent statements", () => {
    expect(statements.length).toBeGreaterThan(10);
    for (const s of statements) expect(s.replace(/^(\/\/[^\n]*\n)+/, "")).toMatch(/^CREATE (CONSTRAINT|INDEX) \w+ IF NOT EXISTS /);
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
