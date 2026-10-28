// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
// A real Neo4j, two real grandstack-server processes on the aura model (one read-only, one writable, as in the compose stack), and
// mock-aura in this process. Integration tests are skipped unless NEO4J_TEST_URI is set (see docs/testing.md). The database is wiped
// first, but only if it holds nothing except this app's own labels.
import { randomBytes } from "node:crypto";
import { type Server } from "node:http";
import neo4j, { type Driver } from "neo4j-driver";
import { createMockAura, type MockAura, type MockAuraOptions } from "../../../mock-aura/src/server.js";
import { SecretBox } from "../../src/crypto.js";
import { SecretStore } from "../../src/secrets.js";
import { StoreClient } from "../../src/storeClient.js";
import { assertServerBuilt, startServer, type RunningServer } from "./servers.js";

export const integrationEnabled = Boolean(process.env.NEO4J_TEST_URI);

export const MOCK_CLIENT_ID = "a1b2c3d4e5f6a7b8";
export const MOCK_CLIENT_SECRET = "s3cret-sentinel-value-9f8e7d";

const OUR_LABELS = new Set(["AuraAccount", "Tenant", "InstanceConfiguration", "CloudProvider", "Tier", "Instance", "Operation", "OperationStep", "SyncRun", "InstanceCredential", "AuraSecret", "AuditEvent"]);

export interface World {
  driver: Driver;
  database: string;
  mock: MockAura;
  mockBase: string;
  box: SecretBox;
  secrets: SecretStore;
  /** The writable server, as the aura subgraph uses it. */
  store: StoreClient;
  /** The read-only server's address, and the writable one's. */
  publicUrl: string;
  writerUrl: string;
  /** Read through the read-only server, as the web app would. */
  read<T = any>(query: string, variables?: Record<string, unknown>): Promise<T>;
  /** Run Cypher directly, to look at what is really in the database. */
  cypher(statement: string, params?: Record<string, unknown>): Promise<any[]>;
  /** Everything in the database as one string, to prove a secret is nowhere in it. */
  dump(): Promise<string>;
  /** Remove all data (the constraints stay). */
  wipe(): Promise<void>;
  close(): Promise<void>;
}

const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, () => resolve((server.address() as { port: number }).port)));

export async function startWorld(auraOptions: MockAuraOptions = {}): Promise<World> {
  const database = process.env.NEO4J_TEST_DATABASE ?? "neo4j";
  const driver = neo4j.driver(process.env.NEO4J_TEST_URI!, neo4j.auth.basic(process.env.NEO4J_TEST_USERNAME ?? "neo4j", process.env.NEO4J_TEST_PASSWORD ?? "neo4j"));
  await driver.verifyConnectivity({ database });

  const cypher: World["cypher"] = async (statement, params = {}) => {
    const session = driver.session({ database });
    try {
      return (await session.run(statement, params)).records.map((r) => r.toObject());
    } finally {
      await session.close();
    }
  };

  const foreign = (await cypher("CALL db.labels() YIELD label RETURN label")).map((r) => r.label as string).filter((l) => !OUR_LABELS.has(l));
  if (foreign.length > 0) throw new Error(`Refusing to wipe a database that holds other labels: ${foreign.join(", ")}`);
  await cypher("MATCH (n) DETACH DELETE n");

  assertServerBuilt();
  const uri = process.env.NEO4J_TEST_URI!;
  const server = { uri, username: process.env.NEO4J_TEST_USERNAME ?? "neo4j", password: process.env.NEO4J_TEST_PASSWORD ?? "neo4j", database };
  // One after the other: both run the model's setup Cypher, and two servers creating the same constraint at once can collide
  const writer: RunningServer = await startServer({ ...server, readOnly: false });
  const reader: RunningServer = await startServer({ ...server, readOnly: true });

  const mock = createMockAura({ stepMs: 15, clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET, ...auraOptions });
  const mockBase = `http://127.0.0.1:${await mock.listen(0)}`;

  const box = new SecretBox(new Map([[1, randomBytes(32)]]), 1);

  return {
    driver,
    database,
    mock,
    mockBase,
    box,
    secrets: new SecretStore(driver, database, box),
    store: new StoreClient(writer.url),
    publicUrl: reader.url,
    writerUrl: writer.url,
    cypher,
    async read(query, variables) {
      const res = await fetch(reader.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
      const body = (await res.json()) as { data?: any; errors?: { message: string }[] };
      if (body.errors) throw new Error(body.errors.map((e) => e.message).join("; "));
      return body.data;
    },
    async dump() {
      const nodes = await cypher("MATCH (n) RETURN labels(n) AS labels, properties(n) AS props");
      const edges = await cypher("MATCH ()-[r]->() RETURN type(r) AS type, properties(r) AS props");
      return JSON.stringify({ nodes, edges });
    },
    wipe: async () => void (await cypher("MATCH (n) DETACH DELETE n")),
    async close() {
      await mock.close();
      await Promise.all([writer.stop(), reader.stop()]);
      await driver.close();
    },
  };
}
