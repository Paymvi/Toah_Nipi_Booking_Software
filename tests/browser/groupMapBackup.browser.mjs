// Group Map in the Backups screen, real Chrome against a LOCAL Supabase stack
// (fictional data, real database functions). Nothing leaves localhost.
// Uses Merge only; Full Replace is covered by supabase/tests/group-map-backup.local.mjs.
//
//   LOCAL_SUPABASE_URL=... LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... LOCAL_SEEDER_KEY=... \
//   APP_URL=http://localhost:5341 node tests/browser/groupMapBackup.browser.mjs [--shots=folder]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

import { getChecksumPayload } from "../../src/utils/backupFormat.js";

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
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "gm-backup-"));

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

const email = `gmb-ui-${run}@example.test`;
const { user } = await must(authAdmin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }));
await must(seed.from("staff_profiles").insert({ user_id: user.id, email, full_name: "Fictional Backup Admin", role: "admin", is_active: true }));
const api = createClient(url, process.env.LOCAL_ANON_KEY, options);
await must(api.auth.signInWithPassword({ email, password: PASSWORD }));

const ours = [];
const make = async (label, parentId = null) => {
  const row = await must(api.rpc("group_map_create", { p_name: `Fictional ${label} ${run}`, p_parent_id: parentId }));
  ours.push(row.id);
  return row;
};
const root = await make("Backup Fellowship");
const child = await make("Backup Chapter", root.id);
// For the conflict step: a subgroup with its own subgroup, each with a linked name.
const team = await make("Backup Youth Team", root.id);
const crew = await make("Backup Youth Crew", team.id);
const linked = new Set((await must(api.rpc("group_map_export"))).links.map((item) => item.name));
const freeNames = [...new Set((await must(api.from("bookings").select("organization_name"))).map((row) => row.organization_name))]
  .filter((value) => !linked.has(value) && !/^Host/.test(value));
if (freeNames.length < 3) throw new Error("The stack needs three fictional booking names that no group has linked yet.");
const [bookingName, teamName, crewName] = freeNames;
await must(api.rpc("group_map_link_name", { p_name: bookingName, p_organization_id: child.id }));
await must(api.rpc("group_map_link_name", { p_name: teamName, p_organization_id: team.id }));
await must(api.rpc("group_map_link_name", { p_name: crewName, p_organization_id: crew.id }));
const current = async (id) => (await must(api.from("organizations").select("*").eq("id", id)))[0];

const sha = (text) => createHash("sha256").update(text).digest("hex");
const writeFile = (name, backup) => {
  const file = path.join(folder, name);
  fs.writeFileSync(file, JSON.stringify(backup));
  return file;
};
// A file edited on purpose, with its checksum recomputed so only the Group Map rules can catch it.
const resealed = (backup) => ({ ...backup, integrity: { ...backup.integrity, checksum: sha(JSON.stringify(getChecksumPayload(backup))) } });

const browser = await chromium.launch({ executablePath: CHROME });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await context.route("**/*", (route) => {
    const target = new URL(route.request().url());
    return ["localhost", "127.0.0.1"].includes(target.hostname) || target.protocol === "data:" ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${APP}/backup`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForSelector(".backups-page");
  await page.waitForFunction(() => document.querySelector(".backup-metric-card strong")?.textContent !== "…");

  await page.locator(".backup-disclosure", { hasText: "What's included" }).locator("summary").click();
  expect(/Group Map groups, their parent organizations and linked booking names/.test(await page.locator(".backup-coverage-card").innerText()),
    "What's included lists the Group Map");

  // 1. A manual backup holds the tree.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Create Backup Now" }).click()]);
  const backupPath = path.join(folder, "manual.json");
  await download.saveAs(backupPath);
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  const mine = backup.payload.organizations.filter((group) => ours.includes(group.id));
  expect(backup.schemaVersion === 5 && mine.length === 4 && mine.find((group) => group.id === child.id)?.parent_id === root.id &&
    mine.find((group) => group.id === crew.id)?.parent_id === team.id,
    "Create Backup Now saves groups with their parent (version 5)");
  expect(backup.payload.organizationNameLinks.some((item) => item.name === bookingName && item.organization_id === child.id), "…and their linked names");
  expect(/Group Map groups with \d+ linked names/.test(await page.locator(".backup-notice").first().innerText()), "the backup message counts the Group Map");

  // 2. Someone deletes the chapter; the preview says restoring adds it back, and Merge does.
  await must(api.rpc("group_map_unlink_name", { p_name: bookingName, p_organization_id: child.id }));
  await must(api.rpc("group_map_delete", { p_id: child.id, p_version: child.version }));
  // The preview compares with the current Group Map, read again on Refresh Status.
  await page.getByRole("button", { name: "Refresh Status" }).click();
  await page.waitForFunction(() => document.querySelector(".backup-metric-card strong")?.textContent !== "…");
  await page.locator('.backup-dropzone input[type="file"]').setInputFiles(backupPath);
  const card = page.locator('[data-backup-group-map="compare"]');
  const olderCard = page.locator('[data-backup-group-map="older"]');
  await card.getByText("Groups to add").waitFor();
  const cardText = await card.innerText();
  expect(/Groups to add\s+1/i.test(cardText) && /Linked names to add\s+1/i.test(cardText), `preview: 1 group and 1 linked name to add`);
  expect(/only added to, in Merge and in Full Replace alike/.test(cardText) && /Nothing current is changed or deleted/.test(cardText),
    "preview: says restoring only adds, in both modes, and changes nothing current");
  expect(/Edits made since this backup are not undone/.test(cardText), "preview: says edits since the backup are not undone");
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await card.screenshot({ path: path.join(SHOTS, "backup-group-map-preview.png") });
  }
  await page.locator(".backup-restore-footer .backup-primary-button").click();
  await page.locator(".backup-notice", { hasText: "Backup merged" }).waitFor({ timeout: 60000 });
  const result = await page.locator(".backup-notice", { hasText: "Backup merged" }).innerText();
  expect(/Group Map: 1 group and 1 linked name added/.test(result), "Merge result reports the Group Map");
  const after = await must(api.rpc("group_map_export"));
  expect(after.organizations.some((group) => group.id === child.id && group.parent_id === root.id) &&
    after.links.some((item) => item.name === bookingName && item.organization_id === child.id), "the chapter and its link are back, under the same parent");
  if (SHOTS) await page.locator(".backup-notice", { hasText: "Backup merged" }).screenshot({ path: path.join(SHOTS, "backup-group-map-result.png") });

  // 3. An older (version 4) file: warning, no Group Map card.
  const { organizations, organizationNameLinks, ...olderPayload } = backup.payload;
  void organizations;
  void organizationNameLinks;
  const v4 = resealed({ ...backup, schemaVersion: 4, payload: olderPayload });
  const chooseAgain = async (file) => {
    if (await page.getByLabel("Remove selected backup").count()) await page.getByLabel("Remove selected backup").click();
    await page.locator('.backup-dropzone input[type="file"]').setInputFiles(file);
  };
  await chooseAgain(writeFile("v4.json", v4));
  await page.getByText("Backup file passed validation").waitFor();
  const v4Text = await page.locator(".backups-page").innerText();
  expect(/made before the Group Map was backed up.*leaves the current groups, parents and linked names exactly as they are/s.test(v4Text), "older file: warns the Group Map is left as it is");
  expect(await card.count() === 0, "older file: no Group Map comparison");
  expect(/Restoring it, in Merge or Full Replace,\s+leaves every current group, parent and linked name exactly as it is/.test(await olderCard.innerText()),
    "older file: the Group Map card says current groups stay exactly as they are");

  // 4. A file whose link points at a group it doesn't contain is refused before anything changes.
  const broken = resealed({ ...backup, payload: { ...backup.payload, organizationNameLinks: [...backup.payload.organizationNameLinks, { name: "Fictional ghost", organization_id: "00000000-0000-4000-8000-000000000999" }] } });
  await chooseAgain(writeFile("broken.json", broken));
  await page.getByText("This backup cannot be restored").waitFor();
  expect(/point to a group that is not in the backup/.test(await page.locator(".backup-validation-list-error").innerText()), "broken file: the Group Map problem is named and restore is blocked");
  expect(await page.locator(".backup-restore-footer .backup-primary-button").count() === 0 ||
    await page.locator(".backup-restore-footer .backup-primary-button").isDisabled(), "broken file: no restore button");

  // 5. Conflicts. Since the backup: the youth team and its crew were deleted, a different group with the
  // team's name (other case) was made under the same parent and given the team's booking name, and the
  // top organization was renamed. Restoring must skip, explain, and change nothing current.
  for (const [name, group] of [[crewName, crew], [teamName, team]]) {
    await must(api.rpc("group_map_unlink_name", { p_name: name, p_organization_id: group.id }));
  }
  for (const group of [crew, team]) await must(api.rpc("group_map_delete", { p_id: group.id, p_version: (await current(group.id)).version }));
  const impostor = await make("backup youth team", root.id);
  await must(api.rpc("group_map_link_name", { p_name: teamName, p_organization_id: impostor.id }));
  const renamedRoot = `Fictional Backup Fellowship Renamed ${run}`;
  await must(api.rpc("group_map_rename", { p_id: root.id, p_version: (await current(root.id)).version, p_name: renamedRoot }));
  const before = await must(api.rpc("group_map_export"));

  await page.getByRole("button", { name: "Refresh Status" }).click();
  await page.waitForFunction(() => document.querySelector(".backup-metric-card strong")?.textContent !== "…");
  await chooseAgain(backupPath);
  await card.getByText("Groups to add").waitFor();
  const conflictCard = await card.innerText();
  const expectedLines = [
    `Group "${team.name}" was not added because a current group at that level already has this name. Groups are never merged automatically.`,
    `Group "${crew.name}" was not added because its parent organization was not restored.`,
    `"${crewName}" was not linked because its group was not restored.`,
    `"${teamName}" is already linked to "${impostor.name}"; that link is kept.`,
    `Group "${root.name}" already exists here as "${renamedRoot}" with different details; the current version is kept.`,
  ];
  expect(/Groups to add\s+0/i.test(conflictCard) && /Linked names to add\s+0/i.test(conflictCard), "conflict preview: nothing to add");
  for (const line of expectedLines) expect(conflictCard.includes(line), `conflict preview lists: ${line.slice(0, 70)}…`);
  if (SHOTS) await card.screenshot({ path: path.join(SHOTS, "backup-group-map-conflicts-preview.png") });

  await page.locator(".backup-restore-footer .backup-primary-button").click();
  const conflictNotice = page.locator(".backup-notice", { hasText: "Backup merged" });
  await conflictNotice.waitFor({ timeout: 60000 });
  const conflictResult = await conflictNotice.innerText();
  expect(/Group Map: 0 groups and 0 linked names added, \d+ already here and left as they are, 3 not added and 2 kept in their current form/.test(conflictResult),
    "conflict result: counts skipped and kept items");
  const details = await conflictNotice.locator(".backup-notice-details li").allInnerTexts();
  for (const line of expectedLines) expect(details.includes(line), `conflict result lists: ${line.slice(0, 70)}…`);
  expect(await conflictNotice.evaluate((element) => element.classList.contains("backup-notice-warning")), "conflict result is a warning, not a plain success");
  if (SHOTS) await conflictNotice.screenshot({ path: path.join(SHOTS, "backup-group-map-conflicts-result.png") });

  const afterConflicts = await must(api.rpc("group_map_export"));
  expect(JSON.stringify(afterConflicts) === JSON.stringify(before), "the Group Map is exactly as it was before the restore");
  expect(!afterConflicts.organizations.some((group) => group.id === team.id || group.id === crew.id), "no duplicate team or crew");

  expect(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} catch (error) {
  failures += 1;
  console.log(`FAIL ${error.stack?.split("\n").slice(0, 4).join("\n     ")}`);
} finally {
  await browser.close();
  const now = await must(api.rpc("group_map_export"));
  for (const item of now.links.filter((entry) => ours.includes(entry.organization_id))) {
    await api.rpc("group_map_unlink_name", { p_name: item.name, p_organization_id: item.organization_id });
  }
  for (let pass = 0; pass < 4; pass += 1) {
    for (const id of [...ours].reverse()) {
      const { data } = await api.from("organizations").select("*").eq("id", id);
      if (data?.[0]) await api.rpc("group_map_delete", { p_id: id, p_version: data[0].version });
    }
  }
  const { data: left } = await api.from("organizations").select("id").in("id", ours);
  console.log(`cleanup: ${left?.length ?? "?"} test groups left`);
  fs.rmSync(folder, { recursive: true, force: true });
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
