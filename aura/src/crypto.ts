// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** A sealed secret, as it is stored: nothing here reveals the plaintext without the key. */
export interface Sealed {
  /** Ciphertext followed by the 16-byte GCM tag, base64. */
  cipher: string;
  /** The 12-byte nonce, base64. Fresh for every seal. */
  nonce: string;
  /** Which key sealed it, so keys can be rotated. */
  keyVersion: number;
}

const TAG_BYTES = 16;
const NONCE_BYTES = 12;

/**
 * AES-256-GCM. Each secret is sealed with an "aad" (additional authenticated data) naming what it belongs to, for example
 * "aura-secret:default". A sealed value copied onto another record then fails to open, so secrets cannot be swapped between records.
 */
export class SecretBox {
  constructor(
    private readonly keys: ReadonlyMap<number, Buffer>,
    private readonly currentVersion: number,
  ) {
    for (const [version, key] of keys) {
      if (key.length !== 32) throw new Error(`Key version ${version} must be 32 bytes`);
    }
    if (!keys.has(currentVersion)) throw new Error(`No key for the current version ${currentVersion}`);
  }

  seal(plaintext: string, aad: string): Sealed {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.keys.get(this.currentVersion)!, nonce);
    cipher.setAAD(Buffer.from(aad));
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return { cipher: Buffer.concat([body, cipher.getAuthTag()]).toString("base64"), nonce: nonce.toString("base64"), keyVersion: this.currentVersion };
  }

  /** Throws if the key, the aad or the data is wrong. The message never includes the data. */
  open(sealed: Sealed, aad: string): string {
    const key = this.keys.get(sealed.keyVersion);
    if (!key) throw new Error(`No key for version ${sealed.keyVersion}`);
    const raw = Buffer.from(sealed.cipher, "base64");
    if (raw.length < TAG_BYTES) throw new Error("Sealed value is too short");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.nonce, "base64"));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
    try {
      return Buffer.concat([decipher.update(raw.subarray(0, raw.length - TAG_BYTES)), decipher.final()]).toString("utf8");
    } catch {
      throw new Error("Could not open the sealed value: wrong key, wrong owner or damaged data");
    }
  }
}
