// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createYoga } from "graphql-yoga";
import neo4j from "neo4j-driver";
import { loadConfig } from "./config.js";
import { buildInternalSchema, buildPublicSchema } from "./schemas.js";
import { runSetup } from "./setup.js";

const config = loadConfig();
const driver = neo4j.driver(config.neo4jUri, neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword));
await driver.verifyConnectivity({ database: config.neo4jDatabase });

const count = await runSetup(driver, config.neo4jDatabase, config.setupCypherPath);
console.log(`Ran ${count} setup statement(s)`);

const typeDefs = await readFile(config.schemaPath, "utf8");

const context = () => ({
  executionContext: driver,
  sessionConfig: { database: config.neo4jDatabase },
});

// Public: read-only federation subgraph. This is the one that goes into the supergraph.
const publicYoga = createYoga({ schema: await buildPublicSchema(typeDefs, driver), context, graphqlEndpoint: "/graphql" });
const publicServer = createServer(publicYoga);
publicServer.listen(config.port, () => console.log(`Public read-only subgraph at http://localhost:${config.port}/graphql`));

// Internal: full create, read, update and delete. Needs the bearer token. Never expose or route this port.
const internalYoga = createYoga({ schema: await buildInternalSchema(typeDefs, driver), context, graphqlEndpoint: "/graphql" });
const expected = Buffer.from(config.internalToken);

function authorised(req: IncomingMessage): boolean {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
  if (!match) return false;
  const given = Buffer.from(match[1]!);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const internalServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (!authorised(req)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ errors: [{ message: "Unauthorized" }] }));
    return;
  }
  internalYoga(req, res);
});
internalServer.listen(config.internalPort, () => console.log(`Internal endpoint at http://localhost:${config.internalPort}/graphql (token required)`));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    publicServer.close();
    internalServer.close();
    void driver.close().finally(() => process.exit(0));
  });
}
