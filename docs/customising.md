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
| `models/aura/` | Aura-specific | The graph model that `grandstack-server` loads with `MODEL=aura`: schema, setup Cypher, `model.json`. |
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

### Compose (the `grandstack` repository, read from its `.env` or the shell)

| Variable | Default | What it does |
| --- | --- | --- |
| `SECRET_KEY` | required | 32 bytes, base64. Seals the client secret and instance passwords. Losing it means they cannot be opened. `scripts/init-env.sh` makes it. |
| `NEO4J_PASSWORD` | `grandstack-dev` | The database password, as in every GRANDstack setup. |
| `AURA_BASE_URL` | the fake Aura | `https://api.neo4j.io` for a real account. |
| `ALLOW_INSECURE_AURA_URL` | `true` | Lets `AURA_BASE_URL` be plain http, for mock-aura. It has no effect on an https address. |
| `SYNC_INTERVAL_MS` | `900000` | Time between automatic syncs. `0` turns the timer off. |
| `MOCK_STEP_MS` | `3000` | How long each asynchronous step takes in mock-aura. |
| `EDGE_BIND`, `EDGE_PORT` | `127.0.0.1`, `8443` | Where the edge is published (`compose.aura-edge.yaml`). `0.0.0.0` serves other machines. |
| `EDGE_REQUEST_RATE`, `EDGE_MUTATION_RATE` | `20r/s`, `60r/m` | Per address. Mutations are POSTs; reads are GETs and are not held to the minute. |
| `EDGE_HSTS` | empty | For example `max-age=31536000`, once there is a real hostname and certificate. It applies to a whole host, whatever the port. |

`scripts/init-env.sh` (in this repository) writes `SECRET_KEY` into `../grandstack/.env`. `--edge` adds the certificate and sign-in; `EDGE_SAN` and `--new-cert` reissue the certificate for other names; `EDGE_PASSWORD=... --new-password` sets the sign-in password yourself.

### The two servers (`grandstack-server`)

Both run the same image with `MODEL=aura`, `MODELS_DIR=/app/models` (this repository's `models/` mounted read-only) and `FEDERATION=true`. The read-only one adds `READ_ONLY=true`. Every other setting is the server's own: see its [configuration](https://github.com/grand-stack/grandstack-server/blob/main/docs/configuration.md#models). The model sets the defaults (no seed, no counts plugin); `models/aura/model.json` holds only `{ "refreshCounts": false }`.

### The Aura subgraph

| Variable | Default | What it does |
| --- | --- | --- |
| `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE` | required (user `neo4j`, database `neo4j`) | Bolt connection, used for secrets. |
| `STORE_WRITER_URL` | `http://store-writer:4000/graphql` | The writable server. |
| `SECRET_KEY`, `SECRET_KEY_VERSION` | required, `1` | The key, and which key version seals new values (for rotation). |
| `AURA_BASE_URL` | `https://api.neo4j.io` | Must be https, unless `ALLOW_INSECURE_AURA_URL=true` (for mock-aura). |
| `SYNC_INTERVAL_MS` | `900000` | Time between automatic syncs. `0` turns the timer off. |
| `SYNC_CONCURRENCY` | `3` | Instance detail requests in flight at once. |
| `OPERATION_TIMEOUT_MS` | `1800000` | How long a change may take before it is given up on. The change may still finish. |
| `PORT` | `4010` | |

### The web app

`VITE_GRAPHQL_URL` is fixed at **build time** and empty, which means `/graphql` on the app's own origin: the web server (or the edge) forwards it to the gateway, and the page's content security policy allows nothing else. Set it only to point the app somewhere else, and then the policy must allow that origin. For `npm run dev -w web` the dev server proxies `/graphql` to `DEV_GATEWAY` (default `http://localhost:4000`, where `compose.aura.yaml` publishes the gateway).

## Use the fake Aura or a real one

The setup uses mock-aura unless `AURA_BASE_URL` is set. Credentials for the fake are `mock-client` and `mock-secret`. For a real account set `AURA_BASE_URL=https://api.neo4j.io` and read [real-account-checklist.md](real-account-checklist.md) first: creates and deletes cost money and cannot be undone, and the browser test must never be pointed at a real account.

## Serve it to a phone or another machine

Put the edge in front (`compose.aura-edge.yaml`), make the certificate cover the address, and publish on the network. The commands are in [deploying.md](deploying.md) and the [README](../README.md#the-edge-tls-and-a-sign-in-to-reach-it-from-a-phone-or-another-machine). Do not publish the plain app to the network; it has no sign-in.

## Adapt the pattern to another API

The reusable idea is: a **cache** in Neo4j that screens read, a **sync** that fills it, and **changes that are planned, reviewed, confirmed and then run once** by a reconciler. To adapt it, change the API client and its types (`aura/src/client.ts`, `generate:api`), the mapping into the store (`aura/src/sync.ts` and `models/aura/schema.graphql`), the kinds of change (`aura/src/operations/`), and the screens. The recipes list the files each of those touches: [recipes](recipes.md).
