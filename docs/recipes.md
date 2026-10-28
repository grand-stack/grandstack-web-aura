# Recipes

Step-by-step changes. Run commands from the repo root of `grandstack-web-aura`. Each recipe ends with how to check it.

> **Where to run this.** Commands on this page run inside a clone of this repository: `git clone https://github.com/grand-stack/grandstack-web-aura`, then `cd grandstack-web-aura` (Node 22 or later; run `npm ci` once). Commands that need the running stack use `podman compose` or `docker compose` with the compose files in this repo. Never point a recipe at a real Aura account unless it says so.

## Start the stack for development

```sh
scripts/init-env.sh                                                  # once: .env with the keys
podman compose -p gwa -f compose.yaml -f compose.dev.yaml up -d --build
```

The app is at http://localhost:3100 (connect with `mock-client` and `mock-secret`). `compose.dev.yaml` also publishes the gateway (4100), subgraphs (4001, 4010), mock-aura (4020) and Neo4j (7475, 7688) on loopback. Never use that file where other people can reach the machine.

## Show a new field Aura returns

Example: Aura adds `example_field` to the instance details, and you want it on the instance page.

1. Put the field in `docs/aura_api_spec_v1-2.yaml` and run `npm run generate:api`. Compare a **real** response too: real Aura has differed from its spec (`graph_nodes` is a number, not a string), and mock-aura follows the spec so it cannot catch that.
2. In `aura/src/sync.ts`, add it to `instanceProperties`. Store text fields with `String(value)` if the type is uncertain.
3. In `store/schema/schema.graphql`, add `exampleField: String` to `Instance`, with a description.
4. Start the stack with the dev file and run `npm run compose:supergraph`, then commit `gateway/supergraph.graphql`. CI fails if the committed file is not what the running subgraphs compose to.
5. In `web/src/graphql/documents.ts`, add `exampleField` to `DetailQuery`, run `npm run codegen -w web`, and render it in `web/src/pages/Detail.tsx`.
6. Add a case to `aura/test/sync-shapes.test.ts` for each shape you have seen (number, string, missing).
7. Check: `npm run typecheck && npm test`, then look at the instance page.

## Make another field editable

Example: let `example_setting` be changed with Aura's PATCH. A change touches every layer, and the compiler lists most of them.

1. `aura/src/operations/diff.ts`: add it to `Snapshot` and `Changes`, to `describe` (the plain-words diff row, and any warning), to `showsChanges` and to `sameSnapshot` (so a plan goes stale when it changes).
2. `aura/src/operations/plan.ts`: validate and normalise it in `normaliseChanges`, and keep it only if it differs from now.
3. `aura/src/operations/store.ts`: select it in `loadInstance` and copy it in `snapshotOf`.
4. `aura/src/operations/run.ts`: send it in `toAuraBody`, and add it to `expectation`'s `matches`. **Done means Aura shows the value,** not only that the instance is running again.
5. `aura/src/schema.ts`: add it to `InstanceChange`, with a description.
6. Web: `web/src/lib/changes.ts` (`EditOriginal`, `EditForm`, `buildChange`), then the control in `web/src/pages/Edit.tsx` and the field in `EditQuery`.
7. Tests: cases in `aura/test/operations.test.ts` (plan, normalise, stale), `aura/test/integration/operations.test.ts` (an edit that changes it, end to end against mock-aura), and `web/src/lib/changes.test.ts`. Extend mock-aura's PATCH in `mock-aura/src/server.ts` if it does not know the field, and keep its contract test passing.
8. Recompose the supergraph and run codegen as in the previous recipe.

## Add a kind of change

Example: a new operation such as a snapshot. Follow how Pause was added.

1. `store/schema/schema.graphql`: add the value to `OperationKind` (if it is not there) and recompose the supergraph.
2. `aura/src/operations/state.ts`: add it to `OperationKind` (or `PlannableKind` if it targets an existing instance).
3. `aura/src/operations/diff.ts`: say what the review shows. `plan.ts`: add the checks it needs (which statuses it is allowed in) in `guardKind`.
4. `aura/src/client.ts`: add the request. A change must **not** be retried after a 5xx or a lost connection. Use `request` or `requestWithStatus` with a method other than GET: a 5xx is retried only for GET.
5. `aura/src/operations/run.ts`: add what it sends and what "done" looks like to `expectation`. If "done" is an absence (like a delete's 404), use `gone`.
6. `aura/src/operations/service.ts`: a `plan...` method, and what recovery does after a restart if it was possibly sent. When in doubt, fail and say so; never send twice.
7. `aura/src/schema.ts`: a `plan...` mutation that returns only an id. Update the exact mutation list in `gateway/test/supergraph.test.ts`.
8. Web: a button on `Detail.tsx` that plans it, a verb in `operationVerb` (`web/src/lib/changes.ts`) and a label in `web/src/lib/operations.ts`.
9. Tests for each layer, including: nothing is sent before a confirm, confirming twice sends once, and a possibly-sent change is not sent again after a restart.

## Add a gallery filter

Example: filter by region.

1. `web/src/lib/filters.ts`: add the field to `Filters`, read it in `parseFilters`, write it in `serializeFilters`, count it in `activeCount`, and add its clause in `buildWhere` (use the `omit` parameter if its counts should ignore itself). Add it to `emptyFilters` with an explicit value, or "Clear all" will not clear it.
2. `web/src/FilterPanel.tsx`: add the group, and `web/src/pages/Results.tsx`: a removable chip.
3. Add cases to `web/src/lib/filters.test.ts` (URL round trip, where clause, counts, clearing).
4. Check: `npm test -w web`, then open `/instances?...` with the new parameter, and reload to confirm it persists.

## Add a page

1. Create `web/src/pages/Thing.tsx`, with its operation written in `web/src/graphql/documents.ts`.
2. Add a `<Route>` in `web/src/App.tsx`.
3. Run `npm run codegen -w web` (needs the stack with the dev file) and `npm run typecheck`.
4. Operation names must be unique across the app (codegen fails on duplicates).
5. Add the page to the browser run (`web/e2e/run.mjs`) so it is checked on a phone-sized screen for sideways scrolling and for control names.

## Add a tier or a cloud

1. `aura/src/status.ts` (`TIER_LABELS`) and `web/src/lib/create.ts` (`TIER_LABELS` and its order) for a tier. `web/src/lib/format.ts` (`CLOUDS`) and `web/src/lib/poster.ts` (`GRADIENTS`) for a cloud.
2. Add the value to the tests that list them (`aura/test/status.test.ts`, `web/src/lib/create.test.ts`).

## Make the fake Aura misbehave

mock-aura has fault injection for testing failure paths. Set it in a test with `w.mock.state.faults = {...}`, or over HTTP with `POST /__faults` (and `DELETE /__faults` to clear).

| Fault | Effect |
| --- | --- |
| `rejectNext: { status, message, reason }` | The next change (create, edit, pause, resume, delete) is refused with that error, once, and nothing is done. |
| `dropNext: true` | The next change is **done**, but the connection is cut before the answer, so the caller cannot tell. |
| `endAs: "loading failed"` | Asynchronous steps end in that status instead of the expected one. |
| `stall: true` | Asynchronous steps never finish. |

`GET /__passwords/:id` returns the password Aura showed for a created instance, so a test can compare it with what the app shows. `reset()` clears the faults. Use `dropNext` to test "never sent twice".

## Change the sign-in password, or serve a phone

```sh
EDGE_PASSWORD=your-password scripts/init-env.sh --new-password              # or leave it out for a random one
EDGE_SAN="IP:192.168.0.5,DNS:mylaptop.local" scripts/init-env.sh --new-cert
echo "EDGE_BIND=0.0.0.0" >> .env
podman compose -p gwa -f compose.yaml -f compose.edge.yaml up -d --force-recreate edge
```

Then open `https://192.168.0.5:8443` on the phone and accept the certificate warning. A password you choose is as strong as you make it: the edge only limits guessing to about 20 requests a second per address. Read [deploying.md](deploying.md) first.

## Point it at a real Aura account

Read [real-account-checklist.md](real-account-checklist.md). Then set `AURA_BASE_URL=https://api.neo4j.io` in `.env` and start the stack. Connect with a client ID and secret from the Aura Console, read first, and create, change or delete only what you can afford to lose. Pass credentials in the browser form or the environment; never write them to a file or a commit. Tear the stack down with `down -v` afterwards so the sealed secret does not stay in a volume.

## Before you commit

```sh
npm run typecheck && npm test && npm run docs:check
# with a Neo4j (see testing.md), for changes to store/ or aura/:
NEO4J_TEST_URI=bolt://localhost:7688 NEO4J_TEST_PASSWORD=... npm test
# with a fresh stack:
npm run e2e -w web
```

If you changed a subgraph's schema, recompose the supergraph and commit it. If you changed a GraphQL document, run codegen and commit `web/src/graphql/generated/`.
