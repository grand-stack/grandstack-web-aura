// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
// Composes the store and aura subgraphs into gateway/supergraph.graphql. Run `npm run compose -w gateway` with the stack up:
// the schemas are read from the subgraphs' published ports on your machine. The addresses stored in the supergraph are those same
// localhost ones; gateway.config.ts replaces them with the service names when the gateway runs in compose.
// Only the store's PUBLIC, read-only subgraph (4001) is composed. Its internal read-write endpoint (4002) must never appear here.
import { defineConfig, loadGraphQLHTTPSubgraph } from "@graphql-mesh/compose-cli";

export const composeConfig = defineConfig({
  subgraphs: [
    { sourceHandler: loadGraphQLHTTPSubgraph("Neo4j", { endpoint: process.env.NEO4J_URL ?? "http://localhost:4001/graphql" }) },
    { sourceHandler: loadGraphQLHTTPSubgraph("Aura", { endpoint: process.env.AURA_URL ?? "http://localhost:4010/graphql" }) },
  ],
});
