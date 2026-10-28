// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
// Hive Gateway serving gateway/supergraph.graphql: the one GraphQL endpoint for the web app.
// The supergraph was composed against localhost addresses; here the subgraph addresses are replaced for the compose network.
// The gateway has no sign-in of its own. It is not published: only the edge reaches it, and the edge asks everyone to sign in.
import { defineConfig } from "@graphql-hive/gateway";

const origins = (process.env.CORS_ORIGIN ?? "https://localhost:8443").split(",").map((o) => o.trim()).filter(Boolean);

export const gatewayConfig = defineConfig({
  // No browser query editor: it is a web app of its own (with its own dependencies) served by the gateway, and nothing here needs it
  graphiql: false,
  cors: { origin: origins, credentials: !origins.includes("*") },
  transportEntries: {
    Store: { location: process.env.STORE_URL ?? "http://store:4001/graphql" },
    Aura: { location: process.env.AURA_URL ?? "http://aura:4010/graphql" },
  },
});
