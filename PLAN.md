# grandstack-web-aura: plan

A mobile-friendly web UI for managing Neo4j Aura. A local Neo4j database is a **store that caches Aura's state**, so the UI reads from Neo4j and rarely needs to read the Aura API. The Aura REST API (v1) is used to sync that state into the store and to apply changes. Everything is exposed through one federated GraphQL supergraph.

Reads come from the store. The Aura API is called only to sync, to apply a confirmed change, and on an explicit refresh.

Status: **This repository now runs as a GRANDstack setup (phase 7, below): the store is `grandstack-server` with `MODEL=aura`, the gateway is `grandstack-federation`'s image, and the compose files are `compose.aura.yaml` in the `grandstack` repository. Sections 3 to 5 and the earlier phases describe the design as it was built; where they mention a store service, an internal endpoint with a token, or this repository's own compose files, read phase 7 for what replaced them.** Phases 1 (foundations), 2 (setup and sync, backend), 3 (read-only web app) 4 (plan and confirm), 5 (create and delete) and 6 (hardening, with two parts not yet done) are built and tested** (section 11). Everything after them is still plan only. See [README.md](README.md) for how to run it, and [docs/architecture.md](docs/architecture.md) for what exists today.

## 1. Spec check

The plan has been checked against the real Aura API v1 OpenAPI file (`aura_api_spec_v1-2.yaml`, OpenAPI 3.0.0), which you supplied. This replaces my earlier guesses from the Go client skill and third-party mirrors. It is saved in the repo as `docs/aura_api_spec_v1-2.yaml`, and the REST client types are generated from it.

Still not in the spec, so still unverified: token lifetime and rate limits. The Aura API overview page gives 25 requests/min for free and trial accounts and 125 requests/min for paid tiers.

## 2. What the Aura API gives us (v1)

- Base URL `https://api.neo4j.io/v1`. OAuth2 client credentials, token URL `https://api.neo4j.io/oauth/token`, then a bearer token. POST and PATCH need `Content-Type: application/json`, including pause and resume (send `{}`).
- The spec calls tenants "projects" in its tags and `tenants` in its paths.

| Area | Endpoints |
| --- | --- |
| Instances | `GET /instances` (summary only, optional `?tenantId=`), `POST /instances`, `GET`, `PATCH` and `DELETE /instances/{id}`, `POST` `.../pause`, `.../resume`, `.../overwrite`, `.../upgrade`, and `POST /instances/sizing` (data science types only) |
| Snapshots | `GET` and `POST /instances/{id}/snapshots` (list defaults to today, `?date=`), `GET .../snapshots/{snapshotId}`, `POST .../snapshots/{snapshotId}/restore` |
| Projects | `GET /tenants`, `GET /tenants/{id}` (includes `instance_configurations`), `GET /tenants/{id}/metrics-integration` |
| Customer managed keys | `GET` and `POST /customer-managed-keys`, `GET` and `DELETE /customer-managed-keys/{id}` |
| GDS sessions | `GET` and `POST /graph-analytics/sessions`, `POST .../sessions/sizing`, `GET` and `DELETE .../sessions/{id}` |

Facts that shape the design:

- **The list is a summary.** `GET /instances` returns only id, name, tenant, cloud provider and created time. Status, region, type, memory and storage need `GET /instances/{id}` per instance. This drives the sync cost (section 7).
- **Instance status** has 13 values: `creating`, `destroying`, `running`, `pausing`, `paused`, `suspending`, `suspended`, `resuming`, `loading`, `loading failed`, `restoring`, `updating`, `overwriting`. Stable: `running`, `paused`, `suspended`. Failed: `loading failed`. Everything else is in progress.
- **Instance `type`** (our "tier") is one of `free-db`, `professional-db`, `professional-ds`, `business-critical`, `enterprise-db` (this is Virtual Dedicated Cloud) and `enterprise-ds`.
- **Create** (`POST /instances`, 202, asynchronous). Required: `version`, `region`, `memory`, `name` (1 to 30 characters), `type`, `tenant_id`, `cloud_provider`. Optional: `storage` (in the examples, not for free), `source_instance_id` and `source_snapshot_id` (clone), `customer_managed_key_id` (VDC and DS enterprise), `vector_optimized`, `graph_analytics_plugin`. The response holds `id`, `connection_url`, `username` and **`password`**. Errors to handle: 400 `missing-billing-details`, and 405 when creating is not allowed (for example an instance limit).
- **Edit** (`PATCH /instances/{id}`): `name`, `memory`, `storage`, `vector_optimized`, `graph_analytics_plugin`. Returns 200 for a rename and 202 for a resize, and the instance stays available. The examples also show `secondaries_count` and `cdc_enrichment_mode`, which are missing from the request schema, so treat those two as unconfirmed.
- **Pause, resume, overwrite and restore** return 202 with the instance in a transitional status. A second operation while one is running gets **409** `ongoing-database-operation`.
- **Delete** returns 202 with status `destroying`. Treat **404 as completion** when retrying. Irreversible, and Aura cannot recover the data.
- **Upgrade** (`POST .../upgrade`, 200) turns Professional into Business Critical, optionally with `memory` and `storage` together (both or neither).
- **Instance configurations** from `GET /tenants/{id}`: each has `region`, `region_name`, `type`, `memory`, `storage`, `version` and `cloud_provider`, all required. Memory and storage come as pairs.
- **Extra instance fields:** `metrics_integration_url`, `customer_managed_key_id`, `graph_nodes` and `graph_relationships` (free only), `secondaries_count` (VDC only), `cdc_enrichment_mode` (VDC and Business Critical), `vector_optimized`, `graph_analytics_plugin`. Storage is not returned for free instances.
- **Errors:** `{ "errors": [{ "message", "reason", "field" }] }`, or `{ "error": "..." }` from the gateway middleware. 429 carries a `Retry-After` header. 5xx are worth retrying.

## 3. Architecture

```
 phone / desktop browser
        |
   web (React, static)  --->  Gateway (Hive Gateway, supergraph)
                                 |                 |
                          store subgraph       aura subgraph
                          @neo4j/graphql       graphql-yoga + @apollo/subgraph
                          (Federation 2)       REST wrapper + reconciler
                                 |                 |
                          local Neo4j           Aura API v1
```

Reuse the approach in `grandstack-federation`: Hive Gateway, `mesh-compose` to build a committed `supergraph.graphql`, and `@apollo/subgraph` pinned to the version that works with `@neo4j/graphql` (2.14.4 at the time of writing; check that repo's AGENTS.md).

**Store subgraph.** The cache and the source for every screen: tenants, instances, instance configurations, operations. CRUD over the graph, generated from type definitions by the Neo4j GraphQL library. It is the only owner of the schema, and it serves the gallery, filters and form options straight from Neo4j. **It serves two schemas built from the one schema file:**
- A **public, read-only** subgraph (port 4001) that goes into the supergraph. Every node type has its generated mutations switched off, so the browser can read the store but never change it.
- An **internal read-write** endpoint (port 4002) with full create, update and delete. It needs a bearer token, is never published to the host and is never routed through the gateway. Only the aura subgraph calls it.

This keeps "plan, review, confirm" honest: the browser cannot flip an operation to CONFIRMED or edit an instance by calling a generated mutation. All changes go through the aura subgraph's own mutations.

**Aura subgraph.** A hand-written subgraph that wraps the REST API.
- It holds the **sync** (Aura to store) and the **apply** logic (the reconciler).
- It exposes `live` data only for an explicit refresh or a drift check, not for normal screens.
- It writes the store through the store's **internal** endpoint, not through the gateway. The one exception is secrets (section 6), which it reaches over Bolt.

**Federation payoff.** `Instance` is an entity (`@key(fields: "auraId")`) owned by the store. The aura subgraph contributes a `live` field, so one query can return the cached config plus current Aura state. The UI uses this for the detail page's "check with Aura" and to show drift when they differ.

**Cache rules.**
- Every cached node carries `syncedAt`, and the UI shows how old the data is.
- Refresh triggers: first connect, a timer, the refresh button, and after every operation finishes (the reconciler re-reads that instance from Aura).
- If Aura rejects a request because a stored configuration is out of date (for example a size is no longer offered), refresh that tenant's configurations once and ask the person to choose again.

The reconciler runs inside the aura subgraph process (decision 3).

## 4. Flows

**First start (setup).**
1. The gateway reports `setup { required }`. The UI shows only a credentials form.
2. `configureAura(clientId, clientSecret)` is write-only. The aura subgraph tries the token endpoint. On failure it returns an error and stores nothing.
3. On success it stores the credentials (section 6) and starts a **sync run**: list tenants, get each tenant's detail and store **all of its instance configurations**, list instances, get details, and upsert everything into the store through the store subgraph.
4. The UI shows sync progress, then the instance list.

**Change (create, update, delete, pause, resume).** The user never calls Aura directly.
1. `planChange(...)` creates an `Operation` in `PLANNED` with the desired state and a computed diff against the stored instance. It checks the desired state against the stored `InstanceConfiguration`s and rejects combinations that are not offered. It makes no Aura call.
2. The UI shows a review screen: the diff, cost or region warnings, and for delete a type-the-name confirmation.
3. `confirmOperation(id)` moves it to `CONFIRMED`. Only now does the reconciler call Aura.
4. The reconciler records `OperationStep` nodes (request sent, accepted, polling, status changes) and finishes in `SUCCEEDED` or `FAILED`. On success it refreshes the instance in the store.
5. The UI shows a live timeline for the operation. It polls in v1 and moves to SSE subscriptions later.

Guard rails: an operation can only be confirmed while its target's stored version has not changed since planning (otherwise re-plan), and only one active operation per instance. This matches Aura, which answers a second operation with 409.

**Operation kinds.** In v1: create, update (rename, memory and storage, vector optimization, graph analytics plugin), pause, resume, delete. Later, with the model already allowing for them: clone and overwrite, upgrade to Business Critical, snapshot create and restore, customer managed key create and delete, GDS session create and delete.

**How the reconciler finishes an operation.** Poll `GET /instances/{id}` until the status is stable (`running` or `paused`/`suspended` as expected). `loading failed` is a failure. For delete, 404 means done. On 409, mark the step "another operation is in progress" rather than retrying blindly. Rate-limit and 5xx retries use `Retry-After` when present.

## 5. Graph model

Designed for the whole Aura API, built for instances only in v1.

```
(:AuraAccount {id, label, connectedAt, lastSyncAt})
   -[:HAS_TENANT]-> (:Tenant {auraId, name, configsSyncedAt})
        -[:OFFERS]-> (:InstanceConfiguration {key, cloudProvider, region, regionName, type, memory, storage, version, syncedAt})
        -[:HAS_METRICS]-> (:MetricsEndpoint {url})                                               // later, GET /tenants/{id}/metrics-integration
        -[:HAS_INSTANCE]-> (:Instance {auraId, name, status, connectionUrl, region, memory, storage, version,
                                       vectorOptimized, graphAnalyticsPlugin, secondariesCount, cdcEnrichmentMode,
                                       metricsIntegrationUrl, graphNodes, graphRelationships,
                                       createdAt, syncedAt, deletedInAuraAt})
             -[:ON_CLOUD]-> (:CloudProvider {name})        // facet: gallery tag (gcp, aws, azure)
             -[:HAS_TIER]-> (:Tier {type, label})          // facet: gallery tag; type is the spec's `type`, label is the display name
             -[:HAS_CREDENTIAL]-> (:InstanceCredential {username, passwordCipher, nonce, keyVersion, storedAt, lastRevealedAt, revealCount})
             -[:HAS_SNAPSHOT]-> (:Snapshot {snapshotId, profile, status, timestamp, exportable})   // later; profile AdHoc|Scheduled; status Completed|InProgress|Failed|Pending|Cancelled
             -[:HAS_GDS_SESSION]-> (:GdsSession {auraId, name, memory, status, host, ttl, expiryDate, databaseUuid, userId}) // later; status Creating|Ready|Expired|Failed
             -[:ENCRYPTED_WITH]-> (:CustomerManagedKey {auraId, name, cloudProvider, region, instanceType, keyId, created, status})  // later; keys also belong to a tenant
(:Operation {id, kind, status, desired, before, diff, createdAt, confirmedAt, finishedAt, error})
   -[:TARGETS]-> (:Instance)        // absent until created
   -[:HAS_STEP]-> (:OperationStep {seq, label, status, at, detail})
(:SyncRun {id, startedAt, finishedAt, status, counts})
```

Choices:
- Every Aura-owned node has the same base shape (a GraphQL interface `AuraResource { auraId, syncedAt }`), so snapshots, keys and sessions slot in without reshaping.
- `AuraAccount` is a real node so multiple accounts or organisations are possible later. v1 has one.
- **Instance configurations** are stored per tenant, one node per offered combination (cloud provider, region and region name, type, memory, storage, version), exactly the fields the spec returns. `key` is a stable hash of those fields so a sync can upsert and remove stale ones.
- **Form options come from a query over these nodes**, and the choices cascade: tenant, then the clouds that tenant offers, then the regions for that cloud and tier, then the **memory and storage pair** for that combination (the spec returns them as pairs, and free instances have no storage). Edit forms use the same query to offer only the sizes valid for that instance's own cloud, region and tier. No hard-coded lists.
- **Tier labels.** The six spec types become display labels: `free-db` AuraDB Free, `professional-db` AuraDB Professional, `business-critical` AuraDB Business Critical, `enterprise-db` AuraDB Virtual Dedicated Cloud, `professional-ds` AuraDS Professional, `enterprise-ds` AuraDS Enterprise. The gallery's tier tag shows the label.
- **Timestamps are ISO 8601 UTC strings** (for example `2026-10-28T09:03:00Z`), set by the aura subgraph, not the `DateTime` scalar. The library formats `DateTime` with the APOC plugin, which a plain Neo4j image does not have, and ISO strings sort correctly as text. The aura subgraph also sets `Operation.createdAt` and `updatedAt`.
- **`Instance.version` is often empty.** Aura's instance details do not include the Neo4j version (only the create request and the option list carry one), so an instance found by a sync has none. Only instances created here record it.
- **Connection details live with the instance.** `connectionUrl` is on the instance. The username and password sit in a separate `InstanceCredential` node so the secret can be kept out of every normal query (section 6). An instance created outside this app has no stored password.
- **Facets as nodes.** `CloudProvider` and `Tier` are nodes, like `Genre` in the movie app, so the gallery can show a count per tag with a `totalCount` over the connection. Tenant is already a node. Counts follow the movie app's rule: each facet's count is computed as if its own filter were off, so ticking one tag still shows how many results each other tag would give.
- Observed state (`Instance`) and intent (`Operation.desired`) are separate. Instances deleted in Aura get `deletedInAuraAt` instead of being removed, so history survives.
- `Operation` is an audit log as well as a work queue. The "who" will be added once the UI has auth.
- **No plaintext secrets in graph properties.** The Aura client secret and instance passwords are stored only as ciphertext. See section 6.

## 6. Security

This tool can delete databases from a phone, so it must not be open on a network.

- **UI auth is required, even in v1.** The sibling repos are open with no auth. This one cannot be. It uses HTTP Basic auth in front of the whole app (decision 1), which is only safe behind TLS.
- **Aura client secret**: encrypted at rest (AES-GCM, key from an env var or mounted secret) and never returned by any query, log or error. Setup is write-only.
- **Instance password.** Aura returns it once, in the create response. We **store it** so it can be shown on the instance page (decision 9). Because it is the most sensitive thing in the store:
  - It is encrypted with AES-GCM before it is written, with the same key handling as the client secret. The `InstanceCredential` node holds only ciphertext, a nonce and a key version.
  - The ciphertext field is **not selectable through the public schema**, so no list, search or detail query can return it. Only a dedicated `revealInstancePassword(auraId)` mutation in the aura subgraph decrypts it, and it returns the plaintext once per call.
  - The UI hides it by default and shows it only when the person taps the eye icon. It hides again on leaving the page. Copy works without showing it.
  - Every reveal is recorded (time, instance, who). `lastRevealedAt` and `revealCount` sit on the credential node, and a reveal is also written as an audit event.
  - It is never logged, never put in an `Operation`, a step, an error message or a `desired` or `before` value.
  - It is the password Aura issued at creation. If someone changes it in the Aura Console, the stored value goes stale, and the UI says so. Instances found by sync have no stored password and show "Not stored".
  - **The credential and secret nodes are not in the GraphQL schema at all.** `InstanceCredential` and `AuraSecret` exist only as nodes in Neo4j (constraints are in `store/setup/constraints.cypher`). The aura subgraph owns the encryption key, so it writes and reads them over Bolt. The schema shows only `hasStoredPassword`, `credentialUsername` and `passwordRevealCount` on `Instance`, computed in Cypher. Tests fail if a password, secret, cipher or nonce field appears in either schema.
  - Deleting an instance deletes its credential node.
- Role split later: view only vs may change, since `confirmOperation` is the dangerous call.
- Gateway: restrict CORS, put TLS in front, and rate-limit mutations. (Done in Phase 6, by serving everything from one origin through the edge.)

## 7. Rate limits and polling

- One shared token, refreshed before expiry and on 401/403, with a single in-flight refresh.
- One poller per active operation, with backoff (for example 5s growing to 30s). The UI never polls Aura. It reads the store, which the reconciler keeps up to date.
- Background sync on an interval (default 15 minutes) plus a manual "refresh" button. The list endpoint returns only a summary with no status (section 2), so every instance needs its own `GET /instances/{id}`. A full sync costs about one call per tenant, one list call, and one call per instance. At 25 requests per minute that is slow for a large account, so detail reads are spread out: instances in a stable state are re-read on a slow rotation, in-progress ones on every poll, and a manual refresh jumps the queue. Tenant instance configurations change rarely, so they refresh on first connect, on a slower timer (for example daily), on demand, and when Aura rejects a stale choice. Budget the calls: one tenant detail request per tenant.
- Retry with exponential backoff on 429 and 5xx. Surface "rate limited, retrying" as an operation step rather than a failure.

## 8. UI design

### Options considered

| Option | Idea | Verdict |
| --- | --- | --- |
| A. Console clone | Dense table, left nav, modal dialogs | Good on desktop, poor on a phone. **Dropped**: no left nav |
| B. Mobile-first cards | Card list, detail page, bottom sheets, full-screen steps | **Recommended**, now in the movie-gallery layout (below) |
| C. Chat or agent driven | Natural language request, then confirm | Interesting later, not v1. The plan/confirm model already supports it |

### Recommended: B, laid out like the movie app

Instead of a left nav, the app follows `grandstack-web`: a top bar, a **home page with a hero, search and tag chips**, **rows of cards**, and a **results page with filters**. An instance is shown the way a movie is.

- **Home**: hero with a search box ("Search instances by name") and a row of **tag chips with counts**. Below it, card rows such as "Needs attention" (updating, failed or drifted), "Running", "Paused" and "Recently changed", each with "See all". A "New instance" button sits in the top bar.
- **Tags**: tenant, cloud provider and Aura tier. Tapping a chip opens the results page filtered by it, as genre chips do in the movie app. Several tags can be combined, and each shows its count as if its own filter were off (section 5).
- **Instance card** (the movie card): a generated poster in place of the movie poster, built from the instance name and its cloud and tier (no image files, like the movie posters), with the status chip, name, and a line such as "Professional, GCP europe-west1, 8 GB". Updating cards show a thin progress bar.
- **Results page**: the card grid with a filter sidebar on wide screens and a filter sheet on a phone, plus sort (name, newest, status, memory). Filter state lives in the URL (`q`, `t` tenants, `c` clouds, `tier`, `s` sort) so views can be bookmarked and shared, as in the movie app.
- **No left nav.** Top bar links: Instances, Operations, Aura account. On a phone these collapse to a menu.
- **Freshness**: each page shows "Synced N minutes ago" with a refresh button, since the cards come from the cache.
- **Instance detail**: connection URL (copy), properties, drift warning, and the actions: Edit, Pause or Resume, Delete. Actions sit in a sticky bottom bar on mobile (thumb reach, 44px or larger targets).
- **Create**: a stepper, one decision per screen. Choose tenant, then provider, then region and tier, then size. Every option list is a query over the stored `InstanceConfiguration`s for that tenant and the choices made so far (section 5), so invalid requests cannot be built. The same stored options feed the edit form's drop-downs.
- **Review and confirm**: the diff in plain language ("Memory 4GB to 8GB"). Delete uses type-the-name confirmation, because deletion is irreversible. A bottom sheet suits reversible actions such as pause and resume. Typing in a sheet is awkward on mobile, so delete gets a full-screen confirm.
- **Progress**: a timeline of the operation's steps with an overall status chip. It keeps working if the user locks the phone: on return it re-reads the operation rather than trusting a live connection. Show elapsed time and any rate-limit waits. Completion can be shown as a toast and by the card's status chip.
- **Accessibility**: status is never colour only (icon plus text), focus is managed in sheets and dialogs, and it works at 320px.

Research notes (sources below): type-to-confirm is the standard friction for irreversible deletes, and it is reserved for the most dangerous actions. Bottom sheets suit reversible choices. Apple guidance keeps action sheets to a few buttons with a clear Cancel. My searches found little guidance on progress UX for long-running cloud operations, so the progress design above is my own reasoning and should be tried on a real phone.

### Front-end stack

Match `grandstack-web`: React 19, Vite, react-router, urql, GraphQL codegen, its `tokens.css` and its `ConfirmDialog`. Reuse its pattern files: `Home.tsx` (hero, chips, rows), `search/FilterSidebar.tsx`, `search/MovieCard.tsx`, `poster/Poster.tsx` and `lib/filters.ts` (URL-backed filters with facet counts). Add a small headless library (for example React Aria Components) only if the sheet and dialog focus handling is too much to write by hand. A PWA manifest ("add to home screen") is cheap and helps on mobile. Offline is not needed.

## 9. Repo layout (proposed)

```
grandstack-web-aura/
  web/            React app
  store/          store subgraph (@neo4j/graphql type defs, seed constraints)
  aura/           aura subgraph: rest client, token manager, sync, reconciler, setup
  gateway/        mesh.config.ts, gateway.config.ts, supergraph.graphql (generated, committed)
  mock-aura/      fake Aura REST server for development and tests
  compose.yaml    neo4j + store + aura + gateway + web
  docs/
```

**Language**: TypeScript, to match the sibling repos. The REST client is generated from the OpenAPI file (section 1), so the Go `aura-client` package is not needed.

## 10. Testing

- **`mock-aura`** implements the endpoints in use, including async status transitions, 429s, token expiry and the one-time password. Development and end to end tests run against it, because real creates and deletes cost money and are hard to repeat.
- Unit tests: diff computation, operation state machine, token refresh, secret handling (assert neither the client secret nor an instance password ever appears in logs, errors, operations or any query result other than the reveal mutation).
- **Spec contract test**: generate the REST client types from the OpenAPI file, and check that `mock-aura` serves responses that validate against the spec's schemas, so the mock cannot drift from the real API.
- Password reveal: stored ciphertext differs from the plaintext, a wrong key fails, each reveal is recorded, and a list query cannot select the credential.
- A manual **live smoke test**, opt-in, against a free instance with a dedicated test tenant.
- End to end with a mobile viewport: setup, sync, create, confirm, progress, delete with type-to-confirm.

## 11. Phases

1. **Foundations. Done.**
   - Repo as an npm workspace, with the Aura OpenAPI file in `docs/` and the REST types generated from it.
   - `mock-aura`: a fake Aura API (token, tenants with instance configurations, instances create, edit, pause, resume, delete, with asynchronous status changes, 409, 404, 405, 429 and a one-time password). 42 tests, including a contract test that validates every response against the spec's schemas, and a check that the validator itself catches wrong bodies.
   - `store`: the graph model, constraints, the public read-only and internal read-write schemas, and the token-protected internal endpoint. 16 unit tests plus 12 integration tests against a real Neo4j (constraints are idempotent, federation SDL, tag counts, `_entities`, secrets never selectable, public schema cannot write).
   - Dockerfiles with pinned image digests that run as a non-root user, and `compose.yaml` (Neo4j, store, mock-aura). Brought up and checked end to end.
   - Found and fixed while building: a `@cypher` field with no row dropped whole instances from results, and `DateTime` needs the APOC plugin (now ISO strings).
2. **Setup and sync (backend). Done.**
   - `aura` subgraph, with these parts and their tests:
     - **Encryption** (`SecretBox`): AES-256-GCM, a fresh nonce per secret, the owner bound in as authenticated data so a sealed value cannot be moved to another record, and key versions for rotation.
     - **Secret storage** (`SecretStore`): the Aura client id and secret are sealed together and stored as an `AuraSecret` node over Bolt. Neither appears anywhere in the database, a log or an error.
     - **REST client** (`AuraClient`): types from the spec; a cached token that is refreshed 60 s before it expires, with one refresh at a time; one fresh token on a 401 or 403; `Retry-After` (seconds or a date) honoured, and after a 429 every request waits, not only the refused one; backoff on 5xx; a too-long `Retry-After` is an error, not a wait; a network failure becomes "Could not reach Aura" without the address.
     - **Sync**: reads tenants and each tenant's options, the instance list, then each instance's details, and writes the store through its internal endpoint. Runs are recorded as `SyncRun` (SUCCEEDED, SLOWED when Aura asked it to wait, or FAILED with a plain-words error). Idempotent, and never doubles a link. Moves a cloud or tier tag when Aura reports a different one. An instance gone from Aura is kept and marked `deletedInAuraAt` once. An instance that vanishes between the list and its details is skipped. A failed run keeps what the store already had.
     - **Service**: `connectAura` checks the credentials with Aura first and stores nothing if they are refused, then stores the secret sealed, records the account and starts a first sync. `syncNow` runs one sync at a time. `disconnectAura` deletes the secret and keeps instances, passwords and history. A sync runs at start-up if an account is connected, and on a timer.
     - **GraphQL**: `auraSetup`, `connectAura`, `syncNow`, `disconnectAura`. A `UserError`'s message reaches the person. Any other error is masked.
   - `gateway`: the store's public subgraph and the aura subgraph compose into one supergraph (committed, with tests that it exposes only the three aura mutations and no secret field). The federation question from Phase 1 is answered: it composes cleanly.
   - `compose.yaml` runs Neo4j, store, aura, mock-aura and gateway, pointed at mock-aura by default, with every port bound to 127.0.0.1. The gateway is on **4100**, because grandstack's own stack uses 4000.
   - Checked end to end through the gateway on real containers: wrong secret refused with a plain message, one query spanning both subgraphs, no store mutation reachable, no secret in the database or any real service's log, the internal store port unreachable from the host, disconnect keeps the data, and a restart syncs by itself.
   - Found and fixed while building: relationship `connect` is not idempotent (connecting a linked tag adds a second link, so the sync only connects on create or on a real change); the store's filters have no `neq`; two sync runs in the same second shared a `startedAt`, so the latest run could be the wrong one (timestamps now carry milliseconds); Aura's instance details do **not** include the Neo4j version, so an instance found by a sync has no `version` (only instances created here will).
3. **Web app, read-only. Done.** React 19, Vite, react-router and urql, on the movie app's patterns. Everything reads through the gateway.
   - **Setup**: the connect form (the secret field is cleared after every attempt and kept nowhere), then a first-sync screen with progress, or the error if it failed.
   - **Home**: hero with search, tenant, cloud and tier tags with counts, and rows of cards ("Needs attention", "Running") with generated posters coloured by cloud.
   - **Results**: filters in the URL (`q`, `t`, `c`, `tier`, `st`, `rm`, `s`), counts that leave out their own filter, a sidebar on a wide screen and a bottom sheet on a phone, removable chips, and a sort (name, newest, needs attention first, largest first). Sorting is done in the browser because memory is text in the store.
   - **Instance detail**: status, tags, connection card (URL with copy; says plainly when no password is stored, because the instance was found by a sync), properties, and the changes made here.
   - **Operations** (empty until Phase 4, a list of changes since) and **Aura account**: the connection, stored-copy counts, options per tenant, recent syncs, Sync now, Replace credentials and Disconnect with a confirmation that says what is kept.
   - Light, dark and follow-the-system themes, remembered, applied before the first paint. Every status has an icon and a word. Status text, field labels and buttons have names for screen readers.
   - 80 unit tests (filters, sorting, status, sizes, dates, theme, operations) and **100 real-browser checks** (`web/e2e`), run on a phone-sized and a desktop-sized screen: the whole connect, filter, sync, disconnect and reconnect flow, no sideways scrolling, every control named, no console errors, no secret in the page, storage or URL.
   - Differences from the mockups, on purpose: a **Status** filter and a **Show removed** switch were added (the home page's "See all" links need the first, and instances Aura no longer lists need the second); the Instances icon is hidden on a phone (home is the way in) so the top bar fits on one line; the per-tenant **Refresh** button on the account page is not there, because it needs a backend call that does not exist yet.
   - Found by looking at screenshots, not by tests: the status chips stretched across the whole card, the phone top bar wrapped onto two lines, and the filter group titles sat on their dividers inconsistently. All fixed, and checks added for the first two.
   - Found by the browser run: after disconnecting from the Account page and reconnecting, you landed back on the Account page. Connecting now always starts at the home page.
4. **Plan and confirm. Done.** Edit, pause and resume, each planned, reviewed and confirmed before anything reaches Aura. Create and delete are Phase 5.
   - **Operation state machine** (`aura/src/operations`): PLANNED, CONFIRMED, RUNNING, SUCCEEDED, FAILED, CANCELLED, with every move checked by one function. Planning stores what would change (`diff`), what the instance looked like (`before`) and six steps, and sends nothing.
   - **Confirm**: an atomic compare-and-set from PLANNED, plus a per-instance lock, so a double click or two tabs cannot send twice. Confirming refuses a plan that went **stale**: it compares the fields the plan was made from with the instance now (not `syncedAt`, because a sync that changed nothing does not make a plan wrong). The refusal tells the person to plan again.
   - **Reconciler** (in the aura subgraph): sends the change, then watches Aura until the instance is in a stable status **and** shows what was asked. A change is never retried after a 5xx or a lost connection, because it may have been applied; a read is. 409 (Aura busy) fails the change with a plain message. A timeout says the change may still finish. After a restart, a change is recovered from its steps: not yet sent is sent, sent is watched.
   - **GraphQL**: `planUpdate`, `planPause`, `planResume`, `confirmOperation`, `cancelOperation`. A plan returns only an id to review. The supergraph test asserts the exact mutation list and that no `create/update/delete*` mutation exists.
   - **Web**: edit form (name with a 30 character counter, memory and storage as pairs from the stored tenant options with the current pair marked, vector and analytics switches, "Review changes" off until something differs); review page (before and after, warnings, Cancel, Confirm and apply); progress page (six steps, step count, clock, polls and survives a reload); success, failure (reason, Sync now) and cancelled states; Pause and Resume on the instance page; Edit, Pause and Resume lock while a change is active, with a banner that links to it; every change linked from the instance and from Operations.
   - **mock-aura** gained fault injection (`rejectNext`, `endAs`, `stall`, `dropNext`, set over `POST /__faults`) so refusals, stuck changes and lost answers can be tested.
   - Tests: 47 unit and 45 integration tests for operations (including a stale plan, double confirm, lost connection, restart recovery and the never-retry rule), 120 web unit tests, and **148 real-browser checks**. Mutation checks: removing the confirm guard, the compare-and-set, the stale check, or turning on retry for changes each made a test fail.
   - Differences from the mockups, on purpose: the desktop review is a page, not a dialog (one pattern for phone and desktop); `requestedBy` is "local" until there is sign-in (Phase 6) and is not shown as a name; a failure shows Aura's reason in red and offers Sync now in plain words rather than guessing whether the change was applied.
   - Found while building: while a confirmed change holds an instance its stored status is still "running", so the planning refusal is "another change is already in progress", not "Aura is working"; a timeout message would have said "within 0 minutes"; Aura's PATCH answers 200 (applied) or 202 (background), and both are handled.
   - Found by the browser run: pages that read a second query (the size options) rendered before it arrived, so the run now waits for it. The mock-aura "429 with Retry-After" test failed once in a full parallel run and never again in six more; it is untouched by this phase, and I have not found the cause.
5. **Create and delete. Done.** Both go through the same plan, review and confirm as Phase 4, and the stored password can be shown.
   - **Create**: a five-step stepper (tenant, cloud, region and tier, size, name and options), one decision per screen. Every list is read from the stored options of the chosen tenant, and choosing something earlier clears what depended on it, so a combination Aura would refuse cannot be built. The server checks the combination again when planning and again when confirming (a sync may have changed what is offered), and fills in the storage, version and region name from the offered option.
   - **The password**: Aura shows it once, in the create answer. The reconciler stores it, sealed with the instance as the authenticated owner, **before** it records the instance or marks any step, because nothing else can recover it. If it cannot be stored, the change fails and says so. `revealInstancePassword` is the only place a password leaves the store. It records the reveal (count, time and an `AuditEvent` node) before returning it, so a reveal that cannot be recorded does not happen. The web shows it behind an eye, holds it only in the component, hides it after 30 seconds or when the tab is hidden, and never writes it to storage or the URL.
   - **Delete**: planned like any change, and confirmed only when the instance's name is typed exactly. The server checks the name, not only the page. The change is finished when Aura answers 404, not when the status reads "destroying". The record stays, marked as removed, and the stored password is deleted with it.
   - **Never twice**: a create is not retried after a 5xx or a lost answer (a second instance costs money). After a restart, a create that was recorded is only watched; one that may have been sent fails and says to sync, rather than ask again. A delete that may have been sent is finished if Aura already lacks the instance, watched if Aura is destroying it, and otherwise failed rather than sent again.
   - **Drift**: `checkInstance` compares the stored copy with Aura now and changes nothing. The instance page shows what differs, stored against Aura, and offers Sync now. This replaces the federated `live` field the model described: a query that reads Aura only when asked does the job, and needs no entity extension.
   - **GraphQL**: `planCreate`, `planDelete`, `revealInstancePassword`, `checkInstance`, and `confirmOperation` takes `typedName`. The supergraph test pins the exact mutation list and that only `Mutation` can return a `RevealedPassword`.
   - Tests: 130 aura unit and integration tests for this phase (plan validation, both flows, restart recovery, reveal recording, wrong key and moved-owner failures, drift), 16 create-form unit tests, and **201 real-browser checks**. Mutation checks: removing the typed-name check, keeping the password after a delete, and dropping the audit event each made a test fail. Finishing a delete at "destroying" made the first run fail, which is why the test now waits for the 404.
   - Differences from the mockups, on purpose: **New instance** is a button on the home page on a phone, and in the top bar from 640 px up, because a fourth icon made the phone top bar scroll sideways (found by the browser run: taps on the page below it stopped working); the delete confirm is the review page with a name field, not a separate full-screen dialog; the single tenant case skips the tenant step.
   - Known limit: if Aura creates the instance and the store then cannot record it, the password stays stored but unlinked, and a later sync finds an instance with no password to show. The operation fails and says so.
6. **Hardening. Done, except two things that need real hardware or a real account.**
   - **Changed after the first version of this phase**: the edge is now an **option** (`compose.edge.yaml`). The default is the web server on plain HTTP on `127.0.0.1:3100`, with no sign-in, which suits one person on their own machine; the web server now forwards `/graphql` to the gateway itself and sends the same strict headers, so the app is one origin either way. The edge is for anything beyond that (a phone, another machine), and with it the web server is no longer published. `scripts/init-env.sh --edge` makes the sign-in and certificate, and `EDGE_SAN` / `--new-cert` reissue the certificate for a LAN address. CI runs the browser test in plain mode and the edge checks in edge mode. What follows describes the edge.
   - **The edge** (`edge/`, nginx): in edge mode the only published port, 8443, TLS 1.2 and up. HTTP Basic sign-in for everything, with a bcrypt list in `edge/secrets/htpasswd` that the edge refuses to start without (and refuses to start if a password is not hashed). It serves the app at `/` and the gateway at `/graphql` on **one origin**, so the browser sends its sign-in itself and there is no CORS to get wrong. The upstreams never see the credentials. Rate limits per address: 20 requests a second overall, and 60 a minute for POSTs (the changes; reads are GETs). Bodies over 64 kB are refused at `/graphql`. GraphQL answers carry `Cache-Control: no-store`, because one may hold a password.
   - **Headers**: a strict content security policy (nothing inline, nothing from elsewhere, no `unsafe-`), no framing, no sniffing, no referrer, no camera, microphone or location. HSTS is off unless set, because it applies to a whole host whatever the port and would have broken `http://localhost:3000` on this machine.
   - **Nothing else is published.** The web container, gateway, subgraphs, Neo4j and mock-aura are on the compose network only. `compose.dev.yaml` publishes them on loopback for development and the tests, with a warning. The database password, internal token and secret key are required and generated by `scripts/init-env.sh`, not defaulted. The gateway's browser query editor is off.
   - **CI** (`.github/workflows/ci.yml`): type check, `npm audit` of what ships, the unit and integration tests against a Neo4j service container; and a whole-stack job that checks the committed supergraph is current, runs the edge checks (including the rate limit on a second, low-limit edge), runs the browser test through the edge, and checks that only the edge is published. Actions are pinned by commit. **I could not run the workflow here**: its YAML parses and its commands are the ones I ran locally, but its first real run may find something.
   - **Tests**: `edge/check.mjs` (31 checks: sign-in refused without, with a wrong user, a wrong password, an empty password and a Bearer token; every path asks for it; headers; no-store; oversized body; writes refused; the closed ports; the rate limit), and the existing 201 browser checks, now run through the edge and the strict policy (a policy violation would be a console error and fail the run).
   - **Docs**: `docs/deploying.md` (what the sign-in does and does not protect, a real hostname, backups, what is not here) and `docs/real-account-checklist.md`.
   - Found while building: a bcrypt line from `htpasswd -n` is followed by a blank line, which the start-up check read as an unhashed password; the edge cached the gateway's address at start, so restarting the gateway gave 502 until the edge was restarted (it now looks the name up every ten seconds; I restarted the gateway and the web container by hand and the edge kept working, but no automated check does that); `limit_req off` is not a thing; Neo4j's health check read a default password that is no longer defaulted.
   - **A read-only run against a real Aura account** (a test account, with the user's go-ahead): the token flow, tenants, options, instances and details work, and a full sync takes about 13 seconds. It found one real difference from the spec: `graph_nodes` and `graph_relationships` arrive as numbers, and the store rejected them until they were stored as text. It also showed that a real tenant offers about 3,000 combinations (the mock 16), which made the create form's single query 1.5 MB. The form now reads only the chosen tenant's options, and the edge compresses reads (66 kB).
   - **Not done**: any create, rename, pause, resume or delete on the real account, so the timings of a change and the real rate limits under load are still unseen; and a pass on real phones. `docs/real-account-checklist.md` says how to do both and what to record.
   - **Known limits**: one user and one level of access (anyone signed in can delete); Basic auth cannot sign out; no lockout beyond the rate limit; no tool to re-seal secrets under a new key. See `docs/deploying.md`.
7. **Fit into GRANDstack. Done on branches (`aura-model`) in this repository, `grandstack`, `grandstack-server` and `grandstack-federation`; not yet merged.** The first six phases built a self-contained stack. The GRANDstack way is a server image driven by files, a federation gateway, and compose files in the umbrella repository, so this phase removed the duplicate.
   - **`grandstack-server` gained `MODEL` and `READ_ONLY`.** `MODEL` holds one name, so one model runs per server: `movies` is built in and is the default, at the paths it always had, and any other model is a folder `models/<name>/` (`schema.graphql`, optional `setup.cypher`, `seed.cypher`, `model.json`). An explicit environment variable wins over a model's defaults, and the Movies counts plugin is off for every other model. `READ_ONLY=true` adds `@mutation(operations: [])` to every `@node` type, found in the schema, so no list can drift. 19 new tests; the built image still loads the 152 films by default.
   - **`store/` is gone.** It was a second implementation of what the server does (about 250 lines and 28 tests). The graph model is now `models/aura/`. The aura subgraph writes through a **writable server** (`STORE_WRITER_URL`), and the web app and gateway read through a **read-only** one: the same image and model twice. The stock server has no bearer token, so the isolation that the token gave is now the network: the writable server is on a private network with Neo4j and the Aura subgraph only, publishes no port, and the gateway does not route to it. `INTERNAL_TOKEN` is removed.
   - **The gateway is `grandstack-federation`'s image.** This repository keeps only `supergraph.graphql`, `gateway.config.ts` and `mesh.config.ts`, which `compose.aura.yaml` mounts over the image's own (as `compose.federation.yaml` does for Wikipedia). The store subgraph is now named `Neo4j`, as there.
   - **Compose files moved to `grandstack`:** `compose.aura.yaml` (on the standard ports, replacing the other setups there, with its own Neo4j volume so Movies and Aura data never mix, and everything bound to `127.0.0.1` because this app can delete databases) and `compose.aura-edge.yaml` (TLS, sign-in, nothing else published). `scripts/integration.sh` and the nightly workflow gain an `aura` setup. The web app stays a separate web server, as it is for the other setups.
   - **Verified:** 290 aura tests (including the model tests and the integration tests, now against two real `grandstack-server` processes), the 10 gateway tests and the 137 web tests pass; all 201 browser checks pass against the stack that `compose.aura.yaml` starts; the 34 edge checks pass against `compose.aura-edge.yaml`, with only the edge published.
   - **Found while doing it:** the page's content security policy allows only its own origin, so an app built to call the gateway on another port (the other setups' convention) is blocked; here the web server forwards `/graphql`, so it is one origin. `compose down -v` under the **default project name** would have deleted the Movies data volume of the stack already on this machine, so all testing used its own project name and moved ports. The browser run's theme check assumed the machine was in light mode. The edge overlay must close mock-aura's port, so the browser run cannot go through the edge; the edge has its own checks.
   - **After trying it on a real account:** the create stepper's region, tier and size are now drop-downs (a real tenant offers a dozen regions and many sizes), and the Account page can **reset the stored copy**: it removes the tenants, options and instances that came from Aura and reads them in again, keeping the credentials, past operations (relinked to their instances), stored passwords, removed-instance records and sync history. A new mutation, `resetStore`, refused while a sync or a change is under way. 15 new tests; 216 browser checks.
   - **Not done:** merging. `grandstack-server` needs a release (through its release-cut workflow) before the others can use `main`; until then the sibling checkouts in CI and in the README use the `aura-model` branch. The nightly `integration` workflow in `grandstack` checks out `main` of each repository, so its `aura` job fails until the server is merged. The CI workflows have not run on GitHub.
8. **Later (model already allows)**: roles, a tool to re-seal secrets under a new key, snapshots, CMEK, GDS sessions, metrics, SSE progress, roles.

## 12. Decisions (made)

1. UI auth in v1: **HTTP Basic auth** in front of the whole app (web and gateway). Credentials come from env or a mounted secret. Basic auth is only safe over TLS, so the deployment must terminate TLS in front of it.
2. Language: **TypeScript**.
3. Reconciler: **inside the aura subgraph**.
4. Repo name: **grandstack-web-aura**. (You wrote "granstack-web-aura"; I assumed a typo to match the sibling repos. Say if it is meant literally.)
5. **One Aura account** in v1. The `AuraAccount` node stays in the model so more can be added later.

6. **Neo4j is a cache** of Aura's state. Screens read from it, and the Aura API is used to sync, to apply confirmed changes and for explicit refreshes.
7. **All instance configurations for every tenant are stored in Neo4j** and drive the create and edit drop-downs.
8. **Gallery layout like the movie app**, no left nav, with tag filters for tenant, cloud provider and Aura tier.

9. **Connection details are stored with each instance**, including the password, which is hidden by default and shown with an eye icon (security details in section 6).
10. **Desktop create and delete reuse the mobile patterns.** There is no separate desktop wizard or dialog.

The UI mockups are in the design canvas "grandstack-web-aura UI": 19 mobile screens and 6 desktop screens, each in light and dark. They follow decisions 6 to 10: a home page with hero search, tag chips and card rows, a results page with a filter sheet (mobile) or sidebar (desktop), a top bar instead of a left nav, an Operations page, and a Connection card on the instance page with the password eye. The edit screen follows the API's PATCH: name (up to 30 characters), memory and storage chosen together as a pair, and the vector optimized and graph analytics plugin switches. Also drawn: a status reference with all 13 statuses the API reports (ready, stopped, in progress, failed), an instance page in progress with Edit, Pause and Delete locked and with no stored password, and the Aura account page (connection, stored copy counts, instance options per tenant with refresh, recent syncs, Disconnect).

Design choices in those screens to confirm:
- Disconnect deletes the stored client secret and stops syncing, but keeps instances, stored passwords and history. Nothing changes in Aura.
- In-progress instances lock Edit, Pause and Delete, which matches Aura answering 409 to a second operation.
- The spec lists `suspended` and `loading` without explaining them, so the app shows them without a reason.

## Sources

- Federation 2 with the Neo4j GraphQL library: https://neo4j.com/docs/graphql/current/integrations/apollo-federation/
- Apollo subgraph spec: https://www.apollographql.com/docs/federation/subgraph-spec/
- Aura API overview and rate limits: https://neo4j.com/docs/aura/platform/api/overview/
- Aura API specification (could not be read by tool): https://neo4j.com/docs/aura/platform/api/specification/
- Aura API mirrors: https://apis.io/apis/neo4j/neo4j-instances-api/ , https://apis.io/apis/neo4j/neo4j-tenants-api/ , https://apis.io/apis/neo4j/neo4j-snapshots-api/
- Aura Go client: https://pkg.go.dev/github.com/LackOfMorals/aura-client
- Destructive action patterns: https://www.saasui.design/blog/saas-destructive-actions-confirmation-ux-patterns , https://vercel.com/geist/destructive-action-modal
- Action sheets: https://developer.apple.com/design/human-interface-guidelines/action-sheets.md
