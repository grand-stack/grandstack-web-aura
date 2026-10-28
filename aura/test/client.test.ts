// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createMockAura, type MockAura } from "../../mock-aura/src/server.js";
import { AuraApiError, AuraAuthError, AuraClient, AuraUnreachableError, retryAfterMs, type AuraClientOptions } from "../src/client.js";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

/** A fetch that answers from a script, so each test decides exactly what Aura says. */
function scripted(replies: (Response | ((req: { url: string; init: RequestInit }) => Response))[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const next = replies.shift();
    if (!next) throw new Error(`Unexpected request to ${url}`);
    return typeof next === "function" ? next({ url: String(url), init }) : next;
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

const token = (value = "tok", expires_in = 3600) => json(200, { access_token: value, token_type: "bearer", expires_in });
const tenants = () => json(200, { data: [{ id: "t1", name: "Prod" }] });

function make(replies: Parameters<typeof scripted>[0], over: Partial<AuraClientOptions> = {}) {
  const script = scripted(replies);
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const credentialReads = { n: 0 };
  const client = new AuraClient({
    baseUrl: "https://aura.test",
    fetch: script.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    credentials: async () => {
      credentialReads.n++;
      return { clientId: "id", clientSecret: "secret" };
    },
    ...over,
  });
  return { client, sleeps, calls: script.calls, credentialReads, advance: (ms: number) => (clock += ms) };
}

describe("tokens", () => {
  it("asks for one with Basic auth and the client_credentials grant, then sends it as a bearer", async () => {
    const t = make([token("abc"), tenants()]);
    await t.client.listTenants();
    const [tokenCall, apiCall] = t.calls;
    expect(tokenCall!.url).toBe("https://aura.test/oauth/token");
    expect((tokenCall!.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
    expect(tokenCall!.init.body).toBe("grant_type=client_credentials");
    expect(apiCall!.url).toBe("https://aura.test/v1/tenants");
    expect((apiCall!.init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
  });

  it("reuses a token between requests, and reads the credentials only when it needs a token", async () => {
    const t = make([token(), tenants(), tenants(), tenants()]);
    await t.client.listTenants();
    await t.client.listTenants();
    await t.client.listTenants();
    expect(t.calls.filter((c) => c.url.endsWith("/oauth/token"))).toHaveLength(1);
    expect(t.credentialReads.n).toBe(1);
  });

  it("shares one token request between requests that start together", async () => {
    const t = make([token(), tenants(), tenants(), tenants()]);
    await Promise.all([t.client.listTenants(), t.client.listTenants(), t.client.listTenants()]);
    expect(t.calls.filter((c) => c.url.endsWith("/oauth/token"))).toHaveLength(1);
  });

  it("gets a new token shortly before the old one expires", async () => {
    const t = make([token("one", 3600), tenants(), token("two", 3600), tenants()]);
    await t.client.listTenants();
    t.advance(3600 * 1000 - 30_000); // inside the 60 s margin
    await t.client.listTenants();
    expect((t.calls[3]!.init.headers as Record<string, string>).Authorization).toBe("Bearer two");
  });

  it("uses a fallback lifetime when the response gives none", async () => {
    const t = make([json(200, { access_token: "x" }), tenants(), tenants()]);
    await t.client.listTenants();
    t.advance(1000 * 1000);
    await t.client.listTenants();
    expect(t.calls.filter((c) => c.url.endsWith("/oauth/token"))).toHaveLength(1);
  });

  it("throws AuraAuthError when Aura refuses the credentials, for each status it uses for that", async () => {
    for (const status of [400, 401, 403]) {
      const t = make([json(status, { error: "invalid_client" })]);
      await expect(t.client.checkCredentials()).rejects.toBeInstanceOf(AuraAuthError);
    }
  });

  it("gets a fresh token once if the API says the token is no good, then succeeds", async () => {
    const t = make([token("old"), json(403, { error: "expired" }), token("new"), tenants()]);
    expect(await t.client.listTenants()).toEqual([{ id: "t1", name: "Prod" }]);
    expect((t.calls[3]!.init.headers as Record<string, string>).Authorization).toBe("Bearer new");
  });

  it("gives up if the fresh token is refused too", async () => {
    const t = make([token("old"), json(401, { error: "no" }), token("new"), json(401, { error: "no" })]);
    await expect(t.client.listTenants()).rejects.toMatchObject({ name: "AuraApiError", status: 401 });
  });
});

describe("rate limits", () => {
  it("waits as long as Retry-After says, then tries again", async () => {
    const t = make([token(), json(429, { error: "slow down" }, { "Retry-After": "7" }), tenants()]);
    expect(await t.client.listTenants()).toHaveLength(1);
    expect(t.sleeps).toEqual([7000]);
    expect(t.client.stats).toMatchObject({ rateLimited: 1, retries: 1 });
  });

  it("makes a request that starts during the pause wait too, not just the one that was refused", async () => {
    let clock = 1_000_000;
    const sleeps: number[] = [];
    const releases: (() => void)[] = [];
    const script = scripted([token(), json(429, { error: "slow" }, { "Retry-After": "5" }), tenants(), tenants()]);
    const client = new AuraClient({
      baseUrl: "https://aura.test",
      fetch: script.fetch,
      now: () => clock,
      // A sleep that holds until the test lets it go, so we can start the second request in the middle of the pause
      sleep: (ms) => new Promise<void>((resolve) => { sleeps.push(ms); releases.push(resolve); }),
      credentials: async () => ({ clientId: "id", clientSecret: "secret" }),
    });

    const first = client.listTenants();
    await vi.waitFor(() => expect(sleeps).toHaveLength(1)); // the first request was refused and is now waiting
    expect(sleeps[0]).toBe(5000);

    const second = client.listTenants(); // starts while the pause is on
    await vi.waitFor(() => expect(sleeps).toHaveLength(2)); // it waits too, instead of going straight to Aura
    expect(sleeps[1]).toBe(5000);
    expect(script.calls.filter((c) => c.url.endsWith("/v1/tenants"))).toHaveLength(1); // only the refused call has reached Aura

    clock += 5000;
    releases.forEach((release) => release());
    await Promise.all([first, second]);
    expect(client.stats.rateLimited).toBe(1);
  });

  it("reads Retry-After as an HTTP date too, and falls back to 5 s when it is missing", async () => {
    const t = make([token(), json(429, { error: "x" }), tenants()]);
    await t.client.listTenants();
    expect(t.sleeps).toEqual([5000]);
    const date = new Response(null, { headers: { "Retry-After": new Date(1_000_000 + 9000).toUTCString() } });
    expect(retryAfterMs(date, 1_000_000 - (1_000_000 % 1000))).toBeGreaterThanOrEqual(8000);
    expect(retryAfterMs(new Response(null, { headers: { "Retry-After": "garbage" } }), 0)).toBeUndefined();
  });

  it("gives up after the retries are used up, saying 429", async () => {
    const t = make([token(), ...Array.from({ length: 3 }, () => json(429, { error: "slow" }, { "Retry-After": "1" }))], { maxRetries: 2 });
    await expect(t.client.listTenants()).rejects.toMatchObject({ status: 429 });
    expect(t.client.stats.rateLimited).toBe(3);
  });

  it("does not wait for an unreasonable Retry-After", async () => {
    const t = make([token(), json(429, { error: "slow" }, { "Retry-After": "3600" })]);
    await expect(t.client.listTenants()).rejects.toThrow("asked us to wait 3600 seconds");
    expect(t.sleeps).toEqual([]);
  });

  it("also backs off when the token endpoint is rate limited", async () => {
    const t = make([json(429, { error: "slow" }, { "Retry-After": "3" }), token(), tenants()]);
    await t.client.listTenants();
    expect(t.sleeps).toEqual([3000]);
  });
});

describe("server errors", () => {
  it("retries a 503 with growing waits, then succeeds", async () => {
    const t = make([token(), json(503, { error: "down" }), json(502, { error: "down" }), tenants()]);
    await t.client.listTenants();
    expect(t.sleeps).toHaveLength(2);
    expect(t.sleeps[0]!).toBeGreaterThanOrEqual(500);
    expect(t.sleeps[1]!).toBeGreaterThan(t.sleeps[0]!);
    expect(t.client.stats.retries).toBe(2);
  });

  it("gives up on a 500 after the retries and reports it", async () => {
    const t = make([token(), ...Array.from({ length: 3 }, () => json(500, { errors: [{ message: "boom", reason: "bug" }] }))], { maxRetries: 2 });
    await expect(t.client.listTenants()).rejects.toMatchObject({ status: 500, problems: [{ message: "boom", reason: "bug" }] });
  });

  it("does not retry a 404 and passes on what Aura said", async () => {
    const t = make([token(), json(404, { errors: [{ message: "DB not found: x", reason: "db-not-found" }] })]);
    const err = (await t.client.getInstance("x").catch((e) => e)) as AuraApiError;
    expect(err).toBeInstanceOf(AuraApiError);
    expect(err.status).toBe(404);
    expect(err.problems).toEqual([{ message: "DB not found: x", reason: "db-not-found", field: undefined }]);
    expect(t.sleeps).toEqual([]);
  });

  it("copes with an error body that is not JSON", async () => {
    const t = make([token(), new Response("<html>bad gateway</html>", { status: 418, statusText: "I'm a teapot" })]);
    await expect(t.client.listTenants()).rejects.toMatchObject({ status: 418, problems: [{ message: "I'm a teapot" }] });
  });
});

describe("an unreachable Aura", () => {
  it("is reported as unreachable, without the address or the underlying error", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed: connect ECONNREFUSED 10.1.2.3:443");
    }) as unknown as typeof fetch;
    const t = make([], { fetch: failing });
    const err = (await t.client.listTenants().catch((e) => e)) as Error;
    expect(err).toBeInstanceOf(AuraUnreachableError);
    expect(err.message).toBe("Could not reach Aura");
    expect(JSON.stringify(err)).not.toContain("10.1.2.3");
  });
});

describe("requests", () => {
  it("builds the paths and escapes ids", async () => {
    const t = make([token(), tenants(), json(200, { data: { id: "a/b" } }), json(200, { data: [] }), json(200, { data: [] })]);
    await t.client.listTenants();
    await t.client.getTenant("a/b");
    await t.client.listInstances();
    await t.client.listInstances("t 1");
    expect(t.calls.slice(2).map((c) => c.url)).toEqual([
      "https://aura.test/v1/tenants/a%2Fb",
      "https://aura.test/v1/instances",
      "https://aura.test/v1/instances?tenantId=t%201",
    ]);
  });

  it("counts requests and can reset the count", async () => {
    const t = make([token(), tenants(), tenants()]);
    await t.client.listTenants();
    await t.client.listTenants();
    expect(t.client.stats.requests).toBe(3); // one token request and two API requests
    t.client.resetStats();
    expect(t.client.stats).toEqual({ requests: 0, retries: 0, rateLimited: 0 });
  });
});

describe("against mock-aura", () => {
  let mock: MockAura;
  let base: string;
  beforeAll(async () => {
    mock = createMockAura({ stepMs: 10 });
    base = `http://127.0.0.1:${await mock.listen(0)}`;
  });
  afterAll(() => mock.close());

  const real = (clientSecret = "mock-secret") => new AuraClient({ baseUrl: base, credentials: async () => ({ clientId: "mock-client", clientSecret }) });

  it("reads tenants(), a tenant's options, the instance list and one instance", async () => {
    const client = real();
    const list = await client.listTenants();
    expect(list.map((t) => t.name)).toEqual(["Acme Production", "Acme Staging", "Acme Labs"]);
    const detail = await client.getTenant(list[0]!.id);
    expect(detail.instance_configurations).toHaveLength(24);
    const summaries = await client.listInstances();
    expect(summaries).toHaveLength(6);
    expect((await client.listInstances(list[0]!.id)).map((i) => i.name).sort()).toEqual(["analytics-gds", "orders-prod", "search-prod"]);
    const orders = await client.getInstance("a1b2c3d4");
    expect(orders).toMatchObject({ name: "orders-prod", status: "running", type: "professional-db", memory: "8GB", storage: "16GB" });
  });

  it("rejects wrong credentials with AuraAuthError", async () => {
    await expect(real("wrong").checkCredentials()).rejects.toBeInstanceOf(AuraAuthError);
  });

  it("reports a missing instance as a 404 with the reason Aura gives", async () => {
    await expect(real().getInstance("nope")).rejects.toMatchObject({ status: 404, problems: [{ reason: "db-not-found" }] });
  });
});
