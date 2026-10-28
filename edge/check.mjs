// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
// Checks what the edge promises, against a running stack. No browser needed.
//   EDGE_URL=https://localhost:8443 EDGE_USER=admin EDGE_PASSWORD=... node edge/check.mjs
// Optional: LIMITED_URL is a second edge started with EDGE_MUTATION_RATE=6r/m, to see mutations refused once the rate is passed.
import http from "node:http";
import https from "node:https";
import net from "node:net";

const EDGE = process.env.EDGE_URL ?? "https://localhost:8443";
const USER = process.env.EDGE_USER ?? "admin";
const PASSWORD = process.env.EDGE_PASSWORD;
if (!PASSWORD) {
  console.error("Set EDGE_PASSWORD (the password scripts/init-env.sh printed).");
  process.exit(2);
}

const results = [];
let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : extra ? `  [${extra}]` : ""}`);
};

const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

// The certificate is self-signed for localhost, so it is not checked here. What is checked is that TLS is what answers.
function request(base, path, { method = "GET", auth, body, headers = {} } = {}) {
  const url = new URL(path, base);
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(url, { method, rejectUnauthorized: false, headers: { ...(auth ? { Authorization: auth } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    req.end(body);
  });
}
const good = basic(USER, PASSWORD);
const probe = (host, port) => new Promise((resolve) => {
  const s = net.connect({ host, port, timeout: 1500 });
  s.on("connect", () => (s.destroy(), resolve(true)));
  s.on("error", () => resolve(false));
  s.on("timeout", () => (s.destroy(), resolve(false)));
});

const QUERY = "/graphql?query=%7B__typename%7D";

// Signing in
for (const path of ["/", "/instances", "/assets/does-not-matter.js", QUERY, "/favicon.svg"]) {
  const r = await request(EDGE, path);
  check(`${path} asks for a sign-in`, r.status === 401 && /basic/i.test(r.headers["www-authenticate"] ?? ""), `${r.status}`);
}
check("a wrong password is refused", (await request(EDGE, "/", { auth: basic(USER, "not-the-password") })).status === 401);
check("a wrong user is refused", (await request(EDGE, "/", { auth: basic("someone-else", PASSWORD) })).status === 401);
check("an empty password is refused", (await request(EDGE, "/", { auth: basic(USER, "") })).status === 401);
check("a made-up Bearer token is not a sign-in", (await request(EDGE, "/", { auth: "Bearer abc" })).status === 401);
check("the right password gets the app", (await request(EDGE, "/", { auth: good })).status === 200);
check("an app route falls back to the app shell once signed in", /<div id="root">/.test((await request(EDGE, "/instances/xyz", { auth: good })).text));
const q = await request(EDGE, QUERY, { auth: good });
check("the right password reaches the gateway", q.status === 200 && JSON.parse(q.text).data?.__typename === "Query", q.text.slice(0, 80));
check("the health check answers without a sign-in and says nothing", (await request(EDGE, "/healthz")).text.trim() === "ok");
check("the Server header carries no version", !/\d+\.\d+/.test((await request(EDGE, "/")).headers.server ?? ""));

// Headers
const page = await request(EDGE, "/", { auth: good });
const csp = page.headers["content-security-policy"] ?? "";
check("the page has a strict content security policy", /default-src 'none'/.test(csp) && /script-src 'self'(;|$)/.test(csp) && /frame-ancestors 'none'/.test(csp) && !/unsafe-/.test(csp), csp);
check("the page cannot be framed, sniffed or leak a referrer", page.headers["x-frame-options"] === "DENY" && page.headers["x-content-type-options"] === "nosniff" && page.headers["referrer-policy"] === "no-referrer");
check("the page needs no camera, microphone or location", /camera=\(\)/.test(page.headers["permissions-policy"] ?? ""));
check("HSTS is off until a real hostname is set", page.headers["strict-transport-security"] === undefined);
check("GraphQL answers are never cached", q.headers["cache-control"] === "no-store" && /default-src 'none'/.test(q.headers["content-security-policy"] ?? ""));

check("the gateway serves no query editor page", !/<html/i.test((await request(EDGE, "/graphql", { auth: good, headers: { Accept: "text/html" } })).text));

const BIG = encodeURIComponent("{ __schema { types { name description fields { name description } } } }");
const bigGet = await request(EDGE, `/graphql?query=${BIG}`, { auth: good, headers: { "Accept-Encoding": "gzip" } });
check("a large read is compressed", bigGet.headers["content-encoding"] === "gzip", String(bigGet.headers["content-encoding"]));
const bigPost = await request(EDGE, "/graphql", { method: "POST", auth: good, headers: { "Content-Type": "application/json", "Accept-Encoding": "gzip" }, body: JSON.stringify({ query: decodeURIComponent(BIG) }) });
check("the answer to a POST is never compressed", bigPost.status === 200 && bigPost.headers["content-encoding"] === undefined && bigPost.text.length > 1024, `${bigPost.status} ${bigPost.headers["content-encoding"]}`);
const js = /src="(\/assets\/[^"]+\.js)"/.exec(page.text)?.[1];
check("the app's script is compressed", js !== undefined && (await request(EDGE, js, { auth: good, headers: { "Accept-Encoding": "gzip" } })).headers["content-encoding"] === "gzip", String(js));

// What reaches the app
check("a body over 64 kB is refused at /graphql", (await request(EDGE, "/graphql", { method: "POST", auth: good, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "{ __typename }", pad: "x".repeat(70_000) }) })).status === 413);
check("the app's files cannot be written to", (await request(EDGE, "/index.html", { method: "PUT", auth: good, body: "x" })).status === 403);
check("a POST to the app shell is refused", (await request(EDGE, "/", { method: "POST", auth: good, body: "x" })).status === 403);

// What does not reach the network
const url = new URL(EDGE);
check("plain http is not answered on the edge's port", (await request(`http://${url.hostname}:${url.port}`, "/").catch(() => ({ status: 0 }))).status !== 200);
// Only the edge may be published. (The dev compose file publishes the rest on loopback, so this is skipped with DEV_PORTS=1.)
if (process.env.DEV_PORTS !== "1") {
  for (const [name, port] of [["the web container", 3100], ["the gateway", 4100], ["the store", 4001], ["the aura subgraph", 4010], ["the fake Aura", 4020], ["Neo4j's HTTP port", 7475], ["Neo4j's Bolt port", 7688]]) {
    check(`${name} is not published (port ${port})`, !(await probe(url.hostname, port)));
  }
}

if (process.env.LIMITED_URL) {
  const base = process.env.LIMITED_URL;
  const statuses = [];
  for (let i = 0; i < 60; i++) statuses.push((await request(base, "/graphql", { method: "POST", auth: good, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "{ __typename }" }) })).status);
  check("mutations (POSTs) are refused with 429 once the rate is passed", statuses.includes(429) && statuses[0] === 200, statuses.join(","));
  const reads = [];
  for (let i = 0; i < 25; i++) reads.push((await request(base, QUERY, { auth: good })).status);
  check("reads (GETs) are not held to the mutation rate", reads.every((s) => s === 200), reads.join(","));
}

console.log(results.join("\n"));
console.log(`\n${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
