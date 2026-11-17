// Cross-tab storage events in real Chrome against the fictional mock. See README.md here for how to start both servers.
// A change saved in one tab's local storage (theme, filters, views) must not make other tabs reload every booking,
// and hiding an Inquiry Spreadsheet row must still work and reach other staff through the shared table.
import assert from "node:assert/strict";
import { APP, ctl, launch, open, sleep, writes } from "./harness.mjs";

await ctl("reset=1&inquiry=1");
const session = await launch();
const { context, page: tabA, errors } = session;

const bookingLoads = [];
tabA.on("request", (request) => {
  if (request.method() === "GET" && new URL(request.url()).pathname === "/rest/v1/bookings") bookingLoads.push(request.url());
});

let failures = 0;
async function check(name, body) {
  try {
    await body();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${String(error?.message || error).split("\n").slice(0, 6).join("\n     ")}`);
  }
}

await open(session, "/dashboard");
await tabA.waitForFunction(() => !document.querySelector(".dashboard-loading-screen"));
await tabA.evaluate(() => {
  window.__storageEvents = 0;
  window.addEventListener("storage", () => (window.__storageEvents += 1));
});
const loadsAfterOpen = bookingLoads.length;

const tabB = await context.newPage();
await tabB.goto(`${APP}/dashboard`);
await tabB.waitForSelector(".tg-launcher");

await check("settings saved in another tab do not reload this tab's bookings", async () => {
  assert.ok(loadsAfterOpen >= 1, "the first load happened");
  // The real theme control, then other stored preferences the app writes.
  await tabB.getByRole("group", { name: "Color theme" }).locator("label").last().click();
  await tabB.evaluate(() => {
    localStorage.setItem("toahNipiBackupsView", "detailed");
    localStorage.setItem("toahNipiDashboardActionCenter", "expanded");
    localStorage.setItem("toahNipiInquirySpreadsheetDeletedRows", "[]");
  });
  await sleep(1500);
  const delivered = await tabA.evaluate(() => window.__storageEvents);
  assert.ok(delivered >= 3, `tab A received the storage events (${delivered})`);
  assert.equal(bookingLoads.length, loadsAfterOpen, "no booking reload in tab A");
});

await check("no alert or error appears in the other tab", async () => {
  const dialogs = [];
  const record = (dialog) => {
    dialogs.push(dialog.message());
    dialog.dismiss();
  };
  tabA.on("dialog", record);
  await tabB.evaluate(() => localStorage.setItem("toahNipiTheme", "light"));
  await sleep(800);
  tabA.off("dialog", record);
  assert.deepEqual(dialogs, []);
  assert.deepEqual(errors, []);
});

const deleteButton = (page) => page.getByRole("button", { name: "Delete Fictional Inquiry Group row" });

await check("hiding an inquiry row still works and is shared with other tabs", async () => {
  await tabA.goto(`${APP}/inquiry-spreadsheet`);
  await deleteButton(tabA).waitFor();
  tabA.once("dialog", (dialog) => dialog.accept());
  await deleteButton(tabA).click();
  await deleteButton(tabA).waitFor({ state: "detached" });
  assert.ok((await writes()).some((entry) => entry.startsWith("POST /rest/v1/inquiry_hidden")), "saved to the shared table");

  await tabA.reload();
  await tabA.waitForSelector(".tg-launcher");
  await sleep(1000);
  assert.equal(await deleteButton(tabA).count(), 0, "still hidden after a reload");

  await tabB.goto(`${APP}/inquiry-spreadsheet`);
  await tabB.waitForSelector(".tg-launcher");
  await sleep(1000);
  assert.equal(await deleteButton(tabB).count(), 0, "hidden for the other tab too");
});

await session.browser.close();
await ctl("reset=1");
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
