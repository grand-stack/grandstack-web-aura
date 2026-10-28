// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
// Hive Gateway serving gateway/supergraph.graphql: the one GraphQL endpoint for the web app.
// The supergraph was composed against localhost addresses; here the subgraph addresses are replaced for the compose network.
// There is no sign-in yet (PLAN.md Phase 5), so this must only be reachable from your own machine.
import { defineConfig } from "@graphql-hive/gateway";

const origins = (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",").map((o) => o.trim()).filter(Boolean);

export const gatewayConfig = defineConfig({
  cors: { origin: origins, credentials: !origins.includes("*") },
  transportEntries: {
    Store: { location: process.env.STORE_URL ?? "http://store:4001/graphql" },
    Aura: { location: process.env.AURA_URL ?? "http://aura:4010/graphql" },
  },
});
