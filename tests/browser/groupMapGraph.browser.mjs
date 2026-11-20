// Group Map Graph view in real Chrome against a LOCAL Supabase stack (fictional
// data, real database functions). Nothing leaves localhost. Seeds and removes
// its own fictional groups.
//
//   LOCAL_SUPABASE_URL=... LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... LOCAL_SEEDER_KEY=... \
//   APP_URL=http://localhost:5341 node tests/browser/groupMapGraph.browser.mjs [--shots=folder]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

const APP = process.env.APP_URL || "http://localhost:5341";
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SHOTS = (process.argv.find((arg) => arg.startsWith("--shots=")) || "").slice(8);
const url = process.env.LOCAL_SUPABASE_URL || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
  console.error("LOCAL stack only: set LOCAL_SUPABASE_URL and the local keys.");
  process.exit(2);
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const authAdmin = createClient(url, process.env.LOCAL_SERVICE_ROLE_KEY, options);
const seed = createClient(url, process.env.LOCAL_SEEDER_KEY, options);
const run = Date.now().toString(36);
const PASSWORD = `pw-${run}-Local1!`;

let failures = 0;
let passes = 0;
const expect = (condition, message) => {
  if (condition) passes += 1;
  else failures += 1;
  console.log(`${condition ? "ok  " : "FAIL"} ${message}`);
};
const must = async (promise) => {
  const { data, error } = await promise;
  if (error) throw new Error(`${error.code} ${error.message}`);
  return data;
};

const email = `gm-graph-${run}@example.test`;
const { user } = await must(authAdmin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }));
await must(seed.from("staff_profiles").insert({ user_id: user.id, email, full_name: "Fictional Graph Staff", role: "staff", is_active: true }));
const api = createClient(url, process.env.LOCAL_ANON_KEY, options);
await must(api.auth.signInWithPassword({ email, password: PASSWORD }));

const ours = [];
const make = async (label, parentId = null) => {
  const row = await must(api.rpc("group_map_create", { p_name: `Fictional ${label} ${run}`, p_parent_id: parentId }));
  ours.push(row.id);
  return row;
};
const national = await make("Graph Fellowship");
const region = await make("Graph Region", national.id);
const chapterA = await make("Graph Chapter A", region.id);
const chapterB = await make("Graph Chapter B", region.id);
const choir = await make("Graph Choir");
const choirKids = await make("Graph Choir Kids", choir.id);
for (let i = 1; i <= 20; i += 1) await make(`Graph Single ${String(i).padStart(2, "0")}`);
await must(api.rpc("group_map_link_name", { p_name: "Fictional Alpha Group", p_organization_id: chapterA.id }));
const edgeCount = 4;

const browser = await chromium.launch({ executablePath: CHROME });
async function open({ width = 1440, height = 900, touch = false, reducedMotion = "no-preference", theme } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, ...(touch && { isMobile: true, hasTouch: true }) });
  await context.route("**/*", (route) => {
    const target = new URL(route.request().url());
    return ["localhost", "127.0.0.1"].includes(target.hostname) || target.protocol === "data:" ? route.continue() : route.abort();
  });
  await context.addInitScript((value) => {
    localStorage.setItem("toahNipiContactsMode", "groups");
    localStorage.setItem("toahNipiGroupMapMode", "graph");
    if (value) localStorage.setItem("toahNipiTheme", value);
  }, theme || "");
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${APP}/contacts`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForSelector(".gm-graph-node");
  return { page, errors, context };
}
const circle = (page, group) => page.locator(`.gm-graph-node[data-group-id="${group.id}"]`);
// Screen positions of every circle, by id.
const positions = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".gm-graph-node")].map((node) => {
  const box = node.querySelector("circle").getBoundingClientRect();
  return [node.dataset.groupId, [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)]];
})));
const settled = async (page) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const a = await positions(page);
    await page.waitForTimeout(300);
    const b = await positions(page);
    if (JSON.stringify(a) === JSON.stringify(b)) return true;
  }
  return false;
};
const inView = async (page, locator) => {
  const box = await locator.locator("circle").boundingBox();
  const view = await page.locator(".gm-viewport").boundingBox();
  return Boolean(box && box.x >= view.x && box.y >= view.y && box.x + box.width <= view.x + view.width && box.y + box.height <= view.y + view.height);
};
const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

try {
  const { page, errors } = await open();
  expect(await page.getByRole("button", { name: "Graph", exact: true }).getAttribute("aria-pressed") === "true", "Graph is a choice beside Map and List, and is remembered");
  expect(await settled(page), "the circles settle and stop moving");
  expect(await page.locator(".gm-graph-node").count() >= ours.length, "every group is a circle");
  expect(await page.locator(".gm-graph-edge").count() >= edgeCount, "lines join parents to subgroups");
  await page.getByRole("button", { name: "Fit to screen" }).click();
  await page.waitForTimeout(300);
  const labelled = await page.locator(".gm-graph-node--parent text").count();
  expect(labelled >= 3, `parent organizations are labelled at the fitted zoom (${labelled})`);
  expect(await page.locator(".gm-graph-node:not(.gm-graph-node--parent) text").count() === 0, "…and the many single groups aren't, so names don't pile up");
  const fontSize = await page.locator(".gm-graph-node--parent text").first().evaluate((element) => element.getBoundingClientRect().height);
  expect(fontSize > 10 && fontSize < 20, `labels read at about 12px on screen (${Math.round(fontSize)}px tall)`);
  const all = await page.locator(".gm-graph-node").all();
  let visible = 0;
  for (const node of all) if (await inView(page, node)) visible += 1;
  expect(visible === all.length, `Fit to screen shows all ${all.length} circles`);
  await shot(page, "graph-overview");

  // Zoomed far out (as with hundreds of groups), circles must not shrink to specks.
  for (let click = 0; click < 12; click += 1) await page.getByRole("button", { name: "Zoom out" }).click();
  await page.waitForTimeout(200);
  const smallest = await page.evaluate(() => Math.min(...[...document.querySelectorAll(".gm-graph-node circle")].map((circle) => circle.getBoundingClientRect().width)));
  expect(smallest >= 6, `zoomed all the way out, every circle is still visible (smallest ${smallest.toFixed(1)}px across)`);
  await page.getByRole("button", { name: "Fit to screen" }).click();
  await page.waitForTimeout(300);

  // Families stay together: each subgroup is nearer its own parent than other parents.
  const at = await positions(page);
  const d = (a, b) => Math.hypot(at[a.id][0] - at[b.id][0], at[a.id][1] - at[b.id][1]);
  expect(d(chapterA, region) < d(chapterA, choir) && d(choirKids, choir) < d(choirKids, region), "subgroups sit beside their own parent");

  // Select: details open, its connections stand out, the rest fade.
  await circle(page, region).click();
  expect((await page.locator("#gm-details-title").textContent()).startsWith("Fictional Graph Region"), "clicking a circle opens its details");
  expect(await circle(page, chapterA).getAttribute("class").then((value) => value.includes("related")) &&
    await circle(page, national).getAttribute("class").then((value) => value.includes("related")), "its parent and subgroups are highlighted");
  expect(await circle(page, choir).getAttribute("class").then((value) => value.includes("dim")), "unrelated circles fade");
  expect(await page.locator(".gm-graph-edge--lit").count() === 3, "its three lines are highlighted");
  await shot(page, "graph-selected");

  // Drag: moves on screen only; relationships unchanged; no selection change.
  const before = (await positions(page))[choir.id];
  const box = await circle(page, choir).locator("circle").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  await settled(page);
  const after = (await positions(page))[choir.id];
  expect(Math.hypot(after[0] - before[0], after[1] - before[1]) > 60, "dragging moves the circle");
  expect((await page.locator("#gm-details-title").textContent()).startsWith("Fictional Graph Region"), "a drag doesn't change the selection");
  const map = await must(api.rpc("group_map_export"));
  expect(map.organizations.find((group) => group.id === choirKids.id).parent_id === choir.id &&
    map.organizations.find((group) => group.id === choir.id).parent_id === null, "dragging never changes who belongs to whom");

  // Keyboard.
  await circle(page, region).focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.activeElement?.dataset.groupId) === chapterA.id, "Right arrow moves to the first subgroup and focuses it");
  expect((await page.locator("#gm-details-title").textContent()).startsWith("Fictional Graph Chapter A"), "…and opens its details");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement.querySelector("circle")).strokeDasharray);
  expect(outline !== "none", "the focused circle has a visible focus ring");

  // Zoom in: every circle near the middle gets its name.
  for (let click = 0; click < 3; click += 1) await page.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(200);
  expect(await page.locator(".gm-graph-node text").count() === await page.locator(".gm-graph-node").count(), "zoomed in, every circle shows its name");

  // Search brings a circle into view; switching views keeps the selection.
  await page.getByLabel("Find a group").fill("Graph Single 17");
  await page.getByLabel("Find a group").press("Enter");
  await page.waitForTimeout(300);
  const single = (await must(api.rpc("group_map_export"))).organizations.find((group) => group.name === `Fictional Graph Single 17 ${run}`);
  expect(await inView(page, circle(page, single)), "search brings the circle into view");
  await page.getByRole("button", { name: "List", exact: true }).click();
  expect(await page.locator(`.gm-list-row[data-group-id="${single.id}"]`).getAttribute("aria-selected") === "true", "the List keeps the selection");
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await page.waitForSelector(".gm-graph-node");
  expect(await circle(page, single).getAttribute("aria-pressed") === "true", "and back in Graph too");

  // An edit doesn't reshuffle the picture.
  await settled(page);
  const beforeEdit = await positions(page);
  const current = (await must(api.rpc("group_map_export"))).organizations.find((group) => group.id === chapterB.id);
  await must(api.rpc("group_map_rename", { p_id: chapterB.id, p_version: current.version, p_name: `Fictional Graph Chapter Bee ${run}` }));
  await page.locator(".gm-toolbar").getByRole("button", { name: "Refresh" }).click();
  await page.waitForTimeout(600);
  await settled(page);
  const afterEdit = await positions(page);
  const shifts = Object.keys(beforeEdit).map((id) => Math.hypot(afterEdit[id][0] - beforeEdit[id][0], afterEdit[id][1] - beforeEdit[id][1]));
  expect(Math.max(...shifts) < 25, `after an edit and Refresh, circles stay put (largest shift ${Math.round(Math.max(...shifts))}px)`);
  expect(errors.length === 0, `no page errors ${errors.join(" | ")}`);

  // Reduced motion: already still on arrival.
  const calm = await open({ reducedMotion: "reduce", theme: "night" });
  const first = await positions(calm.page);
  await calm.page.waitForTimeout(500);
  expect(JSON.stringify(first) === JSON.stringify(await positions(calm.page)), "with reduced motion, nothing moves on arrival");
  await shot(calm.page, "graph-night");

  // Phone.
  const phone = await open({ width: 390, height: 844, touch: true });
  const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 1, `phone: no sideways page scroll (${overflow}px)`);
  await phone.page.getByRole("button", { name: "Fit to screen" }).click();
  await phone.page.waitForTimeout(300);
  await shot(phone.page, "graph-phone");
} catch (error) {
  failures += 1;
  console.log(`FAIL ${error.stack?.split("\n").slice(0, 4).join("\n     ")}`);
} finally {
  await browser.close();
  const now = await must(api.rpc("group_map_export"));
  for (const link of now.links.filter((item) => ours.includes(item.organization_id))) {
    await api.rpc("group_map_unlink_name", { p_name: link.name, p_organization_id: link.organization_id });
  }
  for (let pass = 0; pass < 4; pass += 1) {
    for (const id of [...ours].reverse()) {
      const { data } = await api.from("organizations").select("*").eq("id", id);
      if (data?.[0]) await api.rpc("group_map_delete", { p_id: id, p_version: data[0].version });
    }
  }
  const { data: left } = await api.from("organizations").select("id").in("id", ours);
  console.log(`cleanup: ${left?.length ?? "?"} test groups left`);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
