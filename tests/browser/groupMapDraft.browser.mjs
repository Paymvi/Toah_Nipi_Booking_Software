// Group Map "Build automatically" and its Undo, in real Chrome against a LOCAL
// Supabase stack (fictional data, real database functions). Nothing leaves localhost.
//
//   LOCAL_SUPABASE_URL=... LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... LOCAL_SEEDER_KEY=... \
//   APP_URL=http://localhost:5341 node tests/browser/groupMapDraft.browser.mjs [--shots=folder]
//
// Needs 20261119000100_group_map.sql and 20261119000200_group_map_build.sql.
// The stack's fictional bookings include "Fictional Alpha/Beta/Gamma Group",
// which the draft should guess belong under one "Fictional" parent.
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
  const email = `gm-draft-${label}-${run}@example.test`;
  const { user } = await must(authAdmin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }));
  await must(seed.from("staff_profiles").insert({ user_id: user.id, email, full_name: `Fictional ${label}`, role, is_active: true }));
  const client = createClient(url, process.env.LOCAL_ANON_KEY, options);
  await must(client.auth.signInWithPassword({ email, password: PASSWORD }));
  return { email, client };
}
const staff = await account("staff", "staff");
const viewer = await account("viewer", "viewer");
const exported = () => must(staff.client.rpc("group_map_export"));
const before = await exported();
if (before.organizations.length || before.links.length) {
  console.error("This check expects a local stack with no groups yet (it compares before and after).");
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: CHROME });
async function open(who, { width = 1440, height = 900, touch = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, ...(touch && { isMobile: true, hasTouch: true }) });
  await context.route("**/*", (route) => {
    const target = new URL(route.request().url());
    return ["localhost", "127.0.0.1"].includes(target.hostname) || target.protocol === "data:" ? route.continue() : route.abort();
  });
  await context.addInitScript(() => localStorage.setItem("toahNipiContactsMode", "groups"));
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${APP}/contacts`);
  await page.fill('input[type="email"]', who.email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForSelector(".gm-root .gm-toolbar");
  return { page, errors, context };
}
const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

try {
  const { page, errors } = await open(staff);
  expect(/Build automatically/.test(await page.locator(".gm-empty").innerText()), "the empty map points to Build automatically");

  await page.getByRole("button", { name: "Build automatically" }).click();
  await page.waitForSelector(".gm-draft");
  expect((await exported()).organizations.length === 0, "building the draft saves nothing");
  const summary = page.locator(".gm-draft-summary");
  const parentRow = page.locator(".gm-draft li", { hasText: "under “Fictional”" });
  expect(await parentRow.count() === 1 && /Guess/.test(await parentRow.innerText()), "the Fictional groups get one parent guess, marked Guess");
  expect(/3 groups/.test(await parentRow.innerText()), "…covering Alpha, Beta and Gamma");
  expect(/1 new parent organization/.test(await summary.innerText()), "the summary counts the guessed parent");
  await shot(page, "draft-review");

  // Untick the guess: the summary follows; tick it again.
  await parentRow.getByRole("checkbox").uncheck();
  expect(/0 new parent organizations/.test(await summary.innerText()), "unticking the guess drops the parent");
  // Rows of the Groups section (the guess rows above also mention group names).
  const groupRow = (name) => page.locator(".gm-section", { has: page.getByLabel("Filter draft groups") }).locator("li", { hasText: name });
  expect(!(await groupRow("Fictional Alpha Group").innerText()).includes("Under Fictional"), "…and its groups are no longer shown under it");
  await parentRow.getByRole("checkbox").check();
  expect((await groupRow("Fictional Alpha Group").innerText()).includes("Under Fictional"), "ticking it again puts them back under it");

  // Leave one group out.
  await page.getByLabel("Filter draft groups").fill("Cancelled Choir");
  await groupRow("Cancelled Choir Weekend").getByRole("checkbox").uncheck();
  await page.getByLabel("Filter draft groups").fill("");
  const createLabel = await page.locator(".gm-draft-head .gm-primary").innerText();
  const planned = Number(createLabel.match(/\d+/)[0]);

  await page.locator(".gm-draft-head .gm-primary").click();
  await page.locator(".gm-status--ok", { hasText: "Created" }).waitFor();
  const after = await exported();
  expect(after.organizations.length === planned, `Create saves exactly the ${planned} groups shown`);
  const fictional = after.organizations.find((group) => group.name === "Fictional");
  expect(["Fictional Alpha Group", "Fictional Beta Group", "Fictional Gamma Group"].every((name) =>
    after.organizations.find((group) => group.name === name)?.parent_id === fictional?.id), "Alpha, Beta and Gamma sit under Fictional");
  expect(!after.links.some((link) => link.name === "Cancelled Choir Weekend"), "the unticked name stays unlinked");
  expect(await page.locator(".gm-list-row").count() === planned, "the list shows the new groups");
  expect(await page.getByRole("button", { name: "Undo this build" }).count() >= 1, "the success message offers Undo");
  await shot(page, "draft-created");

  // The panel keeps an Undo too (nothing selected).
  expect(/Automatic build/.test(await page.locator(".gm-details").innerText()), "the panel lists the automatic build");

  // A hand-made subgroup under a built group survives undo.
  const alpha = after.organizations.find((group) => group.name === "Fictional Alpha Group");
  const handMade = await must(staff.client.rpc("group_map_create", { p_name: `Fictional Hand Made ${run}`, p_parent_id: alpha.id }));
  await page.locator(".gm-toolbar").getByRole("button", { name: "Refresh" }).click();
  await page.locator(".gm-details-body").getByRole("button", { name: "Undo this build" }).click();
  await page.locator(".gm-status--ok", { hasText: "Undid the automatic build" }).waitFor();
  const undoText = await page.locator(".gm-status--ok").innerText();
  expect(/Kept 2 groups that now hold your own subgroups or names: Fictional, Fictional Alpha Group/.test(undoText), "undo says which groups it kept and why");
  const afterUndo = await exported();
  expect(afterUndo.links.length === 0, "undo unlinks every name the build linked");
  expect(afterUndo.organizations.map((group) => group.name).sort().join("|") === ["Fictional", "Fictional Alpha Group", handMade.name].sort().join("|"),
    "only the hand-made subgroup and the groups above it remain");
  expect(await page.locator(".gm-details-body").getByRole("button", { name: "Undo this build" }).count() === 0, "an undone build offers no second Undo");
  await shot(page, "draft-undone");
  expect(errors.length === 0, `no page errors ${errors.join(" | ")}`);

  // Viewer: no Build button.
  const view = await open(viewer, { width: 1280, height: 800 });
  expect(await view.page.getByRole("button", { name: "Build automatically" }).count() === 0, "viewer: no Build automatically");

  // Phone: the draft fits the screen.
  for (const id of [handMade.id, alpha.id, fictional.id]) {
    const group = (await exported()).organizations.find((item) => item.id === id);
    await must(staff.client.rpc("group_map_delete", { p_id: group.id, p_version: group.version }));
  }
  const phone = await open(staff, { width: 390, height: 844, touch: true });
  await phone.page.getByRole("button", { name: "Build automatically" }).click();
  await phone.page.waitForSelector(".gm-draft");
  const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 1, `phone: the draft has no sideways scroll (${overflow}px)`);
  await shot(phone.page, "draft-phone");
  await phone.page.getByRole("button", { name: "Cancel" }).click();
  expect(await phone.page.locator(".gm-draft").count() === 0 && (await exported()).organizations.length === 0, "Cancel closes the draft and saves nothing");
} catch (error) {
  failures += 1;
  console.log(`FAIL ${error.stack?.split("\n").slice(0, 4).join("\n     ")}`);
} finally {
  await browser.close();
  // Leave the stack as it was: no groups.
  const now = await exported();
  for (const link of now.links) await staff.client.rpc("group_map_unlink_name", { p_name: link.name, p_organization_id: link.organization_id });
  for (let pass = 0; pass < 4; pass += 1) {
    for (const group of (await exported()).organizations) {
      await staff.client.rpc("group_map_delete", { p_id: group.id, p_version: group.version });
    }
  }
  console.log(`cleanup: ${(await exported()).organizations.length} groups left`);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
