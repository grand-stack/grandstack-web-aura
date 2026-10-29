// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
// Config for the Hive Gateway image from grandstack-federation, mounted over its own by compose.aura.yaml in the grandstack repository,
// together with gateway/supergraph.graphql. The supergraph was composed against localhost addresses; here the subgraph addresses are
// replaced for the compose network. "Neo4j" is the read-only grandstack-server (the service named `server`), as in grandstack-federation.
// The gateway has no sign-in of its own: in the default setup it is published on this machine only, and behind the edge it is not
// published at all.
import { defineConfig } from "@graphql-hive/gateway";

const origins = (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",").map((o) => o.trim()).filter(Boolean);

export const gatewayConfig = defineConfig({
  // No browser query editor: it is a web app of its own (with its own dependencies) served by the gateway, and nothing here needs it
  graphiql: false,
  cors: { origin: origins, credentials: !origins.includes("*") },
  transportEntries: {
    Neo4j: { location: process.env.NEO4J_URL ?? "http://server:4000/graphql" },
    Aura: { location: process.env.AURA_URL ?? "http://aura:4010/graphql" },
  },
});
