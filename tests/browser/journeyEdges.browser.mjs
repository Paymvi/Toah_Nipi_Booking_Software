/*
  Edge cases for "From Guest Inquiry to Guest Portal": pausing on the
  fictional screens, ending part-way, Back across a role change, Restart,
  rapid clicks, leaving the page, and resuming after a reload.
  See tests/browser/README.md. Changes the mock's write log, so run it alone.

  node tests/browser/journeyEdges.browser.mjs [name filter]
*/
import { ctl, dialog, launch, NEXT, open, sleep, start, stepId, target, waitForStep, writes } from "./harness.mjs";

const filter = process.argv[2] || "";
const results = [];
// The step's own label; the overview preview also contains role labels.
const role = (page) => page.locator(".tg-dialog-body > .tg-role strong").innerText().catch(() => "");
// staff_app_me is a read-only RPC the app calls as it loads (a POST, so the mock logs it).
const realWrites = async () => (await writes()).filter((entry) => !entry.includes("/rpc/staff_app_me"));
const gnome = (page) => page.locator(".tg-dialog-gnome").getAttribute("class").catch(() => "");
const ready = (page) => page.waitForFunction((next) => document.querySelector(next)?.getAttribute("aria-disabled") !== "true", NEXT);

// Presses Next until the given step is showing.
async function nextUntil(page, id, limit = 60) {
  for (let count = 0; count < limit; count += 1) {
    if ((await stepId(page)) === id) return waitForStep(page, id);
    await ready(page);
    await page.locator(NEXT).click({ force: true });
    await sleep(350);
  }
  throw new Error(`never reached ${id}, stuck at ${await stepId(page)}`);
}

async function check(name, fn, size = {}) {
  if (!name.toLowerCase().includes(filter.toLowerCase())) return;
  await ctl("reset=1");
  const session = await launch(size);
  try {
    await open(session, "/dashboard");
    await ctl("clearWrites=1");
    await fn(session);
    const leaked = await realWrites();
    if (leaked.length) throw new Error(`writes reached the mock: ${leaked.join("; ")}`);
    if (session.errors.length) throw new Error(session.errors.join(" | ").slice(0, 300));
    results.push(`ok   ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${String(error.message).replace(/\s+/g, " ").slice(0, 900)} | ${await dialog(session.page)}`);
  }
  await session.browser.close();
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

await check("pausing on the fictional request keeps Decline and Save Guest Group locked", async ({ page }) => {
  await start(page, "From Guest Inquiry to Guest Portal");
  await nextUntil(page, "review.decline");
  await page.locator(".tg-controls").getByRole("button", { name: "Pause" }).click();
  // Dispatched: the paused bar sits over the review's footer (a known layout limit), and the guard is what's tested here.
  await page.locator(target("inquiry-decline")).dispatchEvent("click");
  await page.locator(".guest-request-danger-button").dispatchEvent("click");
  await sleep(400);
  assert(/fictional/.test(await page.locator(".tg-paused").innerText()), "no fictional-demo note after Confirm Decline");
  assert((await page.locator(".guest-request-column-declined .guest-request-card").count()) === 1, "the request moved to Declined");

  await page.getByRole("button", { name: "Resume" }).click();
  await nextUntil(page, "booking.save");
  await page.locator(".tg-controls").getByRole("button", { name: "Pause" }).click();
  await page.locator(`${target("booking-form-save")} button[type="submit"]`).dispatchEvent("click");
  await sleep(400);
  assert(/fictional/.test(await page.locator(".tg-paused").innerText()), "Save Guest Group was not refused");
});

await check("ending part-way puts back the real screens and a blank booking form", async ({ page }) => {
  await start(page, "Turn the request into a booking");
  await nextUntil(page, "booking.prefill");
  await page.locator(".tg-dialog").getByRole("button", { name: "End tutorial" }).click();
  await page.waitForSelector(".tg-launcher-bubble");
  assert(/fictional group is gone/.test(await page.locator(".tg-launcher-bubble").innerText()), "no 'fictional group is gone' message");
  await page.waitForURL(/\/dashboard$/);

  await page.locator(target("nav-form")).click();
  await page.waitForSelector(target("booking-form-details"));
  assert((await page.locator(target("booking-form-prefill")).count()) === 0, "prefilled form left behind");
  await page.locator(target("nav-guest-inquiries")).click();
  await page.waitForSelector(".guest-request-board");
  assert(!(await page.locator(".guest-request-board").innerText()).includes("Community Bible Church"), "fictional request left on the real screen");
});

await check("Back across a role change keeps each step's own role, and Restart starts at the overview", async ({ page }) => {
  await start(page, "From Guest Inquiry to Guest Portal");
  await nextUntil(page, "portal.theirs");
  assert((await role(page)) === "STAFF ACTION" && (await gnome(page)).includes("role-staff"), "portal.theirs is not staff");
  await ready(page);
  await page.locator('.tg-controls .tg-button:has-text("Back")').click();
  await waitForStep(page, "portal.sign");
  assert((await role(page)) === "GROUP LEADER ACTION" && (await gnome(page)).includes("role-leader"), "Back lost the group leader role");
  assert((await dialog(page)).includes("on their own device"), "group leader note missing");
  await ready(page);
  await page.locator('.tg-controls .tg-button:has-text("Back")').click();
  await waitForStep(page, "portal.documents");
  assert((await role(page)) === "GROUP LEADER ACTION", "second Back lost the role");

  await page.getByRole("button", { name: "Restart tutorial" }).click();
  await waitForStep(page, "intro");
  assert((await role(page)) === "STAFF ACTION", "restart role");
});

await check("rapid clicks move one step at a time and never skip opening the prefilled form", async ({ page }) => {
  // Sampled in the page, so every step that showed is recorded in order.
  await page.evaluate(() => {
    window.__shown = [];
    setInterval(() => {
      const box = document.querySelector(".tg-dialog");
      const id = box?.dataset.tutorialStep;
      if (id && window.__shown.at(-1) !== id) window.__shown.push(id);
      if (/can't find|didn't work/.test(box?.textContent ?? "")) window.__lost = id;
    }, 30);
  });
  await start(page, "Turn the request into a booking");
  await page.waitForFunction(() => document.querySelector(".tg-dialog")?.dataset.tutorialStep === "booking.open-form");
  for (let count = 0; count < 12; count += 1) {
    await page.locator(NEXT).click({ force: true }).catch(() => {});
    await sleep(40);
  }
  await sleep(3000);

  const shown = await page.evaluate(() => window.__shown);
  const lost = await page.evaluate(() => window.__lost);
  const order = ["booking.open-form", "booking.prefill", "booking.check", "booking.save", "booking.back", "booking.converted", "booking.portal-link"];
  const after = shown.slice(shown.indexOf("booking.open-form"));
  assert(!lost, `lost at ${lost}`);
  assert(after.length >= 2, "rapid clicks did nothing");
  after.forEach((id, index) => assert(id === order[index], `expected ${order[index]} but saw ${id} (${after.join(" > ")})`));
});

await check("leaving the demo's pages while paused ends it", async ({ page }) => {
  await start(page, "Review the request in Guest Inquiries");
  await waitForStep(page, "review.board");
  await page.locator(".tg-controls").getByRole("button", { name: "Pause" }).click();
  await page.locator(".sidebar-link", { hasText: "Contacts" }).click();
  await page.waitForSelector(".tg-launcher-bubble");
  assert((await page.locator(".tg-runner, .tg-paused").count()) === 0, "tutorial still running");
});

await check("resuming after a reload restarts the section, from any page", async ({ page }) => {
  await start(page, "From Guest Inquiry to Guest Portal");
  await nextUntil(page, "booking.check");
  await page.goto(page.url().replace(/\/[^/]*$/, "/dashboard"));
  await page.waitForSelector(".tg-launcher");
  await sleep(700);
  await page.getByRole("button", { name: /Tutorial gnome/ }).click();
  await page.locator(".tg-resume").getByRole("button", { name: "Resume" }).click();
  await waitForStep(page, "booking.open-form");
  await nextUntil(page, "booking.prefill");
});

await check("phone: the group leader steps fit, and Next stays reachable", async ({ page }) => {
  await start(page, "The group leader uses the portal");
  for (const id of ["portal.open", "portal.submit", "portal.documents", "portal.sign"]) {
    await waitForStep(page, id);
    const box = await page.locator(".tg-dialog").boundingBox();
    const next = await page.locator(NEXT).boundingBox();
    assert(box.y >= 0 && box.y + box.height <= 800 && next.y + next.height <= 800, `${id} off screen`);
    assert((await role(page)) === "GROUP LEADER ACTION", `${id} role`);
    await ready(page);
    await page.locator(NEXT).click({ force: true });
  }
}, { width: 390, height: 800, touch: true });

console.log(results.join("\n"));
const failed = results.filter((line) => line.startsWith("FAIL")).length;
console.log(failed ? `\n${failed} FAILED` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
