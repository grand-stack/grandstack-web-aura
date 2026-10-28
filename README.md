# grandstack-web-aura

A mobile-friendly web UI for managing Neo4j Aura. A local Neo4j database **caches Aura's state**, so screens read from Neo4j. The Aura REST API (v1) is used to sync that state in and to apply changes you have reviewed and confirmed. Everything is served as one federated GraphQL supergraph.

Read [PLAN.md](PLAN.md) first. It holds the design, the graph model, the security decisions and the build phases.

## Status

Phases 1 to 3 are built and tested. Creating, editing and deleting instances is next.

| Part | What it is | State |
| --- | --- | --- |
| [docs/aura_api_spec_v1-2.yaml](docs/aura_api_spec_v1-2.yaml) | The real Aura API v1 OpenAPI file | In the repo. REST types are generated from it |
| [mock-aura/](mock-aura) | A fake Aura API for development and tests | Built. A contract test checks every response against the spec |
| [store/](store) | The store subgraph: Neo4j graph, public read-only schema, internal read-write schema | Built, tested against a real Neo4j |
| [aura/](aura) | The aura subgraph: connect, encrypted secret, token manager, sync into the store | Built, tested against a real Neo4j and mock-aura. Creating, editing and deleting instances is Phase 4 and 5 |
| [gateway/](gateway) | Hive Gateway serving the composed supergraph | Built. No sign-in yet (Phase 6) |
| [web/](web) | The React app: connect, gallery with filters, instance details, operations list, account page. Read-only | Built. Checked in a real browser on a phone and a desktop screen |

## Run it

The stack points at mock-aura by default, so no real Aura account is touched. Docker works as well as podman.

```sh
echo "SECRET_KEY=$(openssl rand -base64 32)" >> .env    # seals the Aura client secret. Keep it: a new key cannot open old secrets
podman compose -p gwa up -d --build neo4j store aura mock-aura
npm ci && npm run compose:supergraph                       # composes gateway/supergraph.graphql from the running subgraphs
podman compose -p gwa up -d --build gateway web
```

| URL | What |
| --- | --- |
| http://localhost:3100 | **The app.** Open this. First it asks for the Aura client ID and secret (for the fake Aura use `mock-client` and `mock-secret`) |
| http://localhost:4100/graphql | **The gateway**: the one endpoint for the web app. Setup, sync and the store's read-only data together |
| http://localhost:4001/graphql | The store's public, read-only subgraph |
| http://localhost:4010/graphql | The aura subgraph |
| http://localhost:4020/v1 | mock-aura. Credentials `mock-client` / `mock-secret`, token at `POST http://localhost:4020/oauth/token` |
| http://localhost:7475 | Neo4j Browser (user `neo4j`, password `gwa-dev-password`) |

Every published port is bound to 127.0.0.1, because there is no sign-in yet. The store's internal read-write endpoint (port 4002) is not published at all. Ports are offset from the `grandstack` stack (which uses 3000, 4000, 7474 and 7687) so both can run together.

Try it:

```sh
curl -s localhost:4100/graphql -H 'content-type: application/json' -d '{"query":"mutation { connectAura(clientId: \"mock-client\", clientSecret: \"mock-secret\") { connected syncRunId } }"}'
curl -s localhost:4100/graphql -H 'content-type: application/json' -d '{"query":"{ auraSetup { connected lastSyncStatus } instances { name statusGroup tenant { name } cloud { name } } }"}'
```

To use a real Aura account, set `AURA_BASE_URL=https://api.neo4j.io` and use a client id and secret from the Aura Console. Only do that on a machine you trust: the stack has no sign-in.

### The aura subgraph's settings

| Variable | Default | What it does |
| --- | --- | --- |
| `SECRET_KEY` | required | 32 bytes, base64. Seals the client secret (and later instance passwords) |
| `SECRET_KEY_VERSION` | `1` | Which key sealed a value, for rotation |
| `AURA_BASE_URL` | `https://api.neo4j.io` | Where Aura is. Must be https, unless `ALLOW_INSECURE_AURA_URL=true` (for mock-aura) |
| `SYNC_INTERVAL_MS` | `900000` | Time between automatic syncs. `0` turns the timer off |
| `SYNC_CONCURRENCY` | `3` | Instance detail requests in flight at once |
| `INTERNAL_TOKEN` | required | Bearer token for the store's internal endpoint |
| `NEO4J_URI`, `NEO4J_PASSWORD` | required | Bolt connection, used for secrets |

## Develop

```sh
npm ci
npm run generate:api        # regenerate aura/src/generated/aura-api.d.ts from the spec
npm run codegen -w web      # regenerate the web app's typed queries from the running gateway
npm run typecheck
npm test                    # unit and contract tests, no database needed
```

The integration tests need a Neo4j. They are skipped unless `NEO4J_TEST_URI` is set, and they refuse to wipe a database that holds anything but this app's own labels:

```sh
podman run -d --rm --name gwa-neo4j-test -p 7688:7687 -e NEO4J_AUTH=neo4j/gwa-test-password neo4j:2026.10-community
NEO4J_TEST_URI=bolt://localhost:7688 NEO4J_TEST_PASSWORD=gwa-test-password npm test
```

To check the web app in a real browser (needs Chrome and a fresh stack), see [web/e2e/README.md](web/e2e/README.md): `npm run e2e -w web`.

After a change to a subgraph's schema, recompose the supergraph (`npm run compose:supergraph`, with the stack up) and commit it.

## Safety notes

- Never point development or tests at a real Aura account. Creates and deletes cost money and cannot be undone. Use mock-aura.
- The store's internal endpoint can change anything. It needs `INTERNAL_TOKEN` and must never be routed through the gateway or published.
- The Aura client secret and instance passwords are never GraphQL fields and are stored only as ciphertext. See PLAN.md section 6.
- There is no sign-in until Phase 6. Do not expose the gateway or the app beyond your own machine.
