// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
// A real Neo4j, the real store schemas served over HTTP, and mock-aura, all in this process. Integration tests are skipped unless
// NEO4J_TEST_URI is set (see README.md). The database is wiped first, but only if it holds nothing except this app's own labels.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createYoga } from "graphql-yoga";
import neo4j, { type Driver } from "neo4j-driver";
import { createMockAura, type MockAura, type MockAuraOptions } from "../../../mock-aura/src/server.js";
import { buildInternalSchema, buildPublicSchema } from "../../../store/src/schemas.js";
import { runSetup } from "../../../store/src/setup.js";
import { SecretBox } from "../../src/crypto.js";
import { SecretStore } from "../../src/secrets.js";
import { StoreClient } from "../../src/storeClient.js";

export const integrationEnabled = Boolean(process.env.NEO4J_TEST_URI);

export const MOCK_CLIENT_ID = "a1b2c3d4e5f6a7b8";
export const MOCK_CLIENT_SECRET = "s3cret-sentinel-value-9f8e7d";
export const INTERNAL_TOKEN = "integration-internal-token-1234";

const OUR_LABELS = new Set(["AuraAccount", "Tenant", "InstanceConfiguration", "CloudProvider", "Tier", "Instance", "Operation", "OperationStep", "SyncRun", "InstanceCredential", "AuraSecret", "AuditEvent"]);

export interface World {
  driver: Driver;
  database: string;
  mock: MockAura;
  mockBase: string;
  box: SecretBox;
  secrets: SecretStore;
  /** The store's internal read-write endpoint, as the aura subgraph uses it. */
  store: StoreClient;
  /** Read through the store's public schema, as the web app would. */
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

  const storeDir = new URL("../../../store/", import.meta.url);
  await runSetup(driver, database, new URL("setup/constraints.cypher", storeDir).pathname);
  const typeDefs = readFileSync(new URL("schema/schema.graphql", storeDir), "utf8");
  const context = () => ({ executionContext: driver, sessionConfig: { database } });

  const internalYoga = createYoga({ schema: await buildInternalSchema(typeDefs, driver), context, graphqlEndpoint: "/graphql" });
  const internalServer = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${INTERNAL_TOKEN}`) {
      res.writeHead(401).end();
      return;
    }
    internalYoga(req, res);
  });
  const publicYoga = createYoga({ schema: await buildPublicSchema(typeDefs, driver), context, graphqlEndpoint: "/graphql" });
  const publicServer = createServer(publicYoga);
  const [internalPort, publicPort] = [await listen(internalServer), await listen(publicServer)];

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
    store: new StoreClient(`http://127.0.0.1:${internalPort}/graphql`, INTERNAL_TOKEN),
    cypher,
    async read(query, variables) {
      const res = await fetch(`http://127.0.0.1:${publicPort}/graphql`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
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
      await Promise.all([new Promise((r) => internalServer.close(r)), new Promise((r) => publicServer.close(r))]);
      await driver.close();
    },
  };
}
