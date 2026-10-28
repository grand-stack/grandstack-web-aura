# grandstack-web-aura

A mobile-friendly web UI for managing Neo4j Aura. A local Neo4j database **caches Aura's state**, so screens read from Neo4j. The Aura REST API (v1) is used to sync that state in and to apply changes you have reviewed and confirmed. Everything is served as one federated GraphQL supergraph.

Read [PLAN.md](PLAN.md) first. It holds the design, the graph model, the security decisions and the build phases.

## Status

Phases 1 to 6 are built and tested. You can create, edit, pause, resume and delete an instance, each with a review and an explicit confirm (a delete also needs the name typed), and show the password Aura gave when an instance was created. It runs on plain HTTP on your machine by default, with an optional edge that adds TLS and a sign-in, and has CI. Not yet done: trying it against a real Aura account and on real phones (see docs/real-account-checklist.md).

| Part | What it is | State |
| --- | --- | --- |
| [docs/aura_api_spec_v1-2.yaml](docs/aura_api_spec_v1-2.yaml) | The real Aura API v1 OpenAPI file | In the repo. REST types are generated from it |
| [mock-aura/](mock-aura) | A fake Aura API for development and tests | Built. A contract test checks every response against the spec |
| [store/](store) | The store subgraph: Neo4j graph, public read-only schema, internal read-write schema | Built, tested against a real Neo4j |
| [aura/](aura) | The aura subgraph: connect, encrypted secret, token manager, sync into the store | Built, tested against a real Neo4j and mock-aura. Plans, confirms and reconciles create, edit, pause, resume and delete. Stores and reveals instance passwords |
| [gateway/](gateway) | Hive Gateway serving the composed supergraph | Built. Not published: only the edge reaches it |
| [edge/](edge) | Optional (`compose.edge.yaml`): nginx in front of everything with TLS, Basic sign-in, rate limits, security headers | Built, checked by `edge/check.mjs` and CI |
| [web/](web) | The React app: connect, gallery with filters, instance details, create, edit, review and progress screens, password reveal, operations list, account page | Built. Checked in a real browser on a phone and a desktop screen |

## Run it

The stack points at mock-aura by default, so no real Aura account is touched. Docker works as well as podman.

```sh
scripts/init-env.sh                        # .env: the key that seals secrets, the database password, a token
podman compose -p gwa up -d --build        # then open http://localhost:3100
```

**By default the app is plain HTTP with no sign-in, on this machine only** (`127.0.0.1:3100`). That is fine for you on your own laptop and not for anything else: whoever can open the page can create and delete instances. The web server also forwards `/graphql` to the gateway, so the app and its data share one origin. The gateway, subgraphs, Neo4j and mock-aura are on the compose network and are not published. The first screen asks for the Aura client ID and secret (for the fake Aura use `mock-client` and `mock-secret`).

`scripts/init-env.sh` needs `openssl`. It never replaces a secret that already exists, because a new `SECRET_KEY` cannot open what the old one sealed. Back `.env` up with the database volume.

### The edge: TLS and a sign-in (to reach it from a phone or another machine)

To serve other devices, put the edge in front. It adds TLS, an HTTP Basic sign-in, rate limits and stricter headers, and the app is then no longer published on its own port:

```sh
scripts/init-env.sh --edge                                   # also a certificate for localhost and the sign-in; prints the password once
podman compose -p gwa -f compose.yaml -f compose.edge.yaml up -d --build    # https://localhost:8443
```

`--edge` needs `htpasswd` as well (from `apache2-utils` on Linux; macOS has it). The certificate is self-signed, so a browser warns once. To reach it from a phone on the same network, add the laptop's address to the certificate and publish on the network:

```sh
EDGE_SAN="IP:192.168.0.5,DNS:mylaptop.local" scripts/init-env.sh --new-cert
echo "EDGE_BIND=0.0.0.0" >> .env
podman compose -p gwa -f compose.yaml -f compose.edge.yaml up -d --force-recreate edge
```

Read [docs/deploying.md](docs/deploying.md) before doing that: it says what the sign-in does and does not protect. Plain HTTP can be opened to the network too (`WEB_BIND=0.0.0.0`), but then there is nothing in the way at all.

### Developing against the services directly

`compose.dev.yaml` also publishes the services on loopback only, with no sign-in. Never use it where other people can reach the machine, or in a deployment. It combines with either mode:

```sh
podman compose -p gwa -f compose.yaml -f compose.dev.yaml up -d --build
```

| URL | What |
| --- | --- |
| http://localhost:4100/graphql | The gateway, for codegen, `npm run dev -w web` and curl |
| http://localhost:4001/graphql | The store's public, read-only subgraph |
| http://localhost:4010/graphql | The aura subgraph |
| http://localhost:4020/v1 | mock-aura. Credentials `mock-client` / `mock-secret`, token at `POST http://localhost:4020/oauth/token` |
| http://localhost:7475 | Neo4j Browser (user `neo4j`, password in `.env`) |

The store's internal read-write endpoint (port 4002) is never published. Ports are offset from the `grandstack` stack (which uses 3000, 4000, 7474 and 7687) so both can run together.

```sh
curl -s localhost:4100/graphql -H 'content-type: application/json' -d '{"query":"mutation { connectAura(clientId: \"mock-client\", clientSecret: \"mock-secret\") { connected syncRunId } }"}'
curl -s localhost:4100/graphql -H 'content-type: application/json' -d '{"query":"{ auraSetup { connected lastSyncStatus } instances { name statusGroup tenant { name } cloud { name } } }"}'
```

To use a real Aura account, set `AURA_BASE_URL=https://api.neo4j.io` and use a client id and secret from the Aura Console. Do that only after reading [docs/real-account-checklist.md](docs/real-account-checklist.md).

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

The integration tests need a Neo4j. They are skipped unless `NEO4J_TEST_URI` is set, and they refuse to wipe a database that holds anything but this app's own labels (CI runs them against a Neo4j service container, see [.github/workflows/ci.yml](.github/workflows/ci.yml)):

```sh
podman run -d --rm --name gwa-neo4j-test -p 7688:7687 -e NEO4J_AUTH=neo4j/gwa-test-password neo4j:2026.10-community
NEO4J_TEST_URI=bolt://localhost:7688 NEO4J_TEST_PASSWORD=gwa-test-password npm test
```

To check the web app in a real browser (needs Chrome and a fresh stack), see [web/e2e/README.md](web/e2e/README.md): `npm run e2e -w web` (add `BASE_URL=https://localhost:8443 E2E_PASSWORD=...` to run through the edge). To check what the edge promises (sign-in, headers, closed ports): `EDGE_PASSWORD=... node edge/check.mjs`.

After a change to a subgraph's schema, start the stack with the dev file, recompose the supergraph (`npm run compose:supergraph`) and commit it. CI fails if the committed file is not what the running subgraphs compose to.

## Safety notes

- Never point development or tests at a real Aura account. Creates and deletes cost money and cannot be undone. Use mock-aura.
- By default the app is plain HTTP with no sign-in, on loopback. With the edge (`compose.edge.yaml`) everything is behind TLS and a sign-in. Either way the gateway, subgraphs and database have no sign-in of their own and are not published, except by `compose.dev.yaml`.
- The store's internal endpoint can change anything. It needs `INTERNAL_TOKEN` and must never be routed through the gateway or published.
- The Aura client secret and instance passwords are never GraphQL fields and are stored only as ciphertext. See PLAN.md section 6.
- One sign-in means one level of access: anyone who can sign in can delete instances. There is no view-only role yet.
