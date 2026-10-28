// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig, parseSecretKey } from "../src/config.js";

const key = randomBytes(32).toString("base64");
const ok = { NEO4J_URI: "bolt://localhost:7687", NEO4J_PASSWORD: "pw", INTERNAL_TOKEN: "a-long-enough-token-1234", SECRET_KEY: key };

describe("loadConfig", () => {
  it("applies the defaults, including the real Aura address", () => {
    expect(loadConfig(ok)).toMatchObject({
      port: 4010,
      auraBaseUrl: "https://api.neo4j.io",
      syncIntervalMs: 900_000,
      syncConcurrency: 3,
      accountId: "default",
      storeInternalUrl: "http://store:4002/graphql",
    });
  });

  it("names every missing required variable", () => {
    expect(() => loadConfig({})).toThrow("NEO4J_URI, NEO4J_PASSWORD, INTERNAL_TOKEN, SECRET_KEY");
  });

  it("refuses a short internal token", () => {
    expect(() => loadConfig({ ...ok, INTERNAL_TOKEN: "short" })).toThrow("at least 16 characters");
  });

  it("refuses a secret key that is not 32 bytes", () => {
    expect(() => loadConfig({ ...ok, SECRET_KEY: randomBytes(16).toString("base64") })).toThrow("32 bytes");
    expect(() => parseSecretKey("not base64 at all!!")).toThrow("32 bytes");
  });

  it("refuses to send credentials over plain http unless that was chosen on purpose", () => {
    expect(() => loadConfig({ ...ok, AURA_BASE_URL: "http://mock-aura:4020" })).toThrow("must be https");
    expect(loadConfig({ ...ok, AURA_BASE_URL: "http://mock-aura:4020", ALLOW_INSECURE_AURA_URL: "true" }).auraBaseUrl).toBe("http://mock-aura:4020");
  });

  it("trims trailing slashes and rejects a non-URL", () => {
    expect(loadConfig({ ...ok, AURA_BASE_URL: "https://api.neo4j.io///" }).auraBaseUrl).toBe("https://api.neo4j.io");
    expect(() => loadConfig({ ...ok, AURA_BASE_URL: "not a url" })).toThrow("must be a URL");
  });

  it("allows turning the timer off, and rejects bad numbers", () => {
    expect(loadConfig({ ...ok, SYNC_INTERVAL_MS: "0" }).syncIntervalMs).toBe(0);
    expect(() => loadConfig({ ...ok, SYNC_CONCURRENCY: "0" })).toThrow("SYNC_CONCURRENCY");
    expect(() => loadConfig({ ...ok, PORT: "abc" })).toThrow("PORT");
  });
});
