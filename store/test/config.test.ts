// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const ok = { NEO4J_URI: "bolt://localhost:7687", NEO4J_PASSWORD: "pw", INTERNAL_TOKEN: "a-long-enough-token-1234" };

describe("loadConfig", () => {
  it("applies the defaults", () => {
    expect(loadConfig(ok)).toMatchObject({ neo4jUsername: "neo4j", neo4jDatabase: "neo4j", port: 4001, internalPort: 4002 });
  });

  it("names every missing required variable", () => {
    expect(() => loadConfig({})).toThrow("NEO4J_URI, NEO4J_PASSWORD, INTERNAL_TOKEN");
  });

  it("refuses a short internal token", () => {
    expect(() => loadConfig({ ...ok, INTERNAL_TOKEN: "short" })).toThrow("at least 16 characters");
  });

  it("refuses to serve both endpoints on one port", () => {
    expect(() => loadConfig({ ...ok, PORT: "4005", INTERNAL_PORT: "4005" })).toThrow("must differ");
  });

  it("rejects a bad port", () => {
    expect(() => loadConfig({ ...ok, PORT: "abc" })).toThrow("PORT must be an integer");
  });
});
