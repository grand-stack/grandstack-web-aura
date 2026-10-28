# Testing

Layers from fastest to most realistic. A change that can send something to Aura, or show a secret, has tests at several of them on purpose.

> **Where to run this.** Commands on this page run inside a clone of this repository (`git clone https://github.com/grand-stack/grandstack-web-aura`, then `cd grandstack-web-aura`; Node 22 or later; `npm ci` once). Commands that need a database or the running stack say so. Never point any of them at a real Aura account.

## 1. Type checking

`npm run typecheck` runs `tsc --noEmit` in every workspace. Every GraphQL document in the web app is typed from the schema, so using a field that is not in the query fails here.

## 2. Codegen as a schema check

`npm run codegen -w web` reads the live schema from the gateway (`GRAPHQL_URL`, default `http://localhost:4100/graphql`, which needs `compose.dev.yaml`) and validates every document against it. An unknown field, a wrong variable type or a duplicate operation name fails the run and writes nothing. Run it after any schema change and commit `web/src/graphql/generated/`.

## 3. Unit tests

`npm test` runs every workspace's unit tests. No database or browser is needed; the integration tests are skipped without `NEO4J_TEST_URI`.

| Workspace | Covers |
| --- | --- |
| `web` (137) | Filters and sorting, status and size formatting, theme, operations, `changes.ts` (plans, the edit form, progress, elapsed time), `create.ts` (what each step offers, what a change of choice clears) |
| `aura` (152) | The REST client (token, `Retry-After`, no retry of a change), sealing, config, status grouping, plan and diff (normalise, stale, create, delete), the aura subgraph's GraphQL with a stand-in service, the shapes real Aura sends |
| `mock-aura` (50) | Its behaviour, its fault injection, and the contract test below |
| `store` (16 + 12) | The two schemas (nothing writable in the public one; no password, secret, cipher or nonce field in either) |
| `gateway` (10) | The committed supergraph: the exact mutation list, that only `Mutation` can return a password, that a plan returns only an id |

## 4. The contract test

`mock-aura/test/contract.test.ts` validates every response the fake Aura gives against the schemas in Aura's real OpenAPI file (`docs/aura_api_spec_v1-2.yaml`), and checks that the validator itself rejects a wrong body. That is what lets the rest of the tests use the fake.

**It cannot catch what the spec gets wrong.** Real Aura sends `graph_nodes` as a number; the spec says string. See [Real Aura and its spec](#real-aura-and-its-spec).

## 5. Integration tests

These run the real store schemas, the real aura subgraph and mock-aura in one process against a **real Neo4j**. They are skipped unless `NEO4J_TEST_URI` is set, and they refuse to wipe a database that holds anything but this app's own labels.

```sh
podman run -d --rm --name gwa-neo4j-test -p 7688:7687 -e NEO4J_AUTH=neo4j/gwa-test-password neo4j:2026.10-community
NEO4J_TEST_URI=bolt://localhost:7688 NEO4J_TEST_PASSWORD=gwa-test-password npm test
```

They cover, among other things (`aura/test/integration/`):

- **Plan, confirm, progress** (`operations.test.ts`): nothing reaches Aura before a confirm, a double confirm sends once, a stale plan is refused, a refusal from Aura fails the change with its reason, a lost answer is never sent again, a timeout, and restart recovery for each state a crash can leave.
- **Create, delete, passwords** (`lifecycle.test.ts`): a create stores the sealed password and links it; a lost answer is not retried; a delete needs the typed name and finishes only on a 404; a reveal is counted and audited and cannot happen unrecorded; a value copied onto another instance will not open; drift is reported without changing the stored copy.
- **Secrets** (`secrets.test.ts`, `service.test.ts`): the client secret and passwords appear nowhere in the database, a log or an error.
- **Sync** (`sync.test.ts`): idempotent, tags move, a removed instance is marked once, a failed run keeps what was there.

If port 7688 is taken (the dev compose file uses it for Neo4j), stop that stack first or use another port.

## 6. The edge

`edge/check.mjs` checks what the edge promises, against a running stack with the edge, without a browser:

```sh
EDGE_PASSWORD=<the sign-in password> node edge/check.mjs
```

It checks that every path asks for a sign-in, that a wrong user, wrong password, empty password and a Bearer token are refused, the security headers, `no-store` on GraphQL, that reads are compressed and a POST's answer is not, an oversized body, that writes to the app are refused, that only the edge is published (skipped with `DEV_PORTS=1` when the dev file is in use), and, with `LIMITED_URL` pointing at a second edge started with a low `EDGE_MUTATION_RATE`, that POSTs are refused with 429 while GETs are not.

## 7. Browser end-to-end checks

`npm run e2e -w web` drives a real Chrome through the whole flow and checks 201 behaviours: connect (first with a wrong secret), the gallery, filters, search, sync after something changed in Aura, edit, review, confirm and follow progress, pause and resume, a change Aura refuses, a stale plan, create with the stepper, the password behind the eye, check with Aura, delete with the name typed, the account page, disconnect and reconnect, and the theme. It runs on a phone-sized screen and a desktop-sized one and checks that nothing scrolls sideways, that every control has a name a screen reader can read, that each page has one heading, and that the browser logged no errors (under the strict content security policy, so a violation fails it).

```sh
podman compose -p gwa -f compose.yaml -f compose.dev.yaml down -v
podman compose -p gwa -f compose.yaml -f compose.dev.yaml up -d --build
npm run e2e -w web                       # http://localhost:3100
# through the edge instead:
#   scripts/init-env.sh --edge, add -f compose.edge.yaml, then
#   BASE_URL=https://localhost:8443 E2E_PASSWORD=<password> npm run e2e -w web
```

Setup, variables and caveats are in [web/e2e/README.md](../web/e2e/README.md). In short: it needs a **fresh** stack with the fake Aura (it stops at once if an account is already connected), and it changes things in the fake only: it creates and deletes instances there. `OUT=dir` writes about thirty screenshots. **Look at them.** The status chips stretched across every card and the phone top bar wrapping onto two lines both passed every check and showed up in screenshots.

## 8. Looking at what you changed

- Check the phone width (390 px) and dark mode for any visual change.
- Touch emulation matters: a fifth icon in the top bar made the page scroll sideways, and taps then missed their targets on a touch viewport only. The browser run's phone viewport has touch emulation for that reason.
- Pages that read a second query (the size options, a tenant's create options) render before it arrives. In the browser run, wait for what you are about to click.

## Checking your tests are real

For a guard that matters (the confirm check, the compare-and-set, the typed-name check, the no-retry rule, recording a reveal), break it on purpose and confirm a test fails, then restore it. Examples that have each made a test fail: removing the stale-plan check, removing the atomic confirm, enabling retry of a 5xx for changes, removing the typed-name check, keeping the password after a delete, dropping the audit event, and treating "destroying" as a finished delete. A guard no test notices is not guarded.

## Real Aura and its spec

mock-aura follows the OpenAPI file, so it shares the file's mistakes. A read-only run against a real account found that `graph_nodes` and `graph_relationships` arrive as numbers, and the first sync failed until they were stored as text. When code touches a new field, look at one real response. [real-account-checklist.md](real-account-checklist.md) says what has and has not been checked against real Aura, and how to do a first run safely.

## Continuous integration

`.github/workflows/ci.yml` has two jobs.

- **test**: install, typecheck, `npm audit --omit=dev --audit-level=high` (what ships), and `npm test` with a Neo4j service container, so the integration tests run.
- **stack**: start the stack on plain HTTP, check the committed supergraph is what the running subgraphs compose to, run the browser test, then switch to the edge and run the edge checks (including the rate limit on a second, low-limit edge) with only the edge published.

Actions are pinned by commit. The workflow's YAML parses and its commands are the ones run locally, but it has not been run on GitHub.

## When a check fails

- **`codegen` says `Cannot query field "x" on type "Y"`:** the running subgraphs do not have the field. Start the stack with the dev file, recompose the supergraph (`npm run compose:supergraph`), rebuild the gateway, and run codegen again.
- **CI says the supergraph differs:** you changed a subgraph schema and did not recompose. Recompose and commit it.
- **The first sync against a real account fails with "The store rejected a change":** the real API sent a shape the store did not expect. The store's message is not shown in the app on purpose; reproduce it with a real response.
- **The browser run fails on counts:** the stack is not fresh. Run `down -v` and start again.
- **The browser run clicks something that is not there yet:** a second query has not arrived. Wait for it with `waitFor`.
- **The edge refuses to start:** read its log. It needs `edge/secrets/htpasswd` (hashed with `htpasswd -B`), `tls.crt` and `tls.key`; run `scripts/init-env.sh --edge`. Its start-up script runs under BusyBox, where `grep` treats `\$` and `\|` in basic expressions differently from GNU grep, so use `grep -E` there.
- **502 from the edge after restarting the gateway or web container:** the edge looks them up again every ten seconds; wait, or check the container is running.
- **A test fails once in a full run and not alone:** `mock-aura`'s "429 with Retry-After" test failed once in a parallel run and passed in every later run. The cause is not known; rerun it alone before assuming a regression.
