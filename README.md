# grandstack-web-aura

A mobile-friendly web UI for managing Neo4j Aura. A local Neo4j database **caches Aura's state**, so screens read from Neo4j. The Aura REST API (v1) is used to sync that state in and to apply changes you have reviewed and confirmed. Everything is served as one federated GraphQL supergraph.

Read [PLAN.md](PLAN.md) first. It holds the design, the graph model, the security decisions and the build phases.

## Status

Phase 1 (foundations) is built and tested:

| Part | What it is | State |
| --- | --- | --- |
| [docs/aura_api_spec_v1-2.yaml](docs/aura_api_spec_v1-2.yaml) | The real Aura API v1 OpenAPI file | In the repo. REST types are generated from it |
| [mock-aura/](mock-aura) | A fake Aura API for development and tests | Built. A contract test checks every response against the spec |
| [store/](store) | The store subgraph: Neo4j graph, public read-only schema, internal read-write schema | Built, tested against a real Neo4j |
| [aura/](aura) | The aura subgraph (sync, reconciler, reveal) | Types generated. Code not started (Phase 2) |
| gateway, web | Hive Gateway supergraph and the React app | Not started |

## Run the foundations stack

```sh
podman compose -p gwa up -d --build     # or: docker compose -p gwa up -d --build
```

| URL | What |
| --- | --- |
| http://localhost:4001/graphql | The store's public, **read-only** subgraph |
| http://localhost:4020/v1 | mock-aura (token: `POST http://localhost:4020/oauth/token`, credentials `mock-client` / `mock-secret`) |
| http://localhost:7475 | Neo4j Browser (user `neo4j`, password `gwa-dev-password`) |

The store's internal read-write endpoint (port 4002) is deliberately not published to the host. Ports are offset from the `grandstack` stack so both can run together.

## Develop

```sh
npm ci
npm run generate:api        # regenerate aura/src/generated/aura-api.d.ts from the spec
npm run typecheck
npm test                    # unit and contract tests, no database needed
```

The store's integration tests need a Neo4j. They are skipped unless `NEO4J_TEST_URI` is set, and they refuse to wipe a database that holds anything but this app's own labels:

```sh
podman run -d --rm --name gwa-neo4j-test -p 7688:7687 -e NEO4J_AUTH=neo4j/gwa-test-password neo4j:2026.10-community
NEO4J_TEST_URI=bolt://localhost:7688 NEO4J_TEST_PASSWORD=gwa-test-password npm run test:integration -w store
```

## Safety notes

- Never point development or tests at a real Aura account. Creates and deletes cost money and cannot be undone. Use mock-aura.
- The store's internal endpoint can change anything. It needs `INTERNAL_TOKEN` and must never be routed through the gateway or published.
- Instance passwords and the Aura client secret are never GraphQL fields. See PLAN.md section 6.
