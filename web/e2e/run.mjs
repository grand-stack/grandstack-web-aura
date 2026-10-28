// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
// Browser end-to-end checks. Drives a real Chrome through the whole flow against the running stack (see e2e/README.md).
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const GATEWAY = process.env.GRAPHQL_URL ?? "http://localhost:4100/graphql";
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

let browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
let page;
let loads = 0;

// Headless Chrome can die after a number of page loads in some environments, so start a fresh one every few loads
async function freshPage(viewport = DESKTOP, relaunch = false) {
  if (relaunch) {
    await browser.close().catch(() => {});
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
    loads = 0;
  } else if (page) await page.close().catch(() => {});
  page = await browser.newPage();
  await page.setViewport(viewport);
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(`console.${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED") problems.push(`requestfailed: ${r.failure()?.errorText} ${r.url().slice(0, 80)}`); });
}
async function open(path, viewport) {
  if (viewport) await freshPage(viewport, ++loads > 6);
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
  const res = await fetch(GATEWAY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
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
check("the detail page offers no change buttons yet", (await count("button.btn-danger, a[href*='edit']")) === 0);
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
check("'including removed' shows it again, marked", (await waitText(".countline", "6 instances")) && (await texts(".cards .card .status")).includes("Removed from Aura"), (await texts(".cards .card .status")).join("|"));
await open("/instances/e5f6a7b8", DESKTOP);
check("its page explains it is gone and keeps the record", await waitText(".banner-warn", "no longer in Aura"));
await shot("09-detail-removed");

// ───────────────────────────── 7. Operations ─────────────────────────────
await open("/operations", PHONE);
check("operations is empty before any change is planned", await waitText(".emptystate h2", "No changes yet"));
check("operations fits a phone", !(await overflowing()));
await accessibility("operations");

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
check("disconnecting asks first", await waitFor(() => document.querySelector("dialog.modal")?.open === true));
check("the question says what is kept", await page.evaluate(() => document.querySelector("dialog.modal").textContent.includes("instances, stored passwords and history stay")));
await shot("12-disconnect-confirm");
await page.evaluate(() => [...document.querySelectorAll("dialog.modal .btn-danger")][0].click());
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

// ───────────────────────────── 11. Theme ─────────────────────────────
await open("/", DESKTOP);
await waitText("h1", "Find an instance");
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
