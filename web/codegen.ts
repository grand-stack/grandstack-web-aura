// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import type { CodegenConfig } from "@graphql-codegen/cli";

// Needs the stack running (see the README in the repository root). The output is committed so a clone builds without it.
// It reads the gateway, so the types match the supergraph the app really talks to.
const config: CodegenConfig = {
  schema: process.env.GRAPHQL_URL ?? "http://localhost:4100/graphql",
  documents: ["src/**/*.tsx", "src/**/*.ts", "!src/graphql/generated/**"],
  ignoreNoDocuments: false,
  generates: {
    "src/graphql/generated/": { preset: "client", presetConfig: { fragmentMasking: false } },
  },
};

export default config;
