# Architecture of grandstack-web-aura

grandstack-web-aura is a mobile-friendly web UI for managing Neo4j Aura. A local Neo4j database **caches Aura's state**, so screens read from Neo4j and not from the Aura API. The Aura REST API (v1) is used to sync that state in and to apply changes a person has reviewed and confirmed. Everything is served as one federated GraphQL supergraph.

Applies to grandstack-web-aura v0.0.1 (React 19, Vite 8, urql 5, `@neo4j/graphql` 7 on Apollo Federation 2, Hive Gateway 2, TypeScript). The design decisions and the build history are in [PLAN.md](../PLAN.md); this page describes what exists.

## Stack

| Concern | Choice | Notes |
| --- | --- | --- |
| UI | React 19 + react-router 8 | Client-side routes; nginx falls back to `index.html`. |
| GraphQL client | urql 5 with `cacheExchange` and `fetchExchange` | Cache-and-network, so lists follow the store. |
| Types | GraphQL Code Generator, client preset | Typed operations are committed under `web/src/graphql/generated`. |
| Store subgraph | `@neo4j/graphql` 7, graphql-yoga | Serves the graph model. Two schemas from one file (public read-only, internal read-write). |
| Aura subgraph | `@apollo/subgraph`, graphql-yoga | Plans, confirms, runs changes, reveals passwords, checks drift. Owns the encryption key. |
| Gateway | Hive Gateway, composed with `mesh-compose` | `gateway/supergraph.graphql` is generated and committed. |
| Database | Neo4j 2026.10 (community) | The cache, plus history and sealed secrets. |
| Edge (optional) | nginx | TLS, Basic sign-in, rate limits, security headers. |
| Fake Aura | `mock-aura` | A fake of the Aura API, checked against Aura's own OpenAPI file. |
| Styling | Plain CSS with design tokens | `web/src/theme/tokens.css`, light, dark and follow-the-system. |
| Images | None | Posters and initials are generated in the browser. |

## The parts

| Workspace | What it is | Port (when published) |
| --- | --- | --- |
| `store/` | The graph model, constraints, the public read-only and internal read-write schemas | 4001 public, 4002 internal (never published) |
| `aura/` | The Aura REST client and token manager, sync, sealed secrets, operations, the aura subgraph | 4010 |
| `mock-aura/` | A fake Aura API for development and tests | 4020 |
| `gateway/` | Hive Gateway serving the composed supergraph | 4000 inside, 4100 with `compose.dev.yaml` |
| `web/` | The React app, served by nginx, which also forwards `/graphql` | 3100 (default) |
| `edge/` | Optional nginx in front of everything | 8443 |

[![The browser reaches the web server, optionally through the edge. The web server serves the app and forwards /graphql to the gateway, which composes the store subgraph and the aura subgraph. Only the aura subgraph talks to the Aura REST API. Neo4j holds the cache and sealed secrets.](diagrams/system-overview.svg)](diagrams/system-overview.svg)

*Figure: the parts and who talks to whom. Click the image for full size; the numbered notes below carry the same information as text.*

1. **The edge is optional.** With `compose.edge.yaml` it is the only way in, over TLS with a sign-in. Without it the browser talks plain HTTP to the web server on the same machine.
2. **The web server serves the app and forwards `/graphql`** to the gateway, so the app and its data share one origin in both modes. There is no CORS to get wrong and the browser sends its sign-in itself.
3. **The gateway composes two subgraphs** into one supergraph. It has a browser query editor in its default configuration; here it is turned off.
4. **The store subgraph is read-only to the world.** Every node type has `@mutation(operations: [])`. The same schema file also builds an internal read-write endpoint on port 4002, which needs a bearer token and is never published or routed through the gateway. Only the aura subgraph calls it.
5. **The aura subgraph is the only thing that talks to Aura**, and the only thing that holds the key that seals secrets. All writes to Aura happen in its reconciler, after a confirm.
6. **Neo4j holds the cache and the sealed secrets.** The secrets are nodes (`AuraSecret`, `InstanceCredential`, `AuditEvent`) that are not in any GraphQL schema; the aura subgraph reaches them over Bolt.
7. **What is published** is decided by the compose files: the web server on loopback by default, the edge only with `compose.edge.yaml`, and nothing else unless `compose.dev.yaml` is added for development.

## Folder map

```
store/
  schema/schema.graphql      the graph model, with descriptions on every type and field
  setup/constraints.cypher   uniqueness constraints and indexes, run at every start
  src/schemas.ts             builds the public (read-only) and internal (read-write) schemas from the one file
aura/
  src/client.ts              the Aura REST client: token, retries, Retry-After, 409, 404
  src/sync.ts                Aura into the store: tenants, options, instances
  src/service.ts             connect, disconnect, sync now, reveal a password, check against Aura, the sync timer
  src/crypto.ts, secrets.ts  AES-256-GCM sealing, and the secret nodes over Bolt
  src/schema.ts              the aura subgraph's GraphQL
  src/operations/            plan, confirm, run, recover: state.ts, diff.ts, plan.ts, run.ts, service.ts, store.ts
  src/generated/             types from the OpenAPI file (never edit)
mock-aura/
  src/                       the fake API, its seed data, and its test controls (/__faults, /__passwords)
gateway/
  gateway.config.ts          upstream addresses and options
  supergraph.graphql         GENERATED by `npm run compose:supergraph`; commit it
web/
  src/pages/                 one component per route
  src/lib/                   pure logic with unit tests: filters, status, format, changes, create, operations, theme
  src/ui/                    buttons, chips, modal, instance card, password field, icons
  src/graphql/documents.ts   every operation; typed output in src/graphql/generated (committed, never edit)
  e2e/run.mjs                real-browser checks
edge/
  default.conf.template      the nginx server block, filled in from the environment
  security-headers.conf      one set of headers, shared with the web server
  check.mjs                  checks of what the edge promises
docs/
  aura_api_spec_v1-2.yaml    the real Aura API spec, the source of truth for the REST API
scripts/init-env.sh          makes .env, and with --edge the certificate and sign-in
compose.yaml, compose.edge.yaml, compose.dev.yaml
```

## The graph model

Observed state is separate from intent. `Instance` is what Aura said; `Operation` is what a person asked for.

```
(:AuraAccount)-[:HAS_TENANT]->(:Tenant)-[:HAS_INSTANCE]->(:Instance)
(:Tenant)-[:OFFERS]->(:InstanceConfiguration)      what the tenant may create: cloud, region, tier, size, version
(:Instance)-[:ON_CLOUD]->(:CloudProvider)           tags for filtering
(:Instance)-[:HAS_TIER]->(:Tier)
(:Instance)-[:HAS_CREDENTIAL]->(:InstanceCredential)    sealed password; not in GraphQL
(:Operation)-[:TARGETS]->(:Instance)                absent until a create has made one
(:Operation)-[:HAS_STEP]->(:OperationStep)          six steps, shown as progress
(:SyncRun)                                          one per sync, with counts and an outcome
```

- **Instances Aura no longer lists are kept.** They get `deletedInAuraAt`, so history survives; the interface shows them as removed.
- **Timestamps are ISO 8601 UTC strings with milliseconds**, not the `DateTime` scalar, which needs the APOC plugin. Milliseconds stop two runs in the same second tying.
- **`Instance.version` is usually empty.** Aura's instance details do not carry the Neo4j version; only instances created here record one.
- The full model, with every property, is in `store/schema/schema.graphql` and [PLAN.md](../PLAN.md#5-graph-model).

## Routes

| Path | Page | Purpose |
| --- | --- | --- |
| `/` | Home | Hero search, tag chips with counts, rows of cards ("Needs attention", "Running"), New instance |
| `/instances` | Results | The gallery with filters in the URL |
| `/instances/new` | Create | The create stepper |
| `/instances/:id` | Detail | Connection (with the password eye), properties, check against Aura, actions, changes made here |
| `/instances/:id/edit` | Edit | Name, size, switches; asks for a plan |
| `/operations` | Operations | Every change, with state filters |
| `/operations/:id` | OperationPage | Review, then progress, then the result |
| `/account` | Account | The connection, stored-copy counts, recent syncs, replace credentials, disconnect |

Before an account is connected, the app shows only the connect form; after credentials are stored but before the first sync finishes, it shows the first-sync screen.

## Data flow

Three kinds of data move, and they take different paths:

1. **Reads** go browser, gateway, store subgraph, Neo4j. They never touch Aura. A sync (every 15 minutes, or on Sync now) refreshes what they read.
2. **Changes** go browser, gateway, aura subgraph. A plan writes an `Operation` and returns its id; a confirm starts the reconciler; the browser then reads the operation and its steps like any other data. See [features](features.md#plan-review-confirm).
3. **Secrets** go browser, gateway, aura subgraph, Bolt. The client secret is write-only. An instance password leaves the store through exactly one mutation, `revealInstancePassword`. See [features](features.md#showing-a-stored-password).

State that a person might want to share or reload lives in the **URL** (the gallery's filters, the page you are on). The only browser-stored state is the theme choice.

## Caching and freshness

The urql client uses `cache-and-network`: pages show cached data at once and always refetch. Pages also refetch when a sync finishes (`useRefreshOnSync`). An operation in progress is polled every 1.5 seconds; the connection state is polled every second while a sync runs and every 30 seconds otherwise. Reading never calls Aura, so the number of people using the app does not change Aura's load.

## Security model

- **The Aura client secret** is sealed with AES-256-GCM, with the owner bound in as authenticated data, so a copied value will not open on another record. It is stored as a node over Bolt, never returned by any query, log or error, and read only for the call that needs a token.
- **Instance passwords** are sealed the same way, with the instance id as the owner, and stored the moment Aura returns them (it returns them once). Every reveal is recorded before the password is returned.
- **The key** is `SECRET_KEY` (32 bytes, base64). Values record the key version that sealed them. Losing the key means the sealed values cannot be opened.
- **Nothing reaches Aura without a confirm**, and a delete also needs the instance's name typed, checked on the server.
- **Network exposure** is a deployment choice, shown below.

## Build and deploy

Every image is pinned to an exact version **and** a digest. The web image builds the app and serves it with unprivileged nginx on port 8080; the edge image adds nothing but configuration. `VITE_GRAPHQL_URL` is empty by default, so the app calls `/graphql` on its own origin.

[![By default the browser talks plain HTTP to the web server on the same machine. With the edge, the web server and gateway are not published and the edge is the only way in.](diagrams/deployment-modes.svg)](diagrams/deployment-modes.svg)

*Figure: the two ways to run it. Click the image for full size; the numbered notes below carry the same information as text.*

1. **The default publishes only the web server**, on `127.0.0.1:3100`, over plain HTTP.
2. **There is no sign-in and no TLS in that mode.** It is for one person on their own machine. `WEB_BIND=0.0.0.0` would open it to the network with nothing in the way.
3. **The edge** (`compose.edge.yaml`) adds TLS 1.2+, an HTTP Basic sign-in from a bcrypt list, 20 requests a second per address, and 60 POSTs a minute (the changes). It refuses to start without a certificate and a hashed sign-in list.
4. **Behind the edge the web server and gateway are not published.** Compose's `!reset` removes the web server's port.
5. **The edge adds** a strict content security policy, no framing, no sniffing, no referrer, `no-store` on GraphQL answers (one may hold a password), a 64 kB body limit on `/graphql`, and it never forwards the sign-in to the upstreams.

How to set up each mode, serve a phone, and what the sign-in does and does not protect: [deploying.md](deploying.md).

Next: [features](features.md), [customising](customising.md), [recipes](recipes.md), [testing](testing.md).
