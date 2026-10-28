// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
export interface Config {
  neo4jUri: string;
  neo4jUsername: string;
  neo4jPassword: string;
  neo4jDatabase: string;
  schemaPath: string;
  /** Cypher run at every start: constraints and indexes, all idempotent. */
  setupCypherPath: string;
  /** Port of the public, read-only subgraph that goes into the supergraph. */
  port: number;
  /** Port of the internal full-CRUD endpoint. Never route it through the gateway. */
  internalPort: number;
  /** Bearer token the internal endpoint requires. Shared with the aura subgraph. */
  internalToken: string;
}

type Env = Record<string, string | undefined>;

const MIN_TOKEN_LENGTH = 16;

function port(env: Env, name: string, fallback: number): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535, got "${env[name]}"`);
  }
  return value;
}

export function loadConfig(env: Env = process.env): Config {
  const missing = ["NEO4J_URI", "NEO4J_PASSWORD", "INTERNAL_TOKEN"].filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  if (env.INTERNAL_TOKEN!.length < MIN_TOKEN_LENGTH) {
    throw new Error(`INTERNAL_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`);
  }
  const config: Config = {
    neo4jUri: env.NEO4J_URI!,
    neo4jUsername: env.NEO4J_USERNAME ?? "neo4j",
    neo4jPassword: env.NEO4J_PASSWORD!,
    neo4jDatabase: env.NEO4J_DATABASE ?? "neo4j",
    schemaPath: env.SCHEMA_PATH ?? "schema/schema.graphql",
    setupCypherPath: env.SETUP_CYPHER_PATH ?? "setup/constraints.cypher",
    port: port(env, "PORT", 4001),
    internalPort: port(env, "INTERNAL_PORT", 4002),
    internalToken: env.INTERNAL_TOKEN!,
  };
  if (config.port === config.internalPort) {
    throw new Error("PORT and INTERNAL_PORT must differ, so the internal endpoint is never served on the public port");
  }
  return config;
}
