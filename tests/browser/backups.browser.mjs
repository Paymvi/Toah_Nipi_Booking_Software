// Backups Minimal/Detailed views in real Chrome against the fictional mock. See README.md here for how to start both servers.
// Full Replace is enabled here but never pressed. Safe Merge runs only against the mock, with its writes stalled.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBackupEnvelope } from "../../src/utils/backupFormat.js";
import { APP, ctl, launch, open, writes } from "./harness.mjs";

const PHRASE = "REPLACE AND RISK PORTAL DATA";
const VIEW_KEY = "toahNipiBackupsView";

const folder = mkdtempSync(join(tmpdir(), "backup-fixtures-"));
const fixture = (name, content) => {
  const path = join(folder, name);
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
};
const booking = (id, status) => ({ id, status, groupName: `Fictional ${id}`, startDate: "2027-03-01", endDate: "2027-03-04" });
const valid = await createBackupEnvelope({ bookings: [booking("b1", "Confirmed"), booking("new-1", "Inquiry")] }, { createdAt: "2026-10-01T15:00:00.000Z" });
const validFile = fixture("fictional-valid.json", valid);
const v1File = fixture("fictional-v1.json", { ...valid, schemaVersion: 1 });
const corruptFile = fixture("fictional-corrupt.json", { ...valid, integrity: { algorithm: "SHA-256", checksum: "0".repeat(64) } });
const notJsonFile = fixture("fictional-not-json.json", "this is not json");

const toggle = (page, name) => page.getByRole("group", { name: "Page view" }).getByRole("button", { name, exact: true });
const pageText = (page) => page.locator(".backups-page").innerText();
const fieldOf = (page, label) => page.locator(`.backup-preview-grid > div:has(small:text-is("${label}")) strong`).first().innerText();
const restoreButton = (page) => page.locator(".backup-restore-footer .backup-primary-button");
const choose = (page, file) => page.locator('.backup-dropzone input[type="file"]').setInputFiles(file);

async function waitForLive(page) {
  await page.waitForSelector(".backups-page");
  await page.waitForFunction(() => document.querySelector(".backup-metric-card strong")?.textContent !== "…");
}

async function readPreview(page) {
  return {
    file: await page.locator(".backup-selected-file-bar strong").innerText(),
    created: await fieldOf(page, "Created"),
    records: await fieldOf(page, "Records"),
    comparison: await page.locator(".backup-comparison-grid").innerText(),
    mode: await page.locator('input[name="backupRestoreMode"]:checked').inputValue(),
  };
}

await ctl("reset=1&clearWrites=1");
const session = await launch();
const { page } = session;
const downloads = [];
page.on("download", (download) => downloads.push(download.suggestedFilename()));
await open(session, "/backup");
await waitForLive(page);

// No saved preference opens Minimal, and only the short copy shows.
assert.equal(await toggle(page, "Minimal").getAttribute("aria-pressed"), "true");
assert.equal(await toggle(page, "Detailed").getAttribute("aria-pressed"), "false");
let text = await pageText(page);
assert.doesNotMatch(text, /Create a portable snapshot|Keep more than one copy|Create a fresh backup/);
assert.match(text, /Uploaded files are not included/);
assert.equal(await page.locator(".backup-disclosure[open]").count(), 0);

// Both choices survive a refresh, and an invalid saved value falls back to Minimal.
await toggle(page, "Detailed").click();
assert.equal(await page.evaluate((key) => localStorage.getItem(key), VIEW_KEY), "detailed");
await page.reload();
await waitForLive(page);
assert.match(await pageText(page), /Create a portable snapshot/);
await toggle(page, "Minimal").click();
await page.reload();
await waitForLive(page);
assert.equal(await toggle(page, "Minimal").getAttribute("aria-pressed"), "true");
await page.evaluate((key) => localStorage.setItem(key, "garbage"), VIEW_KEY);
await page.reload();
await waitForLive(page);
assert.equal(await toggle(page, "Minimal").getAttribute("aria-pressed"), "true");
await page.evaluate((key) => localStorage.removeItem(key), VIEW_KEY);

// Disclosures work by keyboard and stay open across a trip to Detailed.
const included = page.locator(".backup-disclosure", { hasText: "What's included" });
await included.locator("summary").focus();
await page.keyboard.press("Enter");
await page.waitForSelector(".backup-disclosure[open] .backup-coverage-card");
await toggle(page, "Detailed").focus();
await page.keyboard.press("Space");
await page.waitForSelector(".backup-large-action-create");
await toggle(page, "Minimal").focus();
await page.keyboard.press("Enter");
await page.waitForSelector(".backup-disclosure[open] .backup-coverage-card");
await included.locator("summary").click();

// A valid file keeps everything needed in Minimal, and toggling keeps the preview.
await choose(page, validFile);
await page.waitForSelector(".backup-comparison-grid");
text = await pageText(page);
assert.match(text, /fictional-valid\.json/);
assert.match(text, /Backup file passed validation/);
assert.match(text, /Safe Merge/);
assert.match(text, /Full Replace/);
assert.match(text, /Administrators only/);
assert.equal(await page.locator('input[value="replace"]').isDisabled(), true);
assert.match(await page.locator(".backup-comparison-grid").innerText(), /NEW FROM BACKUP\s+1/i);
assert.doesNotMatch(text, /Backup contents by status/);
const preview = await readPreview(page);
await toggle(page, "Detailed").click();
await page.waitForSelector(".backup-preview-statuses");
assert.deepEqual(await readPreview(page), preview);
await toggle(page, "Minimal").click();
assert.deepEqual(await readPreview(page), preview);
await page.locator(".backup-restore-workspace .backup-disclosure summary").click();
await page.waitForSelector(".backup-disclosure[open] .backup-preview-statuses");
assert.match(await page.locator(".backup-restore-workspace .backup-disclosure").innerText(), /Verified/);
await page.locator('[aria-label="Remove selected backup"]').click();

// Warnings and errors stay visible in Minimal.
await choose(page, v1File);
await page.waitForSelector(".backup-validation-list-warning");
assert.match(await page.locator(".backup-validation-list-warning").innerText(), /version 1 backup/);
await page.locator('[aria-label="Remove selected backup"]').click();
await choose(page, corruptFile);
await page.waitForSelector(".backup-validation-list-error");
assert.match(await page.locator(".backup-validation-list-error").innerText(), /integrity check failed/);
assert.equal(await page.locator(".backup-restore-options").count(), 0);
await toggle(page, "Detailed").click();
assert.match(await page.locator(".backup-validation-list-error").innerText(), /integrity check failed/);
await toggle(page, "Minimal").click();
await page.locator('[aria-label="Remove selected backup"]').click();
await choose(page, notJsonFile);
await page.waitForSelector(".backup-validation-list-error");
assert.match(await page.locator(".backup-validation-list-error").innerText(), /not valid JSON/);
await page.locator('[aria-label="Remove selected backup"]').click();

// Toggling during Create Backup does not interrupt it or start another.
await ctl("delay=900");
await page.locator(".backups-hero-actions .backup-primary-button").click();
await toggle(page, "Detailed").click();
await toggle(page, "Minimal").click();
assert.match(await page.locator(".backups-hero-actions .backup-primary-button").innerText(), /Creating Backup/);
await page.waitForSelector(".backup-notice-success, .backup-notice-warning");
await ctl("delay=0");
assert.equal(downloads.length, 1);

// Only the mock's Dev Mode check is answered here; it doesn't touch the password path.
await page.route("**/functions/v1/verify-dev-mode", (route) => route.fulfill({
  status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"valid":true}',
}));
await ctl("role=admin");
await page.reload();
await waitForLive(page);
await choose(page, validFile);
await page.waitForSelector(".backup-comparison-grid");
assert.match(await pageText(page), /Available only in Dev Mode/);
assert.equal(await page.locator('input[value="replace"]').isDisabled(), true);
await page.locator('[aria-label="Remove selected backup"]').click();
await page.getByRole("switch", { name: "Dev Mode" }).click();
await page.locator(".dev-mode-dialog input").fill("fictional");
await page.getByRole("button", { name: "Enable Dev Mode" }).click();
await page.getByRole("switch", { name: "Dev Mode", checked: true }).waitFor();
await waitForLive(page);

// Full Replace keeps its whole warning and phrase gate; toggling keeps what was typed.
await choose(page, validFile);
await page.waitForSelector(".backup-comparison-grid");
await page.locator('input[name="backupRestoreMode"][value="merge"]').focus();
await page.keyboard.press("ArrowDown");
await page.waitForSelector(".backup-danger-confirmation");
assert.equal(await page.locator('input[value="replace"]').isChecked(), true);
const warning = await page.locator(".backup-danger-confirmation-heading").innerText();
assert.match(warning, /Every current booking is deleted first/);
assert.match(warning, /safety backup/);
assert.match(warning, /automatic rollback/);
const phrase = page.locator(".backup-danger-confirmation input");
await phrase.fill(PHRASE.slice(0, -1));
assert.equal(await restoreButton(page).isDisabled(), true);
await toggle(page, "Detailed").click();
assert.equal(await phrase.inputValue(), PHRASE.slice(0, -1));
assert.equal(await restoreButton(page).isDisabled(), true);
assert.equal(await page.locator(".backup-danger-confirmation-heading").innerText(), warning);
await toggle(page, "Minimal").click();
await phrase.fill(PHRASE);
assert.equal(await restoreButton(page).isDisabled(), false);
await toggle(page, "Detailed").click();
await toggle(page, "Minimal").click();
assert.equal(await phrase.inputValue(), PHRASE);
assert.match(await restoreButton(page).innerText(), /Replace Database From Backup/);

// Back to Safe Merge clears the phrase as before. Nothing has been written yet.
await page.locator('.backup-mode-card:has(input[value="merge"])').click();
assert.equal(await page.locator(".backup-danger-confirmation").count(), 0);
await page.locator('.backup-mode-card:has(input[value="replace"])').click();
assert.equal(await phrase.inputValue(), "");
await page.locator('.backup-mode-card:has(input[value="merge"])').click();
assert.deepEqual((await writes()).filter((write) => write.includes("/bookings")), []);

// Toggling during a mock Safe Merge keeps its progress on screen.
let release;
const stalled = new Promise((resolve) => (release = resolve));
await page.route("**/rest/v1/bookings*", async (route) => {
  if (route.request().method() !== "GET") await stalled;
  return route.fallback();
});
await restoreButton(page).click();
await page.waitForSelector(".backup-progress-card");
await toggle(page, "Detailed").click();
assert.equal(await page.locator(".backup-progress-card").count(), 1);
await toggle(page, "Minimal").click();
assert.equal(await page.locator(".backup-progress-card").count(), 1);
assert.match(await restoreButton(page).innerText(), /Restoring/);
release();
await page.waitForFunction(() => !document.querySelector(".backup-progress-card"), null, { timeout: 15000 });
await page.unroute("**/rest/v1/bookings*");

// Roles: a staff account can't reach Replace in Dev Mode, and a viewer can't restore at all.
await ctl("reset=1&clearWrites=1");
await page.reload();
await waitForLive(page);
await page.getByRole("switch", { name: "Dev Mode" }).click();
await page.locator(".dev-mode-dialog input").fill("fictional");
await page.getByRole("button", { name: "Enable Dev Mode" }).click();
await page.getByRole("switch", { name: "Dev Mode", checked: true }).waitFor();
await waitForLive(page);
await choose(page, validFile);
await page.waitForSelector(".backup-comparison-grid");
assert.match(await pageText(page), /Administrators only/);
assert.equal(await page.locator('input[value="replace"]').isDisabled(), true);
await ctl("role=viewer");
await page.reload();
await waitForLive(page);
await choose(page, validFile);
await page.waitForSelector(".backup-comparison-grid");
assert.equal(await restoreButton(page).isDisabled(), true);

assert.deepEqual((await writes()).filter((write) => write.includes("/bookings")), []);
assert.deepEqual(session.errors.filter((error) => !/Backup restore failed|Could not/.test(error)), []);
await session.browser.close();

// Blocked storage still opens Minimal, and the toggle works for the visit.
const blocked = await launch({ width: 390, height: 844 });
await blocked.context.addInitScript((key) => {
  const { getItem, setItem } = Storage.prototype;
  Storage.prototype.getItem = function (name) {
    if (name === key) throw new Error("blocked");
    return getItem.call(this, name);
  };
  Storage.prototype.setItem = function (name, value) {
    if (name === key) throw new Error("blocked");
    return setItem.call(this, name, value);
  };
}, VIEW_KEY);
await open(blocked, "/backup");
await waitForLive(blocked.page);
assert.equal(await toggle(blocked.page, "Minimal").getAttribute("aria-pressed"), "true");
await toggle(blocked.page, "Detailed").click();
assert.match(await pageText(blocked.page), /Create a portable snapshot/);
assert.equal(await blocked.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
assert.deepEqual(blocked.errors, []);
await blocked.browser.close();

await ctl("reset=1");
console.log(`Backups browser checks passed against ${APP}`);
