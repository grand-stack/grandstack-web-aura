# Customising

What to change to make this look and behave like your own app, what each setting does, and what depends on Aura.

## What is generic and what is Aura-specific

| Part | Generic? | Notes |
| --- | --- | --- |
| `web/src/ui/*`, `web/src/theme/tokens.css`, `web/src/styles.css`, `web/src/lib/poster.ts`, `web/src/lib/hash.ts` | Generic | Buttons, chips, modal, icons, generated posters, tokens. |
| `web/src/lib/filters.ts` | Pattern is generic | URL-synced filters with `where` and sort builders; the filter set is about instances. |
| `web/src/lib/changes.ts`, `create.ts` | Pattern is generic | Turning form state into a minimal, valid request; the fields are Aura's. |
| `web/src/pages/*` | Aura-specific | Rename and rework per entity. |
| `aura/src/operations/` | Pattern is generic | Plan, confirm once, send once, watch until it shows, recover after a restart. The kinds and the checks are Aura's. |
| `aura/src/crypto.ts`, `secrets.ts` | Generic | Sealing with an owner bound in, and secret nodes over Bolt. |
| `aura/src/client.ts` | Mostly generic | A token manager, `Retry-After`, shared pause after a 429, no retry of a change. The paths are Aura's. |
| `aura/src/sync.ts`, `status.ts` | Aura-specific | What Aura returns and how it maps to the store. |
| `store/schema/schema.graphql` | Aura-specific | The graph model. |
| `edge/` | Generic | An nginx in front of any app on one origin. Change the two upstream names. |
| `mock-aura/` | Aura-specific | Its contract test checks it against the real spec. |
| `web/src/graphql/generated/*`, `aura/src/generated/*`, `gateway/supergraph.graphql` | Generated | Regenerate; never edit. |

## Change the look

- **Colours, spacing, radii, shadows:** edit the custom properties in `web/src/theme/tokens.css`. `:root` is light, the `prefers-color-scheme: dark` block is dark when no choice has been made, and `:root[data-theme="dark"]` is dark when chosen. Keep the three in step, and keep text and background pairs above 4.5:1.
- **Font:** Public Sans, loaded from `@fontsource-variable/public-sans` in `web/src/main.tsx`; swap the package and the `--font` token.
- **Layout and components:** all styles are in `web/src/styles.css`, grouped by area.
- **Brand name:** the top bar text is in `web/src/App.tsx`; the page title is in `web/index.html`.
- **The look is its own,** drawn for this app. It does not use Neo4j's Needle packages (`@neo4j-ndl/*` are GPL-3.0 and this repo is Apache-2.0), so do not add them without changing the licence.
- **Check any visual change** at 390 px wide and in dark mode, with a screenshot (`OUT=dir npm run e2e -w web`). Checks passing did not show a chip stretched across a card or a top bar wrapping onto two lines; the screenshots did.

## Names the app shows

- **Tier names** (AuraDB Professional and so on) are in `aura/src/status.ts` (`TIER_LABELS`, written to the store) and in `web/src/lib/create.ts` (`tierName`, used before an instance of that tier exists). A tier Aura adds shows its raw id until you add it to both.
- **Cloud names** (GCP, AWS, Azure) are in `web/src/lib/format.ts` (`CLOUDS`). The poster colours are in `web/src/lib/poster.ts`.
- **Status labels, icons and tones** are in `web/src/lib/status.ts`; the grouping into READY, STOPPED, IN_PROGRESS and FAILED is in `aura/src/status.ts`. An unknown status is shown in its own words as in progress.
- **Wording of refusals** the person sees ("Nothing would change.", "This instance changed after you planned this. Plan the change again.") is in `aura/src/operations/`. Only a `UserError`'s message reaches the browser; any other error is masked.

## Settings

### Compose (read from `.env` or the shell)

| Variable | Default | What it does |
| --- | --- | --- |
| `SECRET_KEY` | required | 32 bytes, base64. Seals the client secret and instance passwords. Losing it means they cannot be opened. |
| `NEO4J_PASSWORD` | required | The database password. |
| `INTERNAL_TOKEN` | required | Bearer token for the store's internal endpoint (16 characters or more). |
| `AURA_BASE_URL` | the fake Aura | `https://api.neo4j.io` for a real account. |
| `WEB_BIND`, `WEB_PORT` | `127.0.0.1`, `3100` | Where the default plain HTTP app is published. `0.0.0.0` opens it to the network with no sign-in. |
| `EDGE_BIND`, `EDGE_PORT` | `127.0.0.1`, `8443` | Where the edge is published (`compose.edge.yaml`). |
| `PUBLIC_ORIGIN` | `http://localhost:3100` | The address the app is opened at, for the gateway's CORS list. Rarely matters, because the app calls its own origin. |
| `EDGE_REQUEST_RATE`, `EDGE_MUTATION_RATE` | `20r/s`, `60r/m` | Per address. Mutations are POSTs; reads are GETs and are not held to the minute. |
| `EDGE_HSTS` | empty | For example `max-age=31536000`, once there is a real hostname and certificate. It applies to a whole host, whatever the port. |
| `MOCK_STEP_MS` | `3000` | How long each asynchronous step takes in mock-aura. |

`scripts/init-env.sh` makes the first three. `--edge` adds the certificate and sign-in; `EDGE_SAN` and `--new-cert` reissue the certificate for other names; `EDGE_PASSWORD=... --new-password` sets the sign-in password yourself.

### The aura subgraph

| Variable | Default | What it does |
| --- | --- | --- |
| `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE` | required (user `neo4j`, database `neo4j`) | Bolt connection, used for secrets. |
| `STORE_INTERNAL_URL` | `http://store:4002/graphql` | The store's internal endpoint. |
| `SECRET_KEY_VERSION` | `1` | Which key sealed a value, for rotation. |
| `AURA_BASE_URL` | `https://api.neo4j.io` | Must be https, unless `ALLOW_INSECURE_AURA_URL=true` (for mock-aura). |
| `SYNC_INTERVAL_MS` | `900000` | Time between automatic syncs. `0` turns the timer off. |
| `SYNC_CONCURRENCY` | `3` | Instance detail requests in flight at once. |
| `OPERATION_TIMEOUT_MS` | `1800000` | How long a change may take before it is given up on. The change may still finish. |
| `PORT` | `4010` | |

### The store

`NEO4J_URI`, `NEO4J_PASSWORD`, `INTERNAL_TOKEN` are required. `PORT` (4001) and `INTERNAL_PORT` (4002) must differ, so the internal endpoint is never served on the public port. `SCHEMA_PATH` and `SETUP_CYPHER_PATH` say where the graph model and constraints are.

### The web app

`VITE_GRAPHQL_URL` is fixed at **build time** and empty by default, which means `/graphql` on the app's own origin. Set it only to point the app somewhere else, and then it must be reachable from the browser. For `npm run dev -w web` the dev server proxies `/graphql` to `DEV_GATEWAY` (default `http://localhost:4100`, which `compose.dev.yaml` publishes).

## Use the fake Aura or a real one

The stack uses mock-aura unless `AURA_BASE_URL` is set. Credentials for the fake are `mock-client` and `mock-secret`. For a real account set `AURA_BASE_URL=https://api.neo4j.io` and read [real-account-checklist.md](real-account-checklist.md) first: creates and deletes cost money and cannot be undone, and the browser test must never be pointed at a real account.

## Serve it to a phone or another machine

Put the edge in front, make the certificate cover the address, and publish on the network. The commands are in [deploying.md](deploying.md) and the [README](../README.md#the-edge-tls-and-a-sign-in-to-reach-it-from-a-phone-or-another-machine). Do not use `WEB_BIND=0.0.0.0` for this; it has no sign-in.

## Adapt the pattern to another API

The reusable idea is: a **cache** in Neo4j that screens read, a **sync** that fills it, and **changes that are planned, reviewed, confirmed and then run once** by a reconciler. To adapt it, change the API client and its types (`aura/src/client.ts`, `generate:api`), the mapping into the store (`aura/src/sync.ts` and `store/schema/schema.graphql`), the kinds of change (`aura/src/operations/`), and the screens. The recipes list the files each of those touches: [recipes](recipes.md).
