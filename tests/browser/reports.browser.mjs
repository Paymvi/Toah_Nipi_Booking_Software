// Reports in real Chrome against the fictional mock. See README.md here for how to start both servers.
import assert from "node:assert/strict";
import { ctl, isReady, launch, NEXT, open, sleep, start, stepId, waitForStep, writes } from "./harness.mjs";

await ctl("reset=1&clearWrites=1");
const session = await launch();
const { page } = session;
await open(session, "/reports");

// New layout opens on the Season Brief.
await page.waitForSelector(".season-figure");
assert.match(await page.locator('[role="tab"][aria-selected="true"]').innerText(), /Season Brief/);

// A number opens exactly its records. The mock's stays are all upcoming, so this uses a month row.
await page.getByRole("group", { name: "Measure" }).getByRole("button", { name: "Stays" }).click();
const monthRow = page.locator(".season-table tbody tr").first();
const stayCount = Number(await monthRow.locator("td").nth(2).innerText());
await monthRow.locator(".season-link").click();
assert.equal(await page.locator(".season-drawer .season-record").count(), stayCount);

// A booking opened from the drawer returns to the same tab with the drawer open.
const title = await page.locator(".season-drawer h3").innerText();
await page.locator(".season-drawer .season-record .season-link").first().click();
await page.locator('[data-tutorial-target="booking-back"]').first().click();
await page.waitForSelector(".season-drawer");
assert.equal(await page.locator(".season-drawer h3").innerText(), title);
await page.keyboard.press("Escape");

// The other views render.
await page.getByRole("tab", { name: "Season Map" }).click();
await page.waitForSelector(".season-cell");
await page.getByRole("tab", { name: /Data Check/ }).click();
await page.waitForSelector(".season-check-summary");

// The toggle reaches the original page and remembers it.
await page.getByRole("button", { name: "Original", exact: true }).click();
await page.waitForSelector(".reports-summary-card");
await page.reload();
await page.waitForSelector(".reports-summary-card");
await page.getByRole("button", { name: "New", exact: true }).click();
await page.waitForSelector(".season-tabs");

// The tutorial reaches every step, starting elsewhere so it has to open Reports.
await open(session, "/dashboard");
await start(page, "Read your reports", "demo");
for (const id of ["open-reports", "layout", "views", "figures"]) {
  await waitForStep(page, id);
  while (!(await isReady(page))) await sleep(100);
  await sleep(1000);
  await page.locator(NEXT).click({ force: true });
}
await sleep(500);
assert.equal(await stepId(page), "");

// With no records there are no figures.
await ctl("empty=1");
await open(session, "/reports");
await page.waitForSelector(".season-state");
assert.equal(await page.locator(".season-figure").count(), 0);

assert.deepEqual(session.errors, []);
assert.deepEqual((await writes()).filter((write) => write.includes("/bookings")), []);
await session.browser.close();
await ctl("reset=1");
console.log("Reports browser checks passed");
