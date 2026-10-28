# AGENTS.md: grandstack-web-aura

A web UI for managing Neo4j Aura. Neo4j is a cache of Aura's state; the Aura REST API is used to sync and to apply confirmed changes. Read [PLAN.md](PLAN.md) first: the design, graph model, security rules and phases are there, and it is kept true.

## Commands

```sh
npm ci
npm run typecheck                         # all workspaces
npm test                                  # all workspaces, no database needed
npm run generate:api                      # aura/src/generated/aura-api.d.ts from docs/aura_api_spec_v1-2.yaml
podman compose -p gwa up -d --build       # Neo4j + store + mock-aura (docker compose works too)
npm run test:integration -w store         # needs NEO4J_TEST_URI, see README.md
```

Before you finish a change: `npm run typecheck && npm test`, and `npm run test:integration -w store` if you touched `store/`.

## Layout

- `store/` the store subgraph. `schema/schema.graphql` is the graph model. `setup/constraints.cypher` runs at every start. `src/schemas.ts` builds the public (read-only) and internal (read-write) schemas from the one file.
- `mock-aura/` a fake Aura API. `test/contract.test.ts` validates its responses against the real spec.
- `aura/` the aura subgraph (Phase 2). `src/generated/` is generated, never edit it.
- `docs/aura_api_spec_v1-2.yaml` the real spec. It is the source of truth for the REST API.

## Rules that are easy to get wrong

- **Never call a real Aura account from code, tests or scripts you run.** Use mock-aura.
- **Secrets are never GraphQL fields.** The instance password and the Aura client secret live in `InstanceCredential` and `AuraSecret` nodes that are not in `schema.graphql`. `store/test/schema.test.ts` and `integration.test.ts` fail if a password, secret, cipher or nonce field appears. Do not add one.
- **The public store schema is read-only.** `publicTypeDefs` adds `@mutation(operations: [])` to every `@node` type. Writes go through the internal endpoint (token required, never published, never routed through the gateway).
- **Timestamps are ISO 8601 UTC strings, not `DateTime`.** The library formats `DateTime` with the APOC plugin, which a plain Neo4j image lacks.
- **A `@cypher` field must always return a row.** Use `OPTIONAL MATCH`. A field that returns no row removes the whole parent from the results (this hid instances once).
- Every type and field in `schema.graphql` needs a `"""description"""`. A test checks it.
- Types need `@node` (v7). v7 has no `@unique`: uniqueness comes from `setup/constraints.cypher`.
- `graphql` 16 ships CommonJS and ESM builds. Tests that touch `@neo4j/graphql` schemas load `graphql` with `createRequire`, as `schema.test.ts` does, or graphql rejects the schema as coming from "another module".
- Keep `@apollo/subgraph` at 2.14.4 (root `overrides`); newer breaks `@neo4j/graphql` 7.6.4. Pin exact dependency versions.
- The mock must not drift from the spec. If you add an endpoint to mock-aura, add it to `contract.test.ts`, and check its responses validate.
- New code files need the copyright header (two lines: `Copyright (c) "Neo4j"` and `Neo4j Sweden AB [http://neo4j.com]`, in the file's comment syntax). Generated files are exempt.
- Base images in Dockerfiles and compose files are pinned to an exact version and a digest (`image:1.2.3@sha256:...`), never a floating tag. To pin a new image, look up the digest of the multi-arch index.
- **Commit at the end of each phase** (the phases are in PLAN.md section 11), once typecheck and tests pass and PLAN.md and README.md say what was built. One commit per phase, with a message that lists what was added and any design changes. Do not push or bump versions unless asked.
