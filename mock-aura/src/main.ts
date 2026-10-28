// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { createMockAura } from "./server.js";

const num = (v: string | undefined): number | undefined => (v === undefined || v === "" ? undefined : Number(v));

const mock = createMockAura({
  stepMs: num(process.env.MOCK_STEP_MS),
  clientId: process.env.MOCK_CLIENT_ID,
  clientSecret: process.env.MOCK_CLIENT_SECRET,
  tokenTtlMs: num(process.env.MOCK_TOKEN_TTL_MS),
  rateLimitPerMinute: num(process.env.MOCK_RATE_LIMIT_PER_MINUTE),
  maxInstances: num(process.env.MOCK_MAX_INSTANCES),
});

const port = await mock.listen(Number(process.env.PORT ?? 4020));
console.log(`mock-aura ready at http://localhost:${port}/v1 (token: POST http://localhost:${port}/oauth/token)`);
console.log(`Credentials: ${process.env.MOCK_CLIENT_ID ?? "mock-client"} / ${process.env.MOCK_CLIENT_SECRET ?? "mock-secret"}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void mock.close().then(() => process.exit(0)));
}
