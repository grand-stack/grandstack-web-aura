# grandstack-web-aura

A mobile-friendly web UI for managing Neo4j Aura, and a GRANDstack setup: a local Neo4j database **caches Aura's state**, so screens read from Neo4j. The Aura REST API (v1) is used to sync that state in and to apply changes you have reviewed and confirmed. Everything is served as one federated GraphQL supergraph.

It is built from the GRANDstack parts, not beside them:

- **`grandstack-server`** serves the Aura graph model (`MODEL=aura`, from [models/aura](models/aura)) over Neo4j, once read-only and once writable.
- **`grandstack-federation`**'s gateway composes that server with the Aura subgraph in this repository, using this repository's supergraph and gateway config.
- **`grandstack`** holds the compose files: `compose.aura.yaml` and `compose.aura-edge.yaml` run it.

> **Needs three sibling repositories on the branch that adds `MODEL` and `READ_ONLY`.** Until those are merged, check out the `aura-model` branch of `grandstack`, `grandstack-server` and `grandstack-federation`. See [Run it](#run-it).

Read [docs/architecture.md](docs/architecture.md) first. [PLAN.md](PLAN.md) holds the design decisions and the build history.

## Status

Phases 1 to 6 are built and tested. You can create, edit, pause, resume and delete an instance, each with a review and an explicit confirm (a delete also needs the name typed), and show the password Aura gave when an instance was created. It runs on plain HTTP on your machine by default, with an optional edge that adds TLS and a sign-in, and has CI. Not yet done: trying it against a real Aura account on real changes, and on real phones (see docs/real-account-checklist.md).

| Part | What it is | State |
| --- | --- | --- |
| [docs/aura_api_spec_v1-2.yaml](docs/aura_api_spec_v1-2.yaml) | The real Aura API v1 OpenAPI file | In the repo. REST types are generated from it |
| [models/aura](models/aura) | The graph model: schema, setup Cypher and `model.json` that `grandstack-server` loads with `MODEL=aura` | Built. The server is a sibling repository |
| [aura/](aura) | The Aura subgraph: connect, encrypted secret, token manager, sync into the store, plan, confirm and reconcile create, edit, pause, resume and delete, show stored passwords | Built, tested against a real Neo4j, the real server and mock-aura |
| [mock-aura/](mock-aura) | A fake Aura API for development and tests | Built. A contract test checks every response against the spec |
| [gateway/](gateway) | `supergraph.graphql` and the gateway config, mounted into `grandstack-federation`'s gateway image | Built |
| [web/](web) | The React app: connect, gallery with filters, instance details, create, edit, review and progress screens, password reveal, operations list, account page | Built. Checked in a real browser on a phone and a desktop screen |
| [edge/](edge) | Optional: nginx in front of everything with TLS, Basic sign-in, rate limits, security headers | Built, checked by `edge/check.mjs` |

## Documentation

| Read | To learn |
| --- | --- |
| [Architecture](docs/architecture.md) | The parts and how they fit, the graph model, routes, data flow, the security model, how it is deployed |
| [Features](docs/features.md) | How each feature works and where the code is: sync, plan and confirm, create, delete, the password, drift |
| [Customising](docs/customising.md) | What is generic, the look, names, every setting, using the fake or a real Aura, adapting the pattern |
| [Recipes](docs/recipes.md) | Step-by-step common changes, from showing a new field to adding a kind of change |
| [Testing](docs/testing.md) | Type checks, codegen, unit and contract tests, integration tests with Neo4j, the edge checks, the browser run |
| [Deploying](docs/deploying.md) | The two ways to run it, what the sign-in does and does not protect, a real hostname, backups |
| [Real account checklist](docs/real-account-checklist.md) | What has and has not been checked against real Aura, and a safe first run |
| [PLAN.md](PLAN.md) | The design decisions and how the project was built, phase by phase |

Working with a coding agent? Start with [AGENTS.md](AGENTS.md).

## Run it

The stack points at mock-aura by default, so no real Aura account is touched. Docker works as well as podman. Clone the repositories **side by side into one folder**, as for any GRANDstack setup (the compose files build the others from their sibling folders):

```sh
mkdir grand-stack && cd grand-stack
for repo in grandstack grandstack-server grandstack-federation grandstack-web-aura; do git clone https://github.com/grand-stack/$repo; done
# until MODEL and READ_ONLY are merged: the same branch in three of them
for repo in grandstack grandstack-server grandstack-federation; do git -C $repo checkout aura-model; done
cd grandstack-web-aura && scripts/init-env.sh && cd ../grandstack     # writes SECRET_KEY into grandstack/.env
docker compose -f compose.yaml -f compose.aura.yaml up --build
```

| Open | To see |
| --- | --- |
| http://localhost:3000 | **The app.** The first screen asks for the Aura client ID and secret (for the fake Aura use `mock-client` and `mock-secret`) |
| http://localhost:4000/graphql | The gateway: the one GraphQL endpoint (the app reaches it through its own web server) |
| http://localhost:4001/graphql | The read-only server, for development and for `npm run compose:supergraph` |
| http://localhost:4010/graphql | The Aura subgraph |
| http://localhost:4020/v1 | mock-aura. Credentials `mock-client` / `mock-secret` |
| http://localhost:7474 | Neo4j Browser (user `neo4j`, password from `.env`, default `grandstack-dev`) |

**By default the app is plain HTTP with no sign-in, and everything is published on this machine only** (`127.0.0.1`). That is fine for you on your own laptop and not for anything else: whoever can open the page can create and delete instances. The writable server publishes no port and is on a private network with Neo4j and the Aura subgraph. It replaces the other GRANDstack setups on ports 3000 and 4000, and uses its own Neo4j volume, so Movies and Aura data never mix. `docker compose ... down -v` deletes the Aura data and the stored (sealed) secrets.

`scripts/init-env.sh` needs `openssl`. It never replaces a secret that already exists, because a new `SECRET_KEY` cannot open what the old one sealed. Back `grandstack/.env` up with the database volume.

### The edge: TLS and a sign-in (to reach it from a phone or another machine)

To serve other devices, put the edge in front. It adds TLS, an HTTP Basic sign-in, rate limits and stricter headers, and nothing else is then published:

```sh
(cd ../grandstack-web-aura && scripts/init-env.sh --edge)      # also a certificate for localhost and the sign-in; prints the password once
docker compose -f compose.yaml -f compose.aura.yaml -f compose.aura-edge.yaml up --build    # https://localhost:8443
```

`--edge` needs `htpasswd` as well (from `apache2-utils` on Linux; macOS has it). The certificate is self-signed, so a browser warns once. To reach it from a phone on the same network, add the laptop's address to the certificate and publish on the network:

```sh
(cd ../grandstack-web-aura && EDGE_SAN="IP:192.168.0.5,DNS:mylaptop.local" scripts/init-env.sh --new-cert)
echo "EDGE_BIND=0.0.0.0" >> .env
docker compose -f compose.yaml -f compose.aura.yaml -f compose.aura-edge.yaml up -d --force-recreate edge
```

Read [docs/deploying.md](docs/deploying.md) before doing that: it says what the sign-in does and does not protect.

### Trying the API

```sh
curl -s localhost:4000/graphql -H 'content-type: application/json' -d '{"query":"mutation { connectAura(clientId: \"mock-client\", clientSecret: \"mock-secret\") { connected syncRunId } }"}'
curl -s localhost:4000/graphql -H 'content-type: application/json' -d '{"query":"{ auraSetup { connected lastSyncStatus } instances { name statusGroup tenant { name } cloud { name } } }"}'
```

To use a real Aura account, set `AURA_BASE_URL=https://api.neo4j.io` in `grandstack/.env` and use a client id and secret from the Aura Console. Do that only after reading [docs/real-account-checklist.md](docs/real-account-checklist.md).

### The Aura subgraph's settings

| Variable | Default | What it does |
| --- | --- | --- |
| `SECRET_KEY` | required | 32 bytes, base64. Seals the client secret and instance passwords |
| `SECRET_KEY_VERSION` | `1` | Which key sealed a value, for rotation |
| `AURA_BASE_URL` | the fake Aura | `https://api.neo4j.io` for a real account. Must be https, unless `ALLOW_INSECURE_AURA_URL=true` (for mock-aura) |
| `SYNC_INTERVAL_MS` | `900000` | Time between automatic syncs. `0` turns the timer off |
| `SYNC_CONCURRENCY` | `3` | Instance detail requests in flight at once |
| `STORE_WRITER_URL` | `http://store-writer:4000/graphql` | The writable server |
| `NEO4J_URI`, `NEO4J_PASSWORD` | required | Bolt connection, used for secrets |

## Develop

```sh
npm ci
npm run generate:api        # regenerate aura/src/generated/aura-api.d.ts from the spec
npm run codegen -w web      # regenerate the web app's typed queries from the running gateway
npm run typecheck
npm test                    # unit and contract tests, no database needed
npm run docs:check          # relative links, anchors and every diagram
```

The integration tests need a Neo4j **and** a built `grandstack-server` beside this repository (on the branch with `MODEL`: run `npm ci && npm run build` there). They start two real server processes on the Aura model, are skipped unless `NEO4J_TEST_URI` is set, and refuse to wipe a database that holds anything but this app's own labels:

```sh
podman run -d --rm --name gwa-neo4j-test -p 7688:7687 -e NEO4J_AUTH=neo4j/gwa-test-password neo4j:2026.10-community
NEO4J_TEST_URI=bolt://localhost:7688 NEO4J_TEST_PASSWORD=gwa-test-password npm test
```

To check the web app in a real browser (needs Chrome and a fresh stack), see [web/e2e/README.md](web/e2e/README.md): `BASE_URL=http://localhost:3000 npm run e2e -w web` (add `BASE_URL=https://localhost:8443 E2E_PASSWORD=...` to run through the edge). To check what the edge promises (sign-in, headers, closed ports): `EDGE_PASSWORD=... node edge/check.mjs`.

After a change to a subgraph's schema, start the stack, recompose the supergraph (`npm run compose:supergraph`) and commit it.

## Safety notes

- Never point development or tests at a real Aura account. Creates and deletes cost money and cannot be undone. Use mock-aura.
- By default the app is plain HTTP with no sign-in, on loopback. With the edge (`compose.aura-edge.yaml`) everything is behind TLS and a sign-in and nothing else is published. Either way the gateway, servers and database have no sign-in of their own.
- The writable server can change anything. It is on a private network with Neo4j and the Aura subgraph only, publishes no port, and must never be routed through the gateway.
- The Aura client secret and instance passwords are never GraphQL fields and are stored only as ciphertext. See PLAN.md section 6.
- One sign-in means one level of access: anyone who can sign in can delete instances. There is no view-only role yet.
