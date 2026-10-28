// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SecretBox } from "../src/crypto.js";

const key = () => randomBytes(32);
const box = (k = key()) => new SecretBox(new Map([[1, k]]), 1);

describe("SecretBox", () => {
  it("opens what it sealed", () => {
    const b = box();
    expect(b.open(b.seal("a secret", "owner:1"), "owner:1")).toBe("a secret");
  });

  it("handles empty and non-ASCII text", () => {
    const b = box();
    expect(b.open(b.seal("", "x"), "x")).toBe("");
    expect(b.open(b.seal("pässwörd-密码-🔑", "x"), "x")).toBe("pässwörd-密码-🔑");
  });

  it("never stores the plaintext", () => {
    const sealed = box().seal("hunter2-sentinel", "x");
    expect(JSON.stringify(sealed)).not.toContain("hunter2-sentinel");
    expect(Buffer.from(sealed.cipher, "base64").toString("utf8")).not.toContain("hunter2-sentinel");
  });

  it("uses a fresh nonce each time, so equal secrets look different", () => {
    const b = box();
    const one = b.seal("same", "x");
    const two = b.seal("same", "x");
    expect(one.nonce).not.toBe(two.nonce);
    expect(one.cipher).not.toBe(two.cipher);
  });

  it("refuses the wrong key", () => {
    const sealed = box().seal("secret", "x");
    expect(() => box().open(sealed, "x")).toThrow("Could not open");
  });

  it("refuses a different owner, so a sealed value cannot be moved to another record", () => {
    const b = box();
    const sealed = b.seal("secret", "aura-secret:a");
    expect(() => b.open(sealed, "aura-secret:b")).toThrow("Could not open");
  });

  it("refuses damaged data", () => {
    const b = box();
    const sealed = b.seal("secret", "x");
    const bytes = Buffer.from(sealed.cipher, "base64");
    bytes[0] = bytes[0]! ^ 0xff;
    expect(() => b.open({ ...sealed, cipher: bytes.toString("base64") }, "x")).toThrow("Could not open");
    expect(() => b.open({ ...sealed, cipher: "AAAA" }, "x")).toThrow("too short");
  });

  it("does not put the data in an error message", () => {
    const b = box();
    const sealed = b.seal("sentinel-value", "x");
    try {
      box().open(sealed, "x");
    } catch (err) {
      expect(String(err)).not.toContain("sentinel-value");
      expect(String(err)).not.toContain(sealed.cipher);
    }
  });

  it("supports key rotation: old values open with the old key, new ones are sealed with the new", () => {
    const k1 = key();
    const k2 = key();
    const old = new SecretBox(new Map([[1, k1]]), 1).seal("before", "x");
    const rotated = new SecretBox(new Map([[1, k1], [2, k2]]), 2);
    expect(rotated.open(old, "x")).toBe("before");
    const fresh = rotated.seal("after", "x");
    expect(fresh.keyVersion).toBe(2);
    expect(() => new SecretBox(new Map([[1, k1]]), 1).open(fresh, "x")).toThrow("No key for version 2");
  });

  it("rejects keys of the wrong size and a missing current key", () => {
    expect(() => new SecretBox(new Map([[1, randomBytes(16)]]), 1)).toThrow("32 bytes");
    expect(() => new SecretBox(new Map([[1, key()]]), 2)).toThrow("No key for the current version");
  });
});
