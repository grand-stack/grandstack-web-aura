// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SecretBox } from "../../src/crypto.js";
import { SecretStore } from "../../src/secrets.js";
import { integrationEnabled, startWorld, type World } from "./world.js";

const suite = integrationEnabled ? describe : describe.skip;

suite("SecretStore over Bolt", () => {
  let w: World;
  beforeAll(async () => {
    w = await startWorld();
  });
  afterAll(() => w?.close());
  beforeEach(() => w.wipe());

  const creds = { clientId: "client-id-sentinel", clientSecret: "client-secret-sentinel" };

  it("saves and loads a secret", async () => {
    expect(await w.secrets.hasAuraSecret("default")).toBe(false);
    expect(await w.secrets.loadAuraSecret("default")).toBeNull();
    await w.secrets.saveAuraSecret("default", creds);
    expect(await w.secrets.hasAuraSecret("default")).toBe(true);
    expect(await w.secrets.loadAuraSecret("default")).toEqual(creds);
  });

  it("stores only ciphertext: neither the client id nor the secret is anywhere in the database", async () => {
    await w.secrets.saveAuraSecret("default", creds);
    const dump = await w.dump();
    expect(dump).not.toContain("client-secret-sentinel");
    expect(dump).not.toContain("client-id-sentinel");
    expect(dump).toContain("AuraSecret");
  });

  it("replaces the secret instead of adding another", async () => {
    await w.secrets.saveAuraSecret("default", creds);
    await w.secrets.saveAuraSecret("default", { clientId: "new-id", clientSecret: "new-secret" });
    expect(Number((await w.cypher("MATCH (n:AuraSecret) RETURN count(n) AS n"))[0]!.n)).toBe(1);
    expect(await w.secrets.loadAuraSecret("default")).toEqual({ clientId: "new-id", clientSecret: "new-secret" });
  });

  it("cannot be opened with a different key", async () => {
    await w.secrets.saveAuraSecret("default", creds);
    const other = new SecretStore(w.driver, w.database, new SecretBox(new Map([[1, randomBytes(32)]]), 1));
    await expect(other.loadAuraSecret("default")).rejects.toThrow("Could not open");
  });

  it("cannot be copied onto another account's record", async () => {
    await w.secrets.saveAuraSecret("default", creds);
    await w.cypher(
      `MATCH (a:AuraSecret {accountId: "default"})
       CREATE (:AuraSecret {accountId: "other", cipher: a.cipher, nonce: a.nonce, keyVersion: a.keyVersion, storedAt: a.storedAt})`,
    );
    await expect(w.secrets.loadAuraSecret("other")).rejects.toThrow("Could not open");
  });

  it("deletes the secret", async () => {
    await w.secrets.saveAuraSecret("default", creds);
    await w.secrets.deleteAuraSecret("default");
    expect(await w.secrets.hasAuraSecret("default")).toBe(false);
    expect(await w.secrets.loadAuraSecret("default")).toBeNull();
    await w.secrets.deleteAuraSecret("default"); // deleting nothing is fine
  });

  it("enforces one secret per account with a constraint", async () => {
    await w.secrets.saveAuraSecret("default", creds);
    await expect(w.cypher(`CREATE (:AuraSecret {accountId: "default", cipher: "x", nonce: "y", keyVersion: 1})`)).rejects.toThrow(/already exists|constraint/i);
  });
});
