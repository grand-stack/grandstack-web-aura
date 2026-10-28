// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { readFileSync } from "node:fs";
import { Kind, parse, type FieldDefinitionNode, type ObjectTypeDefinitionNode } from "graphql";
import { describe, expect, it } from "vitest";

// The supergraph is composed from the running subgraphs (`npm run compose:supergraph`) and committed. These tests read the committed
// file, so they run without a stack. They guard what must stay true however it is recomposed.
const sdl = readFileSync(new URL("../supergraph.graphql", import.meta.url), "utf8");
const document = parse(sdl);

const objectTypes = new Map(
  document.definitions.filter((d): d is ObjectTypeDefinitionNode => d.kind === Kind.OBJECT_TYPE_DEFINITION).map((d) => [d.name.value, d] as const),
);
const fieldsOf = (type: string): FieldDefinitionNode[] => [...(objectTypes.get(type)?.fields ?? [])];
const names = (type: string) => fieldsOf(type).map((f) => f.name.value);

describe("the composed supergraph", () => {
  it("joins the Neo4j (store) and aura subgraphs", () => {
    expect(sdl).toMatch(/enum join__Graph \{[^}]*AURA @join__graph\(name: "Aura"/s);
    expect(sdl).toMatch(/enum join__Graph \{[^}]*NEO4J @join__graph\(name: "Neo4j"/s);
  });

  it("can only be changed through the aura subgraph's mutations, which plan, confirm and cancel", () => {
    // The store's public subgraph is read-only, so none of its generated create, update or delete mutations can appear
    expect(names("Mutation").sort()).toEqual(["cancelOperation", "confirmOperation", "connectAura", "disconnectAura", "planCreate", "planDelete", "planPause", "planResume", "planUpdate", "revealInstancePassword", "syncNow"]);
  });

  it("has no mutation that writes an operation or an instance directly, so a change has to be confirmed to reach Aura", () => {
    expect(names("Mutation").filter((n) => /^(create|update|delete)/.test(n))).toEqual([]);
  });

  it("makes every plan return only an id to review, not a way to skip the review", () => {
    for (const plan of ["planUpdate", "planPause", "planResume", "planCreate", "planDelete"]) {
      const field = fieldsOf("Mutation").find((f) => f.name.value === plan)!;
      expect(JSON.stringify(field.type)).toContain("PlannedChange");
    }
    expect(names("PlannedChange")).toEqual(["operationId"]);
  });

  it("asks for the instance's name to confirm a delete, as a plain argument of confirmOperation", () => {
    const confirm = fieldsOf("Mutation").find((f) => f.name.value === "confirmOperation")!;
    expect((confirm.arguments ?? []).map((a) => a.name.value).sort()).toEqual(["operationId", "typedName"]);
  });

  it("serves the reads the gallery needs from the store, and the setup state from aura", () => {
    expect(names("Query")).toEqual(
      expect.arrayContaining(["auraSetup", "instances", "instancesConnection", "tenants", "instanceConfigurations", "cloudProviders", "tiers", "operations", "syncRuns", "auraAccounts", "checkInstance"]),
    );
  });

  it("keeps Instance a federation entity owned by the store", () => {
    expect(sdl).toMatch(/type Instance @join__type\(graph: NEO4J, key: "auraId"\)/);
  });

  it("has no credential type and no field that could return a password, secret or cipher, except the reveal", () => {
    expect(sdl).not.toMatch(/InstanceCredential|AuraSecret/);
    // The one way to see a password: revealInstancePassword, which returns RevealedPassword. Nothing else may carry one.
    expect(names("RevealedPassword")).toEqual(["username", "password"]);
    const carriers = [...objectTypes.values()].filter((t) => (t.fields ?? []).some((f) => JSON.stringify(f.type).includes("RevealedPassword"))).map((t) => t.name.value);
    expect(carriers).toEqual(["Mutation"]);
    const suspicious = [...objectTypes.values()]
      .filter((t) => !t.name.value.startsWith("join__") && !t.name.value.startsWith("link__"))
      .flatMap((t) => (t.fields ?? []).map((f) => `${t.name.value}.${f.name.value}`))
      // hasStoredPassword, its filters and passwordRevealCount are the intended metadata
      .filter((f) => /password|secret|cipher|nonce/i.test(f) && !/\.(hasStoredPassword|passwordRevealCount|revealInstancePassword)$/.test(f) && !f.startsWith("RevealedPassword."));
    expect(suspicious).toEqual([]);
  });

  it("takes the client secret only as the argument of connectAura", () => {
    const connect = fieldsOf("Mutation").find((f) => f.name.value === "connectAura")!;
    expect((connect.arguments ?? []).map((a) => a.name.value).sort()).toEqual(["clientId", "clientSecret"]);
    // as a name it appears nowhere else in the schema's own definitions (descriptions may mention it)
    const outsideDescriptions = sdl.replace(/"""[\s\S]*?"""/g, "").replace(/#.*$/gm, "");
    expect(outsideDescriptions.match(/clientSecret/g)).toHaveLength(1);
  });

  it("points at the subgraphs by localhost address, which gateway.config.ts replaces in compose", () => {
    expect(sdl).toContain('url: "http://localhost:4001/graphql"');
    expect(sdl).toContain('url: "http://localhost:4010/graphql"');
    // never the store's internal port
    expect(sdl).not.toMatch(/4002/);
  });
});
