/*
  Back and Restart in the new topics, and an unfinished Housing edit left
  alone by the demonstration. See tests/browser/README.md.

  node tests/browser/libraryEdges.browser.mjs
*/
import { dialog, launch, NEXT, open, sleep, start, stepId, target, writes } from "./harness.mjs";

const BACK = ".tg-controls .tg-button:first-child";
const RESTART = '.tg-controls [aria-label="Restart tutorial"]';

async function waitReady(page, id, timeout = 30000) {
  await page.waitForFunction(
    ([id, next]) =>
      document.querySelector(".tg-dialog")?.dataset.tutorialStep === id &&
      document.querySelector(next)?.getAttribute("aria-disabled") !== "true",
    [id, NEXT],
    { timeout }
  );
  await sleep(400);
}

async function nextUntil(page, id) {
  const startedAt = Date.now();
  while ((await stepId(page)) !== id) {
    if (Date.now() - startedAt > 60000) throw new Error(`never reached ${id}, at ${await stepId(page)}: ${await dialog(page)}`);
    if ((await page.locator(NEXT).getAttribute("aria-disabled").catch(() => "true")) !== "true") {
      await page.locator(NEXT).click({ force: true }).catch(() => {});
    }
    await sleep(250);
  }
  await waitReady(page, id);
}

const cases = {
  async "Lodging topic: Back to a building already picked doesn't click it again, Restart starts over"(page) {
    await open(this, "/dashboard");
    await start(page, "Use the Lodging Calendar");
    await nextUntil(page, "lodging.one-building");
    await page.locator(BACK).click();
    await waitReady(page, "lodging.pick-building");
    const title = await page.locator(target("lodging-agenda-title")).innerText();
    if (/All Lodging|Unassigned/.test(title)) throw new Error(`Back undid the building choice: ${title}`);

    await page.locator(RESTART).click();
    await page.waitForFunction(() => document.querySelector(".tg-dialog")?.dataset.tutorialStep === "lodging.open-lodging" || document.querySelector(".tg-dialog")?.dataset.tutorialStep === "lodging.buildings");
    await nextUntil(page, "lodging.buildings");
    if (new URL(page.url()).pathname !== "/lodging-calendar") throw new Error(`restarted on ${page.url()}`);
  },

  async "Calendar read topic: opens the booking from the agenda and comes back to the same month"(page) {
    await open(this, "/dashboard");
    await start(page, "Read the calendar and open a booking");
    await nextUntil(page, "read.agenda");
    const month = await page.locator(target("calendar-title")).innerText();
    await nextUntil(page, "read.back");
    if (!(await page.locator(target("booking-profile")).isVisible())) throw new Error("no booking open");
    // Back to the step before is disabled here: its screen (the agenda) is behind the open booking.
    if ((await page.locator(BACK).getAttribute("aria-disabled")) !== "true") throw new Error("Back should be disabled");
    await page.locator(NEXT).click({ force: true });
    await page.waitForSelector(".tg-complete");
    const after = await page.locator(target("calendar-title")).innerText();
    if (after !== month) throw new Error(`came back to ${after}, not ${month}`);
  },

  async "Housing topic: Back to the room breakdown doesn't close it, and Finish leaves nothing saved"(page) {
    await open(this, "/dashboard");
    await start(page, "Assign housing (Housing tab)");
    await nextUntil(page, "housing.edit");
    await page.locator(BACK).click();
    await waitReady(page, "housing.breakdown");
    if (!(await page.locator(target("housing-breakdown")).first().isVisible())) throw new Error("breakdown closed");
    // The person's own click on Edit Housing is stopped while the demo runs.
    await page.locator(target("housing-actions")).getByRole("button").first().click({ force: true }).catch(() => {});
    await sleep(400);
    if (!/I'm showing you this one/.test(await dialog(page))) throw new Error("click was not stopped");
    await nextUntil(page, "housing.lodging-calendar");
    await page.locator(NEXT).click({ force: true });
    await page.waitForSelector(".tg-complete");
  },
};

let failures = 0;
const filter = process.argv[2];

for (const [name, run] of Object.entries(cases)) {
  if (filter && !name.includes(filter)) continue;
  const session = await launch({ width: 1440, height: 900 });
  try {
    await run.call(session, session.page);
    const leaked = (await writes()).filter((entry) => !entry.includes("/rpc/staff_app_me"));
    if (leaked.length) throw new Error(`writes reached the mock: ${leaked.join("; ")}`);
    if (session.errors.length) throw new Error(session.errors.join(" | ").slice(0, 300));
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}: ${String(error.message).slice(0, 400)}`);
  }
  await session.browser.close();
}

console.log(failures ? `\n${failures} FAILED` : "\nAll edge cases passed.");
process.exit(failures ? 1 : 0);
