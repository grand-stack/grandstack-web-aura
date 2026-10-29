// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
// Browser end-to-end checks. Drives a real Chrome through the whole flow against the running stack (see e2e/README.md).
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

// By default the app is the web server on plain HTTP. With the edge in front (BASE_URL=https://localhost:8443) set E2E_PASSWORD to the sign-in
// password scripts/init-env.sh --edge printed.
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const GATEWAY = process.env.GRAPHQL_URL ?? `${BASE}/graphql`;
const USER = process.env.E2E_USER ?? "admin";
const PASSWORD = process.env.E2E_PASSWORD;
if (!PASSWORD && BASE.startsWith("https:")) {
  console.error("Set E2E_PASSWORD to the sign-in password scripts/init-env.sh --edge printed.");
  process.exit(2);
}
const AUTH = PASSWORD ? `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString("base64")}` : undefined;
// Calls made from this script (not the browser) trust the local certificate too
if (BASE.startsWith("https:") && new URL(BASE).hostname === "localhost") process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const CHROME_ARGS = ["--no-sandbox", "--ignore-certificate-errors"];
const MOCK = process.env.MOCK_AURA_URL ?? "http://localhost:4020";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = process.env.OUT; // optional directory for screenshots
const SECRET = "mock-secret";
const CLIENT_ID = "mock-client";
if (OUT) mkdirSync(OUT, { recursive: true });

const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1280, height: 860 };

const results = [];
const problems = [];
let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : extra ? `  [${extra}]` : ""}`);
};

// If the run dies half way, say what had passed and where it stopped, instead of only a stack trace
process.on("uncaughtException", (e) => {
  console.log(results.join("\n"));
  console.log(`\nCRASHED at ${page ? page.url() : "start"}: ${e.message}`);
  if (problems.length) console.log("Problems seen in the browser:\n  " + [...new Set(problems)].slice(0, 8).join("\n  "));
  process.exit(1);
});

let browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
let page;
let loads = 0;

// Headless Chrome can die after a number of page loads in some environments, so start a fresh one every few loads
async function freshPage(viewport = DESKTOP, relaunch = false) {
  if (relaunch) {
    await browser.close().catch(() => {});
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
    loads = 0;
  } else if (page) await page.close().catch(() => {});
  page = await browser.newPage();
  if (PASSWORD) await page.authenticate({ username: USER, password: PASSWORD });
  await page.setViewport(viewport);
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(`console.${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED") problems.push(`requestfailed: ${r.failure()?.errorText} ${r.url().slice(0, 80)}`); });
}
async function open(path, viewport) {
  if (viewport) await freshPage(viewport, ++loads > 4);
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { if (OUT) await page.screenshot({ path: `${OUT}/${name}.png` }); };
const text = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const texts = (sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.trim()));
const count = (sel) => page.$$eval(sel, (els) => els.length);
const url = () => new URL(page.url());
const waitFor = (fn, arg, timeout = 15000) => page.waitForFunction(fn, { timeout }, arg).then(() => true).catch(() => false);
const waitText = (selector, expected, timeout) =>
  waitFor(([s, t]) => [...document.querySelectorAll(s)].some((e) => e.textContent.includes(t)), [selector, expected], timeout);
const clickByText = (selector, label) =>
  page.evaluate(([s, t]) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().startsWith(t)); if (!el) return false; el.click(); return true; }, [selector, label]);
const overflowing = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const typeInto = async (selector, value) => {
  // Select programmatically: a triple-click does not select the text in every headless Chrome
  await page.focus(selector);
  await page.$eval(selector, (e) => e.select());
  await page.keyboard.press("Backspace");
  if (value) await page.type(selector, value);
};

async function gql(query, variables) {
  const res = await fetch(GATEWAY, { method: "POST", headers: { "Content-Type": "application/json", ...(AUTH ? { Authorization: AUTH } : {}) }, body: JSON.stringify({ query, variables }) });
  return (await res.json()).data;
}
async function auraToken() {
  const res = await fetch(`${MOCK}/oauth/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  return (await res.json()).access_token;
}

/** Every interactive element must have a name a screen reader can read, and every page one heading. */
async function accessibility(label) {
  const unnamed = await page.evaluate(() => {
    const nameOf = (el) => {
      const aria = el.getAttribute("aria-label");
      if (aria) return aria.trim();
      const by = el.getAttribute("aria-labelledby");
      if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      if (el.labels?.length) return [...el.labels].map((l) => l.textContent).join(" ").trim();
      return (el.textContent ?? "").trim();
    };
    return [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select")].filter((el) => !nameOf(el)).map((el) => el.outerHTML.slice(0, 90));
  });
  check(`${label}: every button, link and field has a name`, unnamed.length === 0, unnamed.join(" | "));
  check(`${label}: exactly one h1`, (await count("h1")) === 1, String(await count("h1")));
}

// ───────────────────────────── Precondition ─────────────────────────────
const before = await gql(`{ auraSetup { required connected } }`);
if (!before?.auraSetup?.required) {
  console.log("The stack already has an Aura account connected. Run this against a freshly started stack (compose down -v, then up). See e2e/README.md.");
  await browser.close();
  process.exit(2);
}

// ───────────────────────────── 1. Setup, on a phone ─────────────────────────────
await open("/", PHONE);
check("a fresh app asks to connect an account", await waitText("h1", "Connect your Aura account"));
check("there is no navigation before connecting", (await count(".topnav")) === 0);
check("setup fits a phone (no sideways scroll)", !(await overflowing()));
await accessibility("setup");
await shot("01-setup-mobile");

// wrong secret
await typeInto("#client-id", CLIENT_ID);
await typeInto("#client-secret", "definitely-wrong");
check("the connect button waits for both fields", !(await page.$eval("button[type=submit]", (b) => b.disabled)));
await page.click("button[type=submit]");
check("a wrong secret is refused with a plain message", await waitText(".banner-danger", "Aura rejected that client id and secret"));
check("the secret field is cleared after an attempt", (await page.$eval("#client-secret", (e) => e.value)) === "");
check("still on the connect page after a refusal", (await text("h1")) === "Connect your Aura account");
await shot("02-setup-refused");

// right secret
await typeInto("#client-secret", SECRET);
await page.click("button[type=submit]");
check("the right credentials lead to the home page", await waitText("h1", "Find an instance", 30000));
check("the secret is not left in the page", !(await page.evaluate(() => document.body.innerHTML)).includes(SECRET));
check("the secret is not in storage or the URL", !(await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }) + location.href)).includes(SECRET));

// ───────────────────────────── 2. Home ─────────────────────────────
check("home counts the instances and tenants", await waitText(".hero .sub", "6 instances across 3 tenants"), await text(".hero .sub"));
const tags = await texts(".taggroup .tag");
check("tenant tags with counts", ["Acme Production · 3", "Acme Staging · 2", "Acme Labs · 1"].every((t) => tags.includes(t)), tags.join(" | "));
check("cloud tags with counts", ["GCP · 3", "AWS · 2", "Azure · 1"].every((t) => tags.includes(t)), tags.join(" | "));
check("tier tags with counts", ["AuraDB Professional · 5", "AuraDB Business Critical · 1"].every((t) => tags.includes(t)), tags.join(" | "));
check("a 'Needs attention' row and a 'Running' row", (await texts(".rowhead h2")).join("|") === "Needs attention|Running", (await texts(".rowhead h2")).join("|"));
check("six cards on home", (await count(".cardrow .card")) === 6, String(await count(".cardrow .card")));
check("the paused instance is under 'Needs attention'", (await texts("section[aria-label='Needs attention'] .card .name")).join() === "dev-sandbox");
check("home fits a phone", !(await overflowing()));
check("the phone top bar fits on one line", await page.$eval(".topbar", (e) => e.getBoundingClientRect().height < 70));
check("the phone top bar drops the Instances icon (home is the way in)", !(await page.$eval(".navlink.instances", (e) => getComputedStyle(e).display !== "none")));
check("the phone shows icons in the top bar, not labels", !(await page.$eval(".navlink .label", (e) => getComputedStyle(e).display !== "none")));
await accessibility("home");
await shot("03-home-mobile");

// ───────────────────────────── 3. Results and filters, on a wide screen ─────────────────────────────
await open("/instances?c=gcp", DESKTOP);
check("a cloud tag opens the filtered list", await waitText(".countline", "3 of 6 instances"), await text(".countline"));
check("three GCP instances", (await count(".cards .card")) === 3);
const facet = async (group) => page.$$eval(".sidebar fieldset", (sets, g) => {
  const set = sets.find((s) => s.querySelector("legend")?.textContent === g);
  return set ? [...set.querySelectorAll(".check")].map((c) => [c.querySelector(".label").textContent, Number(c.querySelector(".count")?.textContent), c.querySelector("input").disabled, c.querySelector("input").checked]) : null;
}, group);
const tenantFacet = await facet("Tenant");
check("tenant counts follow the cloud filter (Labs 0 and disabled, Production 2, Staging 1)",
  JSON.stringify(tenantFacet) === JSON.stringify([["Acme Labs", 0, true, false], ["Acme Production", 2, false, false], ["Acme Staging", 1, false, false]]), JSON.stringify(tenantFacet));
const cloudFacet = await facet("Cloud");
check("the cloud counts ignore their own filter (GCP 3, AWS 2, Azure 1, GCP ticked)",
  JSON.stringify(cloudFacet) === JSON.stringify([["AWS", 2, false, false], ["Azure", 1, false, false], ["GCP", 3, false, true]]), JSON.stringify(cloudFacet));
check("the status counts follow the filter (3 ready, 0 stopped)", JSON.stringify((await facet("Status")).map((r) => [r[0], r[1]])) === JSON.stringify([["Ready", 3], ["Stopped", 0], ["In progress", 0], ["Failed", 0]]), JSON.stringify(await facet("Status")));
check("the desktop shows the sidebar and hides the Filters button", (await page.$eval(".sidebar", (e) => getComputedStyle(e).display !== "none")) && (await page.$eval(".filtersbutton", (e) => getComputedStyle(e).display === "none")));
check("the desktop top bar has labelled links", (await texts(".navlink .label")).join() === "Instances,Operations,Aura account");
await shot("04-results-desktop");

// tick a tenant
await clickByText(".sidebar .check", "Acme Production");
check("ticking a tenant narrows the list and writes the URL", (await waitText(".countline", "2 of 6 instances")) && url().searchParams.get("c") === "gcp" && !!url().searchParams.get("t"), url().search);
check("a removable chip for each filter that is on", (await texts(".tag-removable")).join("|").includes("GCP") && (await texts(".tag-removable")).join("|").includes("Acme Production"), (await texts(".tag-removable")).join("|"));
await page.click(".tag-removable button");
check("removing a chip widens the list again", await waitText(".countline", "3 of 6 instances"));
await clickByText("button", "Clear all");
check("clear all shows everything", (await waitText(".countline", "6 instances")) && url().search === "", url().search);

// search. Regression: a pause in the middle of typing must not lose or garble what is typed after it
await typeInto("#results-search", "");
await page.type("#results-search", "ord");
await sleep(500); // longer than the pause before the URL is written
await page.type("#results-search", "ers");
await sleep(700);
check("typing across a pause keeps every key", (await page.$eval("#results-search", (e) => e.value)) === "orders" && url().searchParams.get("q") === "orders", `${await page.$eval("#results-search", (e) => e.value)} / ${url().search}`);
await page.type("#results-search", "x");
await sleep(700);
check("and keeps typing afterwards", (await page.$eval("#results-search", (e) => e.value)) === "ordersx", await page.$eval("#results-search", (e) => e.value));
await typeInto("#results-search", "");
await sleep(500);
check("a removed search chip empties the box (the URL flowing back in)", await (async () => {
  await typeInto("#results-search", "prod");
  await waitFor(() => new URLSearchParams(location.search).get("q") === "prod");
  await page.click(".tag-removable button");
  return waitFor(() => document.querySelector("#results-search").value === "");
})());
await typeInto("#results-search", "Orders");
check("search is found whatever its case", (await waitText(".countline", "1 of 6 instances")) && (await texts(".cards .card .name")).join() === "orders-prod", (await texts(".cards .card .name")).join());
check("search is in the URL", url().searchParams.get("q") === "Orders");
await typeInto("#results-search", "zzz-no-match");
check("a search with no match says so", (await waitText(".emptystate h2", "Nothing matches")) && (await count(".emptystate .btn")) === 1);
await typeInto("#results-search", "");
await waitText(".countline", "6 instances");

// sort
await page.select("select.input", "memory");
await waitFor(() => document.querySelector(".cards .card .name")?.textContent === "analytics-gds");
check("largest first sorts memory as a number", (await texts(".cards .card .name")).join() === "analytics-gds,search-prod,orders-prod,billing-staging,recs-staging,dev-sandbox", (await texts(".cards .card .name")).join());
await page.select("select.input", "status");
await waitFor(() => document.querySelector(".cards .card .name")?.textContent === "dev-sandbox");
check("needs-attention-first puts the paused instance first", (await texts(".cards .card .name"))[0] === "dev-sandbox");
check("the sort is in the URL", url().searchParams.get("s") === "status");
check("results fit a wide screen", !(await overflowing()));
await accessibility("results");

// ───────────────────────────── 4. Results on a phone: the filter sheet ─────────────────────────────
await open("/instances", PHONE);
await waitText(".countline", "6 instances");
check("a phone hides the sidebar and shows a Filters button", !(await page.$eval(".sidebar", (e) => getComputedStyle(e).display !== "none")) && (await page.$eval(".filtersbutton", (e) => getComputedStyle(e).display !== "none")));
check("a status chip keeps its own width and does not stretch across the card", await page.$eval(".card .status", (c) => c.getBoundingClientRect().width < c.closest(".card").getBoundingClientRect().width / 2));
check("the cards are compact rows on a phone", (await page.$eval(".card-adaptive", (e) => getComputedStyle(e).display)) === "flex");
await shot("05-results-mobile");
await page.click(".filtersbutton");
check("the Filters button opens a sheet", await waitFor(() => document.querySelector("dialog.modal")?.open === true));
check("the sheet is focused inside, not behind", await page.evaluate(() => document.querySelector("dialog.modal").contains(document.activeElement)));
await shot("06-filters-sheet");
await page.evaluate(() => [...document.querySelectorAll("dialog.modal .check")].find((c) => c.textContent.startsWith("Azure")).querySelector("input").click());
check("ticking Azure in the sheet filters the list behind it", (await waitFor(() => /1 of 6/.test(document.querySelector(".countline")?.textContent ?? ""))) && url().searchParams.get("c") === "azure", url().search);
check("the sheet's button says what you will see", (await texts("dialog.modal .modal-foot .btn")).some((t) => t === "Show 1 instance"), (await texts("dialog.modal .modal-foot .btn")).join("|"));
await page.keyboard.press("Escape");
check("Escape closes the sheet", await waitFor(() => document.querySelector("dialog.modal")?.open === false));
check("the Filters button shows how many are on", (await text(".filtersbutton .badge")) === "1");
check("results fit a phone", !(await overflowing()));

// ───────────────────────────── 5. Detail ─────────────────────────────
await open("/", PHONE);
await waitText("h1", "Find an instance");
await waitText(".card", "orders-prod");
await page.evaluate(() => [...document.querySelectorAll(".card")].find((c) => c.textContent.includes("orders-prod")).click());
check("a card opens the instance", (await waitText("h1", "orders-prod")) && url().pathname === "/instances/a1b2c3d4", url().pathname);
await waitText(".panel .copyrow .v", "neo4j+s://a1b2c3d4.databases.neo4j.io");
check("the connection URL is shown", (await text(".copyrow .v")) === "neo4j+s://a1b2c3d4.databases.neo4j.io");
check("an instance found by a sync says its password is not stored", (await texts(".panel .prow.stack .v")).includes("Not stored"));
check("properties: tenant, tier, region, size, created", await page.evaluate(() => {
  const t = document.querySelector("#properties-title").parentElement.textContent;
  return ["Acme Production", "AuraDB Professional", "GCP europe-west1", "8 GB · 16 GB", "12 Mar 2026"].every((x) => t.includes(x));
}));
check("tags on the page lead back to filtered lists", await page.$$eval(".meta .tag", (a) => a.map((x) => x.getAttribute("href")).every((h) => h.startsWith("/instances?"))));
await page.click(".copyrow .iconbtn");
check("copying says so", await waitFor(() => /copied/i.test(document.querySelector(".copyrow .iconbtn")?.getAttribute("aria-label") ?? "")));
check("the detail page offers Delete, named", (await texts(".actionbar button.btn-danger")).join("|") === "Delete");
check("detail fits a phone", !(await overflowing()));
await accessibility("detail");
await shot("07-detail-mobile");
await open("/instances/does-not-exist", DESKTOP);
check("an unknown instance says so", await waitText(".emptystate h2", "No instance with that id"));
await open("/instances/a1b2c3d4", DESKTOP);
await waitText("h1", "orders-prod");
await shot("08-detail-desktop");

// ───────────────────────────── 6. An instance removed from Aura ─────────────────────────────
const token = await auraToken();
const del = await fetch(`${MOCK}/v1/instances/e5f6a7b8`, { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
check("(arrange) the fake Aura accepted the delete", del.status === 202, String(del.status));
await sleep(4500);
await open("/", DESKTOP);
await waitText(".hero .sub", "6 instances");
await page.click("button[aria-label='Sync with Aura now']");
check("Sync now refreshes the copy: the removed instance leaves the home page", await waitText(".hero .sub", "5 instances across 2 tenants", 30000), await text(".hero .sub"));
check("the removed instance has gone from 'Needs attention'", (await count("section[aria-label='Needs attention']")) === 0);
check("the top bar says when it last synced", /Synced (just now|a minute ago)/.test((await text(".synced")) ?? ""), await text(".synced"));
await open("/instances?rm=1", DESKTOP);
const sixShown = await waitText(".countline", "6 instances");
check("'including removed' shows it again, marked", sixShown && (await texts(".cards .card .status")).includes("Removed from Aura"), (await texts(".cards .card .status")).join("|"));
await open("/instances/e5f6a7b8", DESKTOP);
check("its page explains it is gone and keeps the record", await waitText(".banner-warn", "no longer in Aura"));
await shot("09-detail-removed");

// ───────────────────────────── 7. Operations ─────────────────────────────
await open("/operations", PHONE);
check("operations is empty before any change is planned", await waitText(".emptystate h2", "No changes yet"));
check("operations fits a phone", !(await overflowing()));
await accessibility("operations");

// ───────────────────────────── 7b. Changing an instance: plan, review, confirm, progress ─────────────────────────────
const auraGet = async (id) => (await (await fetch(`${MOCK}/v1/instances/${id}`, { headers: { Authorization: `Bearer ${await auraToken()}` } })).json()).data;
const auraPatch = (id, body) => auraToken().then((t) => fetch(`${MOCK}/v1/instances/${id}`, { method: "PATCH", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const setFaults = (faults) => fetch(`${MOCK}/__faults`, { method: faults ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: faults ? JSON.stringify(faults) : undefined });
const until = async (fn, ms = 20000) => { for (let t = 0; t < ms; t += 500) { if (await fn()) return true; await sleep(500); } return false; };
const syncAndWait = async () => {
  await gql(`mutation { syncNow { started } }`);
  await sleep(500);
  for (let i = 0; i < 60; i++) { if (!(await gql(`{ auraSetup { syncing } }`)).auraSetup.syncing) return; await sleep(500); }
};

// Edit: rename and resize recs-staging on a phone
await open("/instances/c9d8e7f6", PHONE);
await waitText("h1", "recs-staging");
check("a running instance offers Edit and Pause, not Resume", (await texts(".actionbar .btn")).join("|") === "Edit|Pause|Delete", (await texts(".actionbar .btn")).join("|"));
await page.click(".actionbar a[href$='/edit']");
check("the edit form opens", await waitText("h1", "Edit recs-staging"));
check("Review changes is off until something differs", await page.$eval(".actionbar button[type=submit]", (b) => b.disabled));
check("the name counter counts characters", (await text("#name-count")) === "12 of 30", await text("#name-count"));
await typeInto("#name", "x".repeat(31));
check("a name over 30 characters is refused on the form", (await waitText("#name-count", "at most 30")) && (await page.$eval(".actionbar button[type=submit]", (b) => b.disabled)));
await typeInto("#name", "recs-v2");
await waitFor(() => document.querySelectorAll("input[name=size]").length >= 2);
check("the instance's own size is marked current", (await texts(".choice .tag")).join("|") === "Current", (await texts(".choice .tag")).join("|"));
check("only sizes the tenant can use are offered", (await count("input[name=size]")) >= 2);
await page.evaluate(() => { const radios = [...document.querySelectorAll("input[name=size]")]; radios.find((r) => !r.checked).click(); });
check("Review changes turns on once something differs", await waitFor(() => !document.querySelector(".actionbar button[type=submit]").disabled));
check("the edit form fits a phone", !(await overflowing()));
await accessibility("edit");
await shot("70-edit-mobile");
const auraBefore = await auraGet("c9d8e7f6");
await page.click(".actionbar button[type=submit]");
check("review opens on the review page, planned and not sent", (await waitText("h1", "recs-staging")) && (await waitText(".status", "Planned, not sent")) && url().pathname.startsWith("/operations/"), url().pathname);
check("the review shows each thing that changes", (await texts(".diffrow .k")).join("|") === "Name|Memory|Storage", (await texts(".diffrow .k")).join("|"));
check("the review shows before and after", (await texts(".diffrow")).some((t) => t.includes("recs-staging") && t.includes("recs-v2")));
check("the review warns before a resize", await count(".banner-warn") >= 1);
check("planning sent nothing to Aura", JSON.stringify(await auraGet("c9d8e7f6")) === JSON.stringify(auraBefore));
check("the review fits a phone", !(await overflowing()));
await accessibility("review");
await shot("71-review-mobile");
const reviewUrl = page.url();
await clickByText("button", "Confirm and apply");
check("confirming shows progress", await waitText(".status", "In progress") || await waitText(".status", "Confirmed"));
check("progress lists six steps", (await count(".timeline .step")) === 6, String(await count(".timeline .step")));
check("progress shows the step number and a clock", await waitText(".progresshead", "of 6"));
check("Aura has the change by now", await until(async () => (await auraGet("c9d8e7f6")).name === "recs-v2"), (await auraGet("c9d8e7f6")).name);
await shot("72-progress-mobile");
check("the operation finishes", await waitText(".status", "Succeeded", 60000));
check("it says it is done", await waitText(".banner", "Done"));
check("every step is done", (await count(".timeline .step-done")) === 6, String(await count(".timeline .step-done")));
await shot("73-succeeded-mobile");
await page.goto(reviewUrl, { waitUntil: "domcontentloaded" });
check("reloading the page shows the finished change", await waitText(".status", "Succeeded"));
await open("/instances/c9d8e7f6", DESKTOP);
check("the instance shows the new name, size and a link to the change", (await waitText("h1", "recs-v2")) && (await count(".panel .listrow a[href^='/operations/']")) >= 1);
check("the stored instance matches Aura", (await gql(`{ instances(where: { auraId: { eq: "c9d8e7f6" } }) { name memory storage } }`)).instances[0].name === "recs-v2");

// Pause: cancelling sends nothing; confirming pauses; Resume brings it back
await open("/instances/d4e5f6a7", DESKTOP);
await waitText("h1", "billing-staging");
await clickByText("button", "Pause");
check("pause opens a review", (await waitText(".status", "Planned, not sent")) && (await waitText(".diffrow", "Paused")));
check("the pause review warns that connections will fail", await waitText(".banner-warn", "connections"));
await clickByText("button", "Cancel");
check("cancelling says nothing was sent", await waitText(".banner", "Nothing was sent to Aura"));
check("a cancelled pause left the instance running", (await auraGet("d4e5f6a7")).status === "running");
await open("/instances/d4e5f6a7", DESKTOP);
await waitText("h1", "billing-staging");
await waitFor(() => [...document.querySelectorAll(".actionbar button")].some((b) => b.textContent.trim() === "Pause" && !b.disabled));
await clickByText("button", "Pause");
await waitText(".status", "Planned, not sent");
await clickByText("button", "Confirm and apply");
check("the pause succeeds", await waitText(".status", "Succeeded", 60000));
await open("/instances/d4e5f6a7", DESKTOP);
await waitText("h1", "billing-staging");
check("a paused instance offers Resume, not Pause", (await texts(".actionbar .btn")).join("|") === "Edit|Resume|Delete", (await texts(".actionbar .btn")).join("|"));
await clickByText("button", "Resume");
await waitText(".status", "Planned, not sent");
await clickByText("button", "Confirm and apply");
check("the resume succeeds", await waitText(".status", "Succeeded", 60000));
check("Aura has it running again", (await auraGet("d4e5f6a7")).status === "running");

// Actions are locked while a change is in progress
const locking = (await gql(`mutation($id: String!) { planUpdate(instanceId: $id, changes: { name: "search-v2" }) { operationId } }`, { id: "c3d4e5f6" })).planUpdate.operationId;
await gql(`mutation($id: ID!) { confirmOperation(operationId: $id) { status } }`, { id: locking });
await open("/instances/c3d4e5f6", DESKTOP);
check("an active change shows a banner linking to it", await waitText(".banner-info", "A change is in progress"));
check("Edit, Pause are locked meanwhile", (await page.$$eval(".actionbar [aria-disabled=true], .actionbar button:disabled", (els) => els.length)) >= 2);
check("the active change is on the Operations page as active", (await (async () => { await open("/operations", DESKTOP); await waitText(".tagrow", "Active"); return texts(".tagrow .tag"); })()).some((t) => t.startsWith("Active · 1")));
await page.goto(`${BASE}/operations/${locking}`, { waitUntil: "domcontentloaded" });
check("it finishes", await waitText(".status", "Succeeded", 60000));

// A refusal from Aura is shown as a failure with the reason
const failing = (await gql(`mutation($id: String!) { planUpdate(instanceId: $id, changes: { name: "orders-v2" }) { operationId } }`, { id: "a1b2c3d4" })).planUpdate.operationId;
await setFaults({ rejectNext: { status: 409, message: "Another operation is in progress", reason: "instance-busy" } });
await open(`/operations/${failing}`, DESKTOP);
await waitText(".status", "Planned, not sent");
await clickByText("button", "Confirm and apply");
check("a refused change shows as failed", await waitText(".status", "Failed", 30000));
check("the failure says why and offers Sync now", (await waitText(".banner-danger", "already working")) && (await texts(".actionbar button")).includes("Sync now"));
await shot("74-failed-desktop");
await setFaults(null);

// A plan goes stale if the instance changes before it is confirmed
const stale = (await gql(`mutation($id: String!) { planUpdate(instanceId: $id, changes: { name: "orders-stale" }) { operationId } }`, { id: "a1b2c3d4" })).planUpdate.operationId;
await auraPatch("a1b2c3d4", { name: "orders-elsewhere" });
await sleep(4500);
await syncAndWait();
await open(`/operations/${stale}`, DESKTOP);
await waitText(".status", "Planned, not sent");
await clickByText("button", "Confirm and apply");
check("a stale plan is refused with a way out", (await waitText(".banner-danger", "Plan the change again")) && (await count(".banner-danger a")) >= 1);
check("a stale plan sent nothing to Aura", (await auraGet("a1b2c3d4")).name === "orders-elsewhere");
await open("/operations/not-a-real-id", DESKTOP);
check("an unknown change says so", await waitText(".emptystate h2", "No change with that id"));
await open("/operations", PHONE);
await waitFor(() => document.querySelectorAll(".listrow a[href^='/operations/']").length >= 5);
check("operations lists the changes, each linking to its page", (await count(".listrow a[href^='/operations/']")) >= 5);
check("operations fits a phone", !(await overflowing()));
await shot("75-operations-mobile");

// ───────────────────────────── 8. Account ─────────────────────────────
await open("/account", DESKTOP);
await waitText("h1", "Aura account");
await waitText("#copy-title ~ .prow", "Tenants3");
await waitText("#runs-title ~ .listrow", "ago");
check("the account page shows the connection without the secret", (await text("#conn-title")) === "Connection" && (await page.evaluate(() => document.body.textContent.includes("Stored encrypted, never shown"))) && !(await page.evaluate(() => document.body.innerHTML)).includes(SECRET));
check("the account page counts the stored copy", await page.evaluate(() => {
  const rows = [...document.querySelectorAll("#copy-title ~ .prow")].map((r) => r.textContent);
  return rows.some((r) => r.startsWith("Tenants3")) && rows.some((r) => r.startsWith("Instances6")) && rows.some((r) => r.startsWith("Instance options48"));
}), (await texts("#copy-title ~ .prow")).join("|"));
check("each tenant's options are listed", (await texts("#options-title ~ .listrow .title")).join() === "Acme Labs,Acme Production,Acme Staging", (await texts("#options-title ~ .listrow .title")).join());
check("recent syncs list the runs, newest first", (await count("#runs-title ~ .listrow")) >= 2, String(await count("#runs-title ~ .listrow")));
await shot("10-account-desktop");

// replacing with a wrong secret keeps the working credentials
await clickByText("button", "Replace credentials");
await typeInto("#client-id", CLIENT_ID);
await typeInto("#client-secret", "a-typo");
await page.evaluate(() => [...document.querySelectorAll("form button[type=submit]")][0].click());
check("a wrong replacement is refused and the account stays connected", (await waitText(".banner-danger", "Aura rejected that client id and secret")) && (await gql(`{ auraSetup { connected } }`)).auraSetup.connected === true);
await clickByText("button", "Cancel");
check("cancelling closes the replace form", await waitFor(() => !document.querySelector("#client-secret")));
check("account fits a phone", await (async () => { await open("/account", PHONE); await waitText("h1", "Aura account"); return !(await overflowing()); })());
await accessibility("account");
await shot("11-account-mobile");

// ───────────────────────────── 9. Disconnect keeps the data ─────────────────────────────
await open("/account", DESKTOP);
await waitText("h1", "Aura account");
await clickByText("button", "Disconnect from Aura");
check("disconnecting asks first", await waitFor(() => !!document.querySelector("dialog.modal[open]")));
check("the question says what is kept", await page.evaluate(() => document.querySelector("dialog.modal[open]").textContent.includes("instances, stored passwords and history stay")));
await shot("12-disconnect-confirm");
await page.evaluate(() => [...document.querySelectorAll("dialog.modal[open] .btn-danger")][0].click());
check("after disconnecting the app asks to connect again", await waitText("h1", "Connect your Aura account"));
const kept = await gql(`{ auraSetup { required connected } instancesConnection { totalCount } tenantsConnection { totalCount } }`);
check("the stored copy is still there", kept.auraSetup.required === true && kept.instancesConnection.totalCount === 6 && kept.tenantsConnection.totalCount === 3, JSON.stringify(kept));

// ───────────────────────────── 10. Reconnect ─────────────────────────────
await typeInto("#client-id", CLIENT_ID);
await typeInto("#client-secret", SECRET);
await page.click("button[type=submit]");
check("reconnecting lands on the home page, whatever page you were on, with the data",
  (await waitText("h1", "Find an instance", 30000)) && url().pathname === "/" && (await waitText(".hero .sub", "5 instances across 2 tenants", 30000)), `${url().pathname} ${await text("h1")} / ${await text(".hero .sub")}`);
const again = await gql(`{ instancesConnection { totalCount } tenantsConnection { totalCount } instanceConfigurationsConnection { totalCount } auraAccounts { status } }`);
check("reconnecting duplicates nothing", again.instancesConnection.totalCount === 6 && again.tenantsConnection.totalCount === 3 && again.instanceConfigurationsConnection.totalCount === 48 && again.auraAccounts.length === 1 && again.auraAccounts[0].status === "CONNECTED", JSON.stringify(again));

// ───────────────────────────── 10b. Create, show the password, check, delete ─────────────────────────────
const auraCount = async () => (await (await fetch(`${MOCK}/v1/instances`, { headers: { Authorization: `Bearer ${await auraToken()}` } })).json()).data.length;
const radio = (name, labelStart) => page.evaluate(([n, t]) => { const l = [...document.querySelectorAll(`input[name=${n}]`)].map((i) => i.closest("label")).find((x) => x.textContent.trim().startsWith(t)); if (!l) return false; l.click(); return true; }, [name, labelStart]);
const radioCount = (name) => count(`input[name=${name}]`);
const topbarHeight = () => page.$eval(".topbar", (e) => e.getBoundingClientRect().height);
const NAME = "e2e-created";

await open("/", PHONE);
await waitText("h1", "Find an instance");
check("home has a New instance button, and the phone top bar still fits on one line and does not scroll sideways", (await count("a.newlink")) === 1 && (await topbarHeight()) < 80 && !(await overflowing()), String(await topbarHeight()));
await page.click("a.newlink");
check("it opens the first step", (await waitText("h1", "Which tenant?")) && url().pathname === "/instances/new");
check("Continue is off until a tenant is chosen", await page.evaluate(() => [...document.querySelectorAll(".actionbar button")].find((b) => b.textContent === "Continue").disabled));
check("every tenant is offered", (await radioCount("tenant")) === 3, String(await radioCount("tenant")));
await accessibility("create");
await shot("76-create-tenant-mobile");
await radio("tenant", "Acme Staging");
await clickByText("button", "Continue");
await waitText("h1", "Which cloud?");
// Only the chosen tenant's options are read, once it is chosen, so they arrive after the step shows
await waitFor(() => document.querySelectorAll("input[name=cloud]").length >= 1);
check("the cloud step offers only what the tenant is offered", (await radioCount("cloud")) >= 1);
await radio("cloud", "GCP");
await clickByText("button", "Continue");
await waitText("h1", "Where, and which tier?");
// Region, tier and size are drop-downs: a first entry that says what to do, then the offered values
const options = (id) => page.$$eval(`#${id} option`, (os) => os.filter((o) => o.value !== "").map((o) => ({ value: o.value, text: o.textContent.trim() })));
const choose = async (id, textStart) => { const o = (await options(id)).find((x) => x.text.startsWith(textStart)); if (!o) return false; await page.select(`#${id}`, o.value); return true; };
check("region and tier are drop-downs, not lists of buttons", (await count("select#region")) === 1 && (await count("select#tier")) === 1 && (await count("input[name=region], input[name=tier]")) === 0);
check("the region drop-down offers the tenant's regions by name", (await options("region")).length >= 2 && (await options("region")).every((o) => /\(.+\)/.test(o.text)), JSON.stringify(await options("region")));
check("the tier drop-down waits for a region", (await page.$eval("#tier", (e) => e.disabled)) && (await page.$eval("#tier", (e) => e.options[0].textContent)) === "Choose a region first");
check("Continue is off until a region and a tier are chosen", await page.evaluate(() => [...document.querySelectorAll(".actionbar button")].find((b) => b.textContent === "Continue").disabled));
await page.select("#region", (await options("region"))[0].value);
check("the tiers offered in that region appear once it is chosen", await waitFor(() => !document.querySelector("#tier").disabled && document.querySelectorAll("#tier option").length >= 2));
check("a tier is shown by its name", (await options("tier")).some((o) => o.text === "AuraDB Professional"), JSON.stringify(await options("tier")));
await choose("tier", "AuraDB Professional");
check("the choices so far can be changed", (await texts(".tagrow .tag")).length >= 1);
await clickByText("button", "Continue");
check("the size step is a drop-down of memory and storage pairs", (await waitText("h1", "How big?")) && (await count("select#size")) === 1 && (await options("size")).length >= 2 && (await options("size")).every((o) => /memory, .* storage/.test(o.text)), JSON.stringify(await options("size")));
check("Continue is off until a size is chosen", await page.evaluate(() => [...document.querySelectorAll(".actionbar button")].find((b) => b.textContent === "Continue").disabled));
await shot("77-create-size-mobile");
await page.select("#size", (await options("size"))[0].value);
await clickByText("button", "Continue");
check("the last step asks for a name", await waitText("h1", "Name it"));
check("Review is off until it has a name", await page.evaluate(() => [...document.querySelectorAll(".actionbar button")].find((b) => b.textContent === "Review").disabled));
await typeInto("#name", NAME);
check("the name counter counts", (await text("#name-count")) === `${NAME.length} of 30`, await text("#name-count"));
check("create steps fit a phone", !(await overflowing()));
await shot("78-create-name-mobile");
const instancesBefore = await auraCount();
await clickByText("button", "Review");
check("review opens, planned and not sent", (await waitText(".status", "Planned, not sent")) && url().pathname.startsWith("/operations/") && (await waitText("h1", `Create ${NAME}`)), await text("h1"));
check("the review lists what will be made", (await texts(".diffrow .k")).join("|").startsWith("Name|Tenant|Cloud|Region|Tier|Memory|Storage"), (await texts(".diffrow .k")).join("|"));
check("a create review shows only the new values", (await count(".diffrow .before")) === 0);
check("the review warns about billing and the password", (await texts(".banner-warn")).some((t) => t.includes("billed")) && (await texts(".banner-warn")).some((t) => t.includes("password")));
check("planning a create made nothing in Aura", (await auraCount()) === instancesBefore);
await accessibility("create-review");
await shot("79-create-review-mobile");
await clickByText("button", "Confirm and apply");
check("the create finishes", await waitText(".status", "Succeeded", 90000));
check("it says the password is stored", await waitText(".banner", "password Aura gave is stored"));
check("Aura has one more instance", (await auraCount()) === instancesBefore + 1);
const made = (await gql(`{ instances(where: { name: { eq: "${NAME}" } }) { auraId hasStoredPassword credentialUsername passwordRevealCount tenant { name } cloud { name } } }`)).instances[0];
check("the stored copy has the instance, its tenant and cloud, and a stored password", made?.hasStoredPassword === true && made.tenant[0].name === "Acme Staging" && made.cloud[0].name === "gcp" && made.credentialUsername === "neo4j", JSON.stringify(made));
const realPassword = (await (await fetch(`${MOCK}/__passwords/${made.auraId}`)).json()).password;

// The password stays hidden until the eye is clicked, and each showing is recorded
await open(`/instances/${made.auraId}`, DESKTOP);
await waitText("h1", NAME);
check("the password is hidden when the page loads, and is nowhere in it", (await waitFor(() => document.querySelector("[data-state=hidden]"))) && !(await page.evaluate(() => document.body.innerHTML)).includes(realPassword));
check("the page says it can be shown", (await count("button[aria-label='Show password']")) === 1);
await page.click("button[aria-label='Show password']");
check("clicking the eye shows the real password", await waitFor((p) => document.querySelector("[data-state=shown]")?.textContent === p, realPassword));
check("the page has a hide button and a copy button for it", (await count("button[aria-label='Hide password']")) === 1 && (await count("button[aria-label='Copy password']")) === 1);
check("showing it was recorded", await until(async () => (await gql(`{ instances(where: { auraId: { eq: "${made.auraId}" } }) { passwordRevealCount } }`)).instances[0].passwordRevealCount === 1));
await shot("80-password-shown-desktop");
await page.click("button[aria-label='Hide password']");
check("hiding it removes it from the page", await waitFor(() => document.querySelector("[data-state=hidden]")) && !(await page.evaluate(() => document.body.innerHTML)).includes(realPassword));
check("the password was never put in storage or the URL", !(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).includes(realPassword) && !page.url().includes(realPassword));
check("the stored password cannot be asked for in a query", (await (await fetch(GATEWAY, { method: "POST", headers: { "Content-Type": "application/json", ...(AUTH ? { Authorization: AUTH } : {}) }, body: JSON.stringify({ query: `{ instances { password passwordCipher } }` }) })).json()).errors?.length > 0);
check("an instance found by a sync says why it has no password to show", await (async () => { await open("/instances/a1b2c3d4", DESKTOP); await waitText("h1", "orders-elsewhere"); return (await count("button[aria-label='Show password']")) === 0 && (await waitText(".note", "found by a sync")); })());

// Check with Aura: nothing changes until the person syncs
await open("/instances/c3d4e5f6", DESKTOP);
await waitText("h1", "search-v2");
await clickByText("button", "Check with Aura");
check("a matching instance says so", await waitText("[role=status]", "Matches Aura"));
await auraPatch("c3d4e5f6", { name: "search-elsewhere" });
await clickByText("button", "Check with Aura");
check("a difference is listed, stored against Aura", (await waitText(".diffrow", "search-elsewhere")) && (await texts(".diffrow")).some((t) => t.includes("search-v2")), (await texts(".diffrow")).join("|"));
check("checking did not change the stored copy", (await gql(`{ instances(where: { auraId: { eq: "c3d4e5f6" } }) { name } }`)).instances[0].name === "search-v2");
await shot("81-drift-desktop");
await clickByText("button", "Sync now");
check("Sync now brings the stored copy up to date", await until(async () => (await gql(`{ instances(where: { auraId: { eq: "c3d4e5f6" } }) { name } }`)).instances[0].name === "search-elsewhere", 30000));

// Delete: cancelling keeps it; deleting needs the name
await open("/instances/a1b2c3d4", DESKTOP);
await waitText("h1", "orders-elsewhere");
await clickByText("button", "Delete");
check("delete opens a review that says it cannot be undone", (await waitText(".status", "Planned, not sent")) && (await waitText(".banner-warn", "cannot be undone")));
check("the delete button is off until the name is typed", await page.evaluate(() => [...document.querySelectorAll(".actionbar button")].find((b) => b.textContent.startsWith("Delete")).disabled));
await clickByText("button", "Cancel");
check("cancelling a delete keeps the instance", (await waitText(".banner", "Nothing was sent to Aura")) && (await auraCount()) === instancesBefore + 1);
await open(`/instances/${made.auraId}`, PHONE);
await waitText("h1", NAME);
await clickByText("button", "Delete");
await waitText(".status", "Planned, not sent");
check("the delete review asks for the name", await waitText("#typed-title", "Type the name"));
await typeInto("#typed", NAME.toUpperCase());
check("a name with the wrong case does not turn it on", (await waitText("#typed-hint", "not the name")) && (await page.evaluate(() => [...document.querySelectorAll(".actionbar button")].find((b) => b.textContent.startsWith("Delete")).disabled)));
await typeInto("#typed", NAME.slice(0, -1));
check("a partial name does not either", await page.evaluate(() => [...document.querySelectorAll(".actionbar button")].find((b) => b.textContent.startsWith("Delete")).disabled));
check("the delete review fits a phone", !(await overflowing()));
await accessibility("delete-review");
await shot("82-delete-review-mobile");
await typeInto("#typed", NAME);
check("the exact name turns it on", (await waitText("#typed-hint", "matches")) && (await page.evaluate(() => !([...document.querySelectorAll(".actionbar button")].find((b) => b.textContent.startsWith("Delete")).disabled))));
await clickByText("button", "Delete permanently");
check("the delete finishes", await waitText(".status", "Succeeded", 90000));
check("Aura no longer has it", (await auraCount()) === instancesBefore);
check("the record stays, marked removed, and its password is gone", await until(async () => { const i = (await gql(`{ instances(where: { auraId: { eq: "${made.auraId}" } }) { deletedInAuraAt hasStoredPassword } }`)).instances[0]; return i.deletedInAuraAt !== null && i.hasStoredPassword === false; }));
await shot("83-delete-done-mobile");
await open(`/instances/${made.auraId}`, DESKTOP);
check("its page says it is gone and offers no actions", (await waitText(".banner-warn", "no longer in Aura")) && (await count(".actionbar")) === 0);

// ───────────────────────────── 10c. Reset the stored copy ─────────────────────────────
const snapshot = async () => {
  const d = await gql(`{ tenantsConnection { totalCount } instanceConfigurationsConnection { totalCount } instancesConnection { totalCount } operationsConnection { totalCount } syncRunsConnection { totalCount } operations { id status target { auraId } } instances(where: { deletedInAuraAt: { startsWith: "2" } }) { auraId } }`);
  const removedIds = new Set(d.instances.map((i) => i.auraId));
  return { tenants: d.tenantsConnection.totalCount, options: d.instanceConfigurationsConnection.totalCount, instances: d.instancesConnection.totalCount, operations: d.operationsConnection.totalCount, runs: d.syncRunsConnection.totalCount, linked: d.operations.filter((o) => o.target.length > 0).length, linkedToListed: d.operations.filter((o) => o.target.length > 0 && !removedIds.has(o.target[0].auraId)).length, statuses: d.operations.map((o) => `${o.id}:${o.status}`).sort(), removed: d.instances.length };
};
const beforeReset = await snapshot();
check("(arrange) there are operations to keep, some linked to instances, and an instance Aura no longer lists", beforeReset.operations >= 5 && beforeReset.linkedToListed >= 3 && beforeReset.removed >= 1, JSON.stringify(beforeReset));
await open("/account", DESKTOP);
await waitText("h1", "Aura account");
check("the account page offers to reset the stored copy, and says what is kept", (await count("button.btn")) > 0 && (await waitText(".panel .note", "Keeps your credentials, past changes and stored passwords")));
await clickByText("button", "Reset the stored copy");
check("resetting asks first, and says what goes and what stays", (await waitFor(() => !!document.querySelector("dialog.modal[open]"))) && (await page.evaluate(() => document.querySelector("dialog.modal[open]").textContent.includes("Kept:") && /credentials/.test(document.querySelector("dialog.modal[open]").textContent))));
await shot("84-reset-confirm");
await clickByText("dialog.modal[open] button", "Cancel");
check("cancelling removes nothing", (await snapshot()).instances === beforeReset.instances);
// Wait for the dialog to finish closing, and for the button to be usable, before opening it again
await waitFor(() => !document.querySelector("dialog.modal[open]"));
await waitFor(() => [...document.querySelectorAll("button")].some((b) => b.textContent.startsWith("Reset the stored copy") && !b.disabled));
await clickByText("button", "Reset the stored copy");
await waitFor(() => !!document.querySelector("dialog.modal[open]"));
await page.evaluate(() => [...document.querySelectorAll("dialog.modal[open] button")].find((b) => b.textContent.includes("Reset and read again")).click());
check("the store is read in again", await until(async () => { const n = await snapshot(); return n.runs === beforeReset.runs + 1 && n.tenants === beforeReset.tenants && n.options === beforeReset.options && n.instances === beforeReset.instances - beforeReset.removed && (await gql(`{ auraSetup { syncing lastSyncStatus } }`)).auraSetup.syncing === false; }, 60000));
const afterReset = await snapshot();
check("every past operation is kept, with the same outcome, and a sync run was added", afterReset.operations === beforeReset.operations && JSON.stringify(afterReset.statuses) === JSON.stringify(beforeReset.statuses) && afterReset.runs === beforeReset.runs + 1, JSON.stringify(afterReset));
check("operations on instances Aura still lists are linked to them again", afterReset.linked === beforeReset.linkedToListed, `${afterReset.linked} vs ${beforeReset.linkedToListed}`);
check("an instance Aura no longer lists is removed too, so leftovers do not stay", afterReset.removed === 0 && afterReset.instances === beforeReset.instances - beforeReset.removed, JSON.stringify([afterReset.instances, beforeReset.instances, beforeReset.removed]));
check("the connection was kept: no need to connect again", (await gql(`{ auraSetup { required connected } }`)).auraSetup.required === false);
await open("/operations", DESKTOP);
check("operations on an instance that is gone still say which one, after the reset", (await waitText(".listrow .title", `Delete ${NAME}`)) && (await waitText(".listrow .title", `Create ${NAME}`)), (await texts(".listrow .title")).slice(0, 6).join("|"));
check("the Operations page shows the same history", await waitFor((n) => document.querySelectorAll(".listrow a[href^='/operations/']").length >= n, beforeReset.operations));
await open("/account", DESKTOP);
await waitText("h1", "Aura account");
await shot("85-account-after-reset");

// ───────────────────────────── 11. Theme ─────────────────────────────
await open("/", DESKTOP);
await waitText("h1", "Find an instance");
// The machine running this may itself be in dark mode, so say what the system prefers
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await page.evaluate(() => { localStorage.removeItem("gwa-theme"); document.documentElement.removeAttribute("data-theme"); });
const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const light = await bg();
await page.click("button[aria-label^='Theme']");
await page.click("button[aria-label^='Theme']");
check("the theme button reaches dark", (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark");
const dark = await bg();
check("dark changes the page colours", light !== dark, `${light} -> ${dark}`);
await shot("13-home-dark-desktop");
await page.reload({ waitUntil: "domcontentloaded" });
await waitText("h1", "Find an instance");
check("the theme is remembered across a reload, with no flash", (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark" && (await bg()) === dark);
await page.click("button[aria-label^='Theme']");
check("a third press goes back to following the system", (await page.evaluate(() => document.documentElement.dataset.theme)) === undefined);
// the system's own dark setting, with no choice made
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
check("with no choice made it follows the system's dark mode", (await bg()) === dark, await bg());
await open("/", { ...PHONE });
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await waitText("h1", "Find an instance");
await shot("14-home-dark-mobile");

// ───────────────────────────── Finish ─────────────────────────────
await browser.close();
const unique = [...new Set(problems)];
check("no console errors, page errors or failed requests", unique.length === 0, unique.slice(0, 4).join(" | "));
console.log(results.join("\n"));
console.log(`\n${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
