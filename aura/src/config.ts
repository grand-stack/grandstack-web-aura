// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
export interface Config {
  port: number;
  /** The store's internal read-write GraphQL endpoint. Never the public one, never through the gateway. */
  storeInternalUrl: string;
  /** Bearer token for the store's internal endpoint. */
  internalToken: string;
  /** Bolt connection to the store's Neo4j, used only for secrets (the credential nodes are not in the GraphQL schema). */
  neo4jUri: string;
  neo4jUsername: string;
  neo4jPassword: string;
  neo4jDatabase: string;
  /** AES-256 key that seals the Aura client secret and instance passwords. 32 bytes, base64. */
  secretKey: Buffer;
  secretKeyVersion: number;
  /** Where the Aura API lives, without /v1. */
  auraBaseUrl: string;
  /** Milliseconds between automatic syncs. 0 turns the timer off. */
  syncIntervalMs: number;
  /** How many instance detail requests run at once during a sync. */
  syncConcurrency: number;
  /** The one account version 1 supports. */
  accountId: string;
}

type Env = Record<string, string | undefined>;

const MIN_TOKEN_LENGTH = 16;

function integer(env: Env, name: string, fallback: number, min: number, max: number): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, got "${env[name]}"`);
  }
  return value;
}

export function parseSecretKey(raw: string): Buffer {
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`SECRET_KEY must be 32 bytes encoded as base64 (got ${key.length}). Make one with: openssl rand -base64 32`);
  return key;
}

export function loadConfig(env: Env = process.env): Config {
  const missing = ["NEO4J_URI", "NEO4J_PASSWORD", "INTERNAL_TOKEN", "SECRET_KEY"].filter((k) => !env[k]);
  if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  if (env.INTERNAL_TOKEN!.length < MIN_TOKEN_LENGTH) throw new Error(`INTERNAL_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`);

  const auraBaseUrl = (env.AURA_BASE_URL ?? "https://api.neo4j.io").replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(auraBaseUrl);
  } catch {
    throw new Error(`AURA_BASE_URL must be a URL, got "${env.AURA_BASE_URL}"`);
  }
  // The client id and secret are sent to this address, so plain http is only for a fake Aura you chose on purpose
  if (parsed.protocol !== "https:" && env.ALLOW_INSECURE_AURA_URL !== "true") {
    throw new Error("AURA_BASE_URL must be https. To use a fake Aura over http (mock-aura), also set ALLOW_INSECURE_AURA_URL=true");
  }

  return {
    port: integer(env, "PORT", 4010, 1, 65535),
    storeInternalUrl: env.STORE_INTERNAL_URL ?? "http://store:4002/graphql",
    internalToken: env.INTERNAL_TOKEN!,
    neo4jUri: env.NEO4J_URI!,
    neo4jUsername: env.NEO4J_USERNAME ?? "neo4j",
    neo4jPassword: env.NEO4J_PASSWORD!,
    neo4jDatabase: env.NEO4J_DATABASE ?? "neo4j",
    secretKey: parseSecretKey(env.SECRET_KEY!),
    secretKeyVersion: integer(env, "SECRET_KEY_VERSION", 1, 1, 1_000_000),
    auraBaseUrl,
    syncIntervalMs: integer(env, "SYNC_INTERVAL_MS", 15 * 60_000, 0, 24 * 3_600_000),
    syncConcurrency: integer(env, "SYNC_CONCURRENCY", 3, 1, 20),
    accountId: "default",
  };
}
