# Before using a real Aura account

Everything so far has run against `mock-aura`, a fake of the Aura API that is checked against Aura's own OpenAPI file. A fake can still be wrong about things the file does not say. This is what to do the first time the app talks to a real account, and what has **not** been checked yet.

## Not yet checked against real Aura

- **The status values and timings.** The app knows the 13 statuses in the spec, and treats any other as "in progress". How long a create, resize, pause or delete really takes is not known here. `OPERATION_TIMEOUT_MS` defaults to 30 minutes.
- **What PATCH answers.** The app handles 200 (applied) and 202 (carried out in the background). Whether a resize and a rename in one request behave as the fake does is untested.
- **Rate limits.** The client honours `Retry-After` and pauses all requests after a 429, but the real limit, and how a sync of many instances fares, have not been seen. `SYNC_CONCURRENCY` (default 3) is a guess.
- **Neo4j version.** Aura's instance details do not carry it, so only instances created here record one.
- **Real phones.** The app has been checked in a headless Chrome at 390 px, with touch emulation. It has not been tried on an iPhone or an Android phone: tap targets, the on-screen keyboard over the delete confirmation, and the home screen's safe areas.

## A first run, safely

1. Make a **separate test tenant** (Aura project) that holds nothing you need, and a client id and secret for it. The secret cannot be limited to one project, so use an account where deleting is survivable.
2. Start the stack as usual, set `AURA_BASE_URL=https://api.neo4j.io` in `.env`, and restart `aura`. `ALLOW_INSECURE_AURA_URL` has no effect on https.
3. Connect, and watch the first sync: `docker compose -p gwa logs aura`. It should end in SUCCEEDED or SLOWED. Check that the instances, sizes and regions match the Console.
4. Create the **smallest free or cheapest instance** from the app. Check the review says what you expect, that the password shows, and that the instance appears in the Console with the same name and size.
5. Edit its name, pause it, resume it, and delete it, each from the app. After each, compare the Console, and write down how long Aura took.
6. Change something in the Console, then press "Check with Aura" on the instance. It should list the difference without changing anything.
7. Note the timings and any status the app showed as unfamiliar, and put them in PLAN.md.

## Never

- Point `compose.dev.yaml`'s unauthenticated ports at a real account, or run the browser test (`npm run e2e -w web`) against one. It connects, creates and deletes.
