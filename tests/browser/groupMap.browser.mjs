// Group Map in real Chrome against a LOCAL Supabase stack (fictional data,
// real RPCs and permissions). Nothing leaves localhost. Seeds its own
// fictional groups through the API and removes them afterwards.
//
//   LOCAL_SUPABASE_URL=... LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... LOCAL_SEEDER_KEY=... \
//   APP_URL=http://localhost:5341 node tests/browser/groupMap.browser.mjs [--shots=folder]
//
// Vite must run against the same stack (VITE_SUPABASE_URL / _PUBLISHABLE_KEY).
// Needs 20261119000100_group_map.sql on the stack (docs/GROUP_MAP.md).
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

async function account(label, role) {
  const email = `groupmap-ui-${label}-${run}@example.test`;
  const { user } = await must(authAdmin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }));
  await must(seed.from("staff_profiles").insert({ user_id: user.id, email, full_name: `Fictional ${label}`, role, is_active: true }));
  const client = createClient(url, process.env.LOCAL_ANON_KEY, options);
  await must(client.auth.signInWithPassword({ email, password: PASSWORD }));
  return { email, client };
}

const staff = await account("staff", "staff");
const viewer = await account("viewer", "viewer");
const api = staff.client;

// Fictional tree on the stack's fictional bookings.
const created = [];
const linked = [];
const make = async (name, parentId = null) => {
  const row = await must(api.rpc("group_map_create", { p_name: `${name} ${run}`, p_parent_id: parentId }));
  created.push(row);
  return row;
};
const link = async (name, group) => {
  await must(api.rpc("group_map_link_name", { p_name: name, p_organization_id: group.id }));
  linked.push([name, group.id]);
};
const fellowship = await make("Fictional Fellowship");
const northeast = await make("Fictional Northeast Region", fellowship.id);
const southern = await make("Fictional Southern Region", fellowship.id);
const chapter = await make("Fictional Lakeside Chapter", northeast.id);
const tuesday = await make("Fictional Tuesday Group", chapter.id);
await link("Lakeside Seniors Fellowship", chapter);
await link("Fictional Alpha Group", tuesday);
await link("Northfield Youth Group", northeast);
await link("Riverside Family Camp", southern);
const quilters = await make("Fictional Maple Quilters");
await link("Maple Grove Quilting Circle", quilters);
await make("Fictional Greater Lakes Regional Fellowship of Congregations Family Weekend Planning Team");
for (let i = 1; i <= 24; i += 1) await make(`Fictional Independent ${String(i).padStart(2, "0")}`);

const sessions = [];
async function open({ width = 1440, height = 900, touch = false, who = staff, theme } = {}) {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width, height }, ...(touch && { isMobile: true, hasTouch: true }) });
  await context.route("**/*", (route) => {
    const target = new URL(route.request().url());
    return ["localhost", "127.0.0.1"].includes(target.hostname) || target.protocol === "data:" ? route.continue() : route.abort();
  });
  if (theme) await context.addInitScript((value) => localStorage.setItem("toahNipiTheme", value), theme);
  // Start in Contacts, the default mode.
  await context.addInitScript(() => {
    if (sessionStorage.getItem("gmStarted")) return;
    sessionStorage.setItem("gmStarted", "1");
    localStorage.removeItem("toahNipiContactsMode");
    localStorage.removeItem("toahNipiGroupMapMode");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(message.text())) errors.push(message.text());
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${APP}/contacts`);
  await page.fill('input[type="email"]', who.email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.getByRole("button", { name: "Group Map", exact: true }).click();
  await page.waitForSelector(".gm-list-row");
  await page.waitForTimeout(400);
  const s = { browser, page, errors };
  sessions.push(s);
  return s;
}

const row = (page, group) => page.locator(`.gm-list-row[data-group-id="${group.id}"]`);
const clickRow = (page, group) => row(page, group).click();
const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};
// Inside the list's own scroll area, not just somewhere on the page.
const inList = async (page, locator) => {
  const box = await locator.boundingBox();
  const list = await page.locator(".gm-list").boundingBox();
  return Boolean(box && list && box.y >= list.y - 1 && box.y + box.height <= list.y + list.height + 1);
};
const detailsTitle = (page) => page.locator("#gm-details-title").textContent();
const countFor = async (page, label) =>
  Number(await page.locator(".gm-counts div", { hasText: label }).locator("dd").textContent());

try {
  // ---------- Desktop, staff ----------
  const desk = await open();
  const { page } = desk;
  await shot(page, "desktop-overview");

  const views = await page.getByRole("group", { name: "Show groups as" }).getByRole("button").allTextContents();
  expect(views.join("|") === "List|Graph", `List comes first, then Graph, and there's no box map (${views.join(", ")})`);
  expect(await page.getByRole("button", { name: "List", exact: true }).getAttribute("aria-pressed") === "true", "List is the default view");
  expect(await row(page, fellowship).count() === 1 && await row(page, tuesday).count() === 1 && await row(page, quilters).count() === 1, "nested and independent groups are all listed");
  expect([await row(page, fellowship).getAttribute("aria-level"), await row(page, northeast).getAttribute("aria-level"),
    await row(page, chapter).getAttribute("aria-level"), await row(page, tuesday).getAttribute("aria-level")].join() === "1,2,3,4",
  "subgroups are indented under their parent, four levels deep");

  // Search brings a group into view and selects it.
  await page.getByRole("button", { name: "Collapse all" }).click();
  expect(await row(page, tuesday).count() === 0, "collapse all hides subgroups");
  await page.getByLabel("Find a group").fill("tuesday group");
  await page.getByLabel("Find a group").press("Enter");
  await page.waitForTimeout(400);
  expect((await detailsTitle(page))?.startsWith("Fictional Tuesday Group"), "search selects the group");
  expect(await row(page, tuesday).getAttribute("aria-selected") === "true" && await inList(page, row(page, tuesday)), "search opens collapsed parents and scrolls the group into view");
  expect(await page.locator(".gm-breadcrumb").textContent().then((text) => text.includes("Fictional Northeast Region")), "details show the parent path");

  // Direct vs including subgroups.
  await clickRow(page, chapter);
  expect(await countFor(page, "Bookings for this group") === 1, "chapter: 1 booking of its own");
  expect(await countFor(page, "Including its 1 subgroup") === 3, "chapter: 3 including its subgroup (2 bookings), shown separately");
  await clickRow(page, fellowship);
  expect(await countFor(page, "Bookings for this group") === 0, "top organization: 0 of its own, not its subgroups'");
  expect(await countFor(page, "Including its 4 subgroups") === 5, "top organization: 5 including subgroups");

  // Expand / collapse one branch with its arrow.
  await row(page, northeast).locator(".gm-list-toggle").click();
  expect(await row(page, chapter).count() === 0 && await row(page, northeast).getAttribute("aria-expanded") === "false", "the arrow hides a branch");
  await row(page, northeast).locator(".gm-list-toggle").click();
  expect(await row(page, chapter).count() === 1, "and shows it again");

  // Focus and return.
  await clickRow(page, fellowship);
  await page.getByRole("button", { name: "Show only this organization" }).click();
  expect(await page.locator(".gm-focus-bar").count() === 1 && await row(page, quilters).count() === 0 && await row(page, tuesday).count() === 1,
    "focus shows only the organization and its descendants");
  await shot(page, "desktop-focus");
  await page.getByRole("button", { name: "Show all groups" }).click();
  expect(await row(page, quilters).count() === 1, "show all groups returns to every group");

  // Booking and contact links.
  await clickRow(page, tuesday);
  expect(await page.locator(".gm-section", { hasText: /\d+ bookings? for this group/ }).locator("li").count() === 2, "the details list the group's own bookings");
  expect(await page.locator(".gm-section", { hasText: "on these bookings" }).locator("li").count() >= 1, "the details list contacts from those bookings");
  await page.getByRole("button", { name: "Show in Contacts" }).first().click();
  await page.waitForSelector(".contacts-view-card");
  const search = await page.locator(".contacts-view-search input").inputValue();
  expect(search.length > 0 && await page.locator(".contacts-view-card tbody tr").count() >= 1, "Show in Contacts opens the contact list filtered to that person");
  await page.getByRole("button", { name: "Group Map", exact: true }).click();
  await page.waitForSelector(".gm-list-row");
  await page.getByLabel("Find a group").fill("Tuesday");
  await page.getByLabel("Find a group").press("Enter");
  await page.getByRole("button", { name: "Open booking" }).first().click();
  await page.waitForSelector('[data-tutorial-target="booking-back"]');
  expect(await page.locator(".gm-root").count() === 0, "Open booking opens the existing booking screen");
  await page.locator('[data-tutorial-target="booking-back"]').click();
  await page.waitForSelector(".gm-list-row");
  expect(true, "Back returns to Contacts, reopened on the Group Map");

  // Keyboard on the list.
  await clickRow(page, fellowship);
  await row(page, fellowship).press("ArrowRight");
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.activeElement?.dataset.groupId) === northeast.id, "Right arrow moves to the first subgroup and focuses it");
  await page.keyboard.press("ArrowLeft");
  expect(await row(page, chapter).count() === 0, "Left arrow on an open group collapses it");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(150);
  expect((await detailsTitle(page))?.startsWith("Fictional Lakeside Chapter"), "Down arrow moves to the next row and opens its details");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  expect(outline !== "none", `the focused row has a visible focus ring (${outline})`);
  // The chapter's own subgroup is open: the first Left closes it, the next goes up to the parent.
  await page.keyboard.press("ArrowLeft");
  expect(await row(page, tuesday).count() === 0, "Left arrow first closes the open branch");
  await page.keyboard.press("ArrowLeft");
  expect((await detailsTitle(page))?.startsWith("Fictional Northeast Region"), "then goes to the parent");

  // Graph keeps the selection, and List remembers it on return.
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await page.waitForSelector(".gm-graph-node");
  expect(await page.locator(`.gm-graph-node[data-group-id="${northeast.id}"]`).getAttribute("aria-pressed") === "true", "Graph keeps the selection");
  await page.getByRole("button", { name: "List", exact: true }).click();
  expect(await row(page, northeast).getAttribute("aria-selected") === "true", "and so does the List on return");
  await shot(page, "desktop-list");

  // Editing: change parent, remove parent, add subgroup, rename, link, unlink, delete.
  await clickRow(page, southern);
  const parentSelect = page.getByLabel("Move under a different parent");
  const optionTexts = await parentSelect.locator("option").allTextContents();
  expect(!optionTexts.some((text) => text.endsWith(southern.name)) && optionTexts.some((text) => text.includes(northeast.name)), "the parent picker offers neither the group itself nor its subgroups");
  await parentSelect.selectOption(northeast.id);
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page.locator(".gm-status--ok").waitFor();
  expect(await row(page, southern).getAttribute("aria-level") === "3", "Move puts the group under its new parent");
  await page.getByRole("button", { name: "Remove parent" }).click();
  await page.locator(".gm-status--ok", { hasText: "top-level" }).waitFor();
  expect(await page.locator(".gm-section", { hasText: "Parent organization" }).textContent().then((text) => text.includes("top-level group")) &&
    await row(page, southern).getAttribute("aria-level") === "1", "Remove parent keeps the group, now top-level");
  expect(await countFor(page, "Bookings for this group") === 1, "its booking stayed with it");

  await page.getByPlaceholder("New subgroup name").fill(`Fictional Youth Team ${run}`);
  await page.getByRole("button", { name: "Add subgroup" }).click();
  await page.locator(".gm-status--ok", { hasText: "Added" }).waitFor();
  const youth = (await must(api.from("organizations").select("*").eq("name", `Fictional Youth Team ${run}`).single()));
  created.push(youth);
  expect(youth.parent_id === southern.id, "Add subgroup creates it under the selected group");
  expect(await page.getByRole("button", { name: "Delete group" }).isDisabled(), "a group with subgroups or names can't be deleted");

  await clickRow(page, youth);
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Group name", { exact: true }).fill(`Fictional Youth Crew ${run}`);
  await page.getByRole("button", { name: "Save" }).click();
  await page.locator(".gm-status--ok", { hasText: "Renamed" }).waitFor();
  expect((await detailsTitle(page)) === `Fictional Youth Crew ${run}`, "Rename");

  await page.getByLabel("Booking name to link").selectOption("Cedar Hill Church Men's Retreat");
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await page.locator(".gm-status--ok", { hasText: "Linked" }).waitFor();
  linked.push(["Cedar Hill Church Men's Retreat", youth.id]);
  expect(await countFor(page, "Bookings for this group") === 1, "linking a name brings in its bookings");
  await page.getByRole("button", { name: "Unlink Cedar Hill Church Men's Retreat" }).click();
  await page.locator(".gm-status--ok", { hasText: "Unlinked" }).waitFor();
  linked.pop();
  expect(await countFor(page, "Bookings for this group") === 0, "unlinking removes them from the group only");
  await page.getByRole("button", { name: "Delete group" }).click();
  await page.locator(".gm-status--ok", { hasText: "Deleted" }).waitFor();
  expect(await row(page, youth).count() === 0, "an empty group can be deleted");
  created.splice(created.findIndex((group) => group.id === youth.id), 1);

  // Stale screen: someone else renames the group; this screen's rename is refused, then shows theirs.
  await clickRow(page, quilters);
  const current = await must(api.from("organizations").select("*").eq("id", quilters.id).single());
  await must(api.rpc("group_map_rename", { p_id: quilters.id, p_version: current.version, p_name: `Fictional Maple Stitchers ${run}` }));
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Group name", { exact: true }).fill("Overwritten name");
  await page.getByRole("button", { name: "Save" }).click();
  await page.locator(".gm-status--error").waitFor();
  expect(/changed .* a moment ago/.test(await page.locator(".gm-status--error").textContent()), "a stale rename is refused with a clear message");
  await page.waitForTimeout(300);
  expect(await row(page, quilters).textContent().then((text) => text.includes("Maple Stitchers")), "the list reloads to the other person's change, nothing overwritten");
  expect(desk.errors.length === 0, `no console errors on desktop ${desk.errors.join(" | ")}`);

  // ---------- Viewer ----------
  const view2 = await open({ who: viewer, width: 1280, height: 800 });
  await clickRow(view2.page, chapter);
  expect(await view2.page.getByRole("button", { name: "Rename" }).count() === 0 && await view2.page.getByRole("button", { name: "New group" }).count() === 0, "viewer: no editing controls");
  expect(await view2.page.getByText("View only").count() === 1, "viewer: says the map is view only");

  // ---------- Phone, touch ----------
  const phone = await open({ width: 390, height: 844, touch: true });
  const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 1, `phone: no sideways page scroll (${overflow}px)`);
  expect((await phone.page.locator(".gm-list").boundingBox()).width <= 390, "phone: the list fits the screen width");
  await shot(phone.page, "phone-list");
  await phone.page.getByRole("button", { name: "Full screen" }).click();
  const box = await phone.page.locator(".gm-root").boundingBox();
  expect(box.x === 0 && box.y === 0 && Math.round(box.width) === 390, "phone: full screen fills the window");
  await phone.page.getByLabel("Find a group").fill("Tuesday");
  await phone.page.getByLabel("Find a group").press("Enter");
  await phone.page.waitForTimeout(400);
  expect(await inList(phone.page, row(phone.page, tuesday)), "phone: search scrolls the group into view");
  await shot(phone.page, "phone-fullscreen");
  await phone.page.keyboard.press("Escape");
  expect(await phone.page.locator(".gm-root--fullscreen").count() === 0, "Escape leaves full screen");
  expect(phone.errors.length === 0, `no console errors on phone ${phone.errors.join(" | ")}`);

  // ---------- Night ----------
  const night = await open({ theme: "night" });
  await clickRow(night.page, chapter);
  await shot(night.page, "desktop-night");
  const panel = await night.page.locator(".gm-details").evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(panel !== "rgb(255, 255, 255)", `night: the panel uses the night surface (${panel})`);
} catch (error) {
  failures += 1;
  console.log(`FAIL ${error.stack?.split("\n").slice(0, 4).join("\n     ")}`);
} finally {
  for (const s of sessions) await s.browser.close();
  for (const [name, groupId] of linked) await api.rpc("group_map_unlink_name", { p_name: name, p_organization_id: groupId });
  for (let pass = 0; pass < 5; pass += 1) {
    for (const group of created) {
      const { data } = await api.from("organizations").select("*").eq("id", group.id);
      if (data?.[0]) await api.rpc("group_map_delete", { p_id: group.id, p_version: data[0].version });
    }
  }
  const { data: left } = await api.from("organizations").select("id").in("id", created.map((group) => group.id));
  console.log(`cleanup: ${left?.length ?? "?"} test groups left`);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
