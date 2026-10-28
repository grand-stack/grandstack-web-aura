// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { createServer } from "node:http";
import { createYoga } from "graphql-yoga";
import neo4j from "neo4j-driver";
import { loadConfig } from "./config.js";
import { SecretBox } from "./crypto.js";
import { buildSchema } from "./schema.js";
import { SecretStore } from "./secrets.js";
import { AuraService } from "./service.js";
import { StoreClient } from "./storeClient.js";

const config = loadConfig();
const driver = neo4j.driver(config.neo4jUri, neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword));
await driver.verifyConnectivity({ database: config.neo4jDatabase });

const box = new SecretBox(new Map([[config.secretKeyVersion, config.secretKey]]), config.secretKeyVersion);
const service = new AuraService({
  accountId: config.accountId,
  auraBaseUrl: config.auraBaseUrl,
  syncConcurrency: config.syncConcurrency,
  syncIntervalMs: config.syncIntervalMs,
  operationTimeoutMs: config.operationTimeoutMs,
  secrets: new SecretStore(driver, config.neo4jDatabase, box),
  store: new StoreClient(config.storeInternalUrl, config.internalToken),
});

// Unexpected errors are masked by default. UserError is a GraphQLError, so its message reaches the person.
const yoga = createYoga({ schema: buildSchema(service), graphqlEndpoint: "/graphql", maskedErrors: true });
const server = createServer(yoga);
server.listen(config.port, () => console.log(`Aura subgraph at http://localhost:${config.port}/graphql (Aura: ${new URL(config.auraBaseUrl).origin})`));

// Sync now if an account is already connected (for example after a restart), then on a timer
await service.start();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    service.stop();
    server.close();
    void Promise.all([service.idle(), service.operations.idle()]).finally(() => driver.close().finally(() => process.exit(0)));
  });
}
