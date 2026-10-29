// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // graphql 16 ships a CommonJS and an ESM build. Plain Node loads the CommonJS one, for our code and for graphql-yoga alike.
    // Vitest would load the ESM build for our code only, and then "instanceof GraphQLError" fails between the two copies, which
    // would wrongly mask our errors. Pointing graphql at the CommonJS file makes the tests load it the way Node does.
    alias: [{ find: /^graphql$/, replacement: createRequire(import.meta.url).resolve("graphql") }],
  },
  test: {
    // The integration tests share one database and each wipes it first, so test files must not run at the same time
    fileParallelism: false,
    // They start real servers and sync a real database: seconds on a laptop, longer on a shared CI runner
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
