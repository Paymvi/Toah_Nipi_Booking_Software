/*
  Runs the booking and calendar walkthroughs, each of their topics, and
  every mini tutorial, generated from the registry. Checks the library
  groups the mini tutorials, that a topic finishes at its own end, that a
  topic works when started from another screen, placement, console errors,
  and that nothing reached the mock. See tests/browser/README.md.

  node tests/browser/libraryRuns.browser.mjs [--only=<tutorial id>] [--sizes=1440x900,390x800]
*/
import { BOOKING_TOPICS, BOOKING_WALKTHROUGH } from "../../src/tutorial/bookingTutorial.js";
import { CALENDAR_TOPICS, CALENDAR_WALKTHROUGH } from "../../src/tutorial/calendarTutorial.js";
import { MINI_CATEGORY, MINI_TUTORIALS } from "../../src/tutorial/miniTutorials.js";
import { checkPlacement, ctl, dialog, launch, NEXT, open, openLibrary, sleep, start, stepId, writes } from "./harness.mjs";

const arg = (name) => process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split("=")[1];
const sizes = (arg("sizes") || "1440x900,390x800").split(",").map((size) => size.split("x").map(Number));
const only = arg("only");

// Topics also started from a screen that isn't theirs, including pages that reuse the same components.
const ELSEWHERE = { "calendar/lodging": "/hosting", "calendar/availability": "/calendar", "calendar/read": "/lodging-calendar", "booking-housing": "/calendar" };

// Mini tutorial steps whose target the mock's data can't show; Skip is the expected way past them.
const MAY_BE_MISSING = new Set(["inquiry-sheet-actions"]);

async function drive(page, tutorial) {
  const seen = [];
  const placement = [];
  const skipped = [];
  const steps = Object.fromEntries(tutorial.steps.map((step) => [step.id, step]));
  const startedAt = Date.now();

  while (Date.now() - startedAt < 600000) {
    if (await page.locator(".tg-complete").isVisible()) return { seen, placement, skipped };

    const id = await stepId(page);
    const step = steps[id];
    const text = await dialog(page);
    if (/can't find/.test(text) && step && MAY_BE_MISSING.has([step.target].flat()[0]) && !skipped.includes(id)) {
      skipped.push(id);
      await page.locator(NEXT).click({ force: true }).catch(() => {});
      await sleep(300);
      continue;
    }
    if (/can't find|didn't work/.test(text)) throw new Error(`stuck at ${id}: ${text}`);
    if (!step || (await page.locator(".tg-pointer").count()) === 0) {
      await sleep(120);
      continue;
    }

    if (seen.at(-1) !== id) {
      await sleep(500);
      seen.push(id);
      if (process.env.TRACE) console.log("   ", id);
      const problem = await checkPlacement(page);
      if (problem) placement.push(`${id}: ${problem}`);
    }

    if ((await page.locator(NEXT).getAttribute("aria-disabled").catch(() => "true")) !== "true" && (await stepId(page)) === id) {
      await page.locator(NEXT).click({ force: true }).catch(() => {});
    }
    await sleep(200);
  }

  throw new Error(`timed out after ${seen.at(-1)}`);
}

async function checkLibrary(page) {
  await openLibrary(page);
  const group = page.locator(".tg-group");
  const problems = [];
  if ((await group.count()) !== 1) problems.push("no single mini tutorial group");
  if ((await group.locator("summary strong").innerText()) !== MINI_CATEGORY) problems.push("group name differs");
  if (await group.getAttribute("open") !== null) problems.push("group starts open");
  await group.locator("summary").click();
  for (const title of ["Contacts", "Reports", "Master Spreadsheet", "Inquiry Spreadsheet", "Hosting (internal use)"]) {
    if (!(await group.getByText(title, { exact: true }).isVisible())) problems.push(`${title} not in the group`);
  }
  // The guest journey stays the last row, after the group.
  const rows = await page.locator(".tg-list > li").evaluateAll((items) => items.map((item) => item.innerText.split("\n")[0]));
  if (!/Guest Inquiry/.test(rows.at(-1))) problems.push(`last row is ${rows.at(-1)}`);
  if (!rows.includes(MINI_CATEGORY)) problems.push("group missing from the list order");
  await page.keyboard.press("Escape");
  return problems;
}

await ctl("reset=1");
let failures = 0;
const flags = [];

const runs = [BOOKING_WALKTHROUGH, ...BOOKING_TOPICS, CALENDAR_WALKTHROUGH, ...CALENDAR_TOPICS, ...MINI_TUTORIALS].flatMap((tutorial) => [
  { tutorial, from: "/dashboard" },
  ...(ELSEWHERE[tutorial.id] ? [{ tutorial, from: ELSEWHERE[tutorial.id] }] : []),
]);

for (const [width, height] of sizes) {
  {
    const session = await launch({ width, height });
    await open(session, "/dashboard");
    const problems = await checkLibrary(session.page);
    if (problems.length) failures += 1;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${width}x${height} library${problems.length ? ` ${problems.join(" / ")}` : ""}`);
    await session.browser.close();
  }

  for (const { tutorial, from } of runs) {
    if (only && tutorial.id !== only) continue;

    const session = await launch({ width, height });
    const { page, errors, requests } = session;
    const label = `${width}x${height} ${tutorial.id} from ${from}`;

    try {
      await open(session, from);
      await page.evaluate(() => {
        window.__shown = new Set();
        setInterval(() => {
          const id = document.querySelector(".tg-dialog")?.dataset.tutorialStep;
          if (id && document.querySelector(".tg-pointer")) window.__shown.add(id);
        }, 40);
      });
      await start(page, tutorial.title);
      const { placement, skipped } = await drive(page, tutorial);
      const seen = await page.evaluate(() => [...window.__shown]);

      const leaked = (await writes()).filter((entry) => !entry.includes("/rpc/staff_app_me"));
      // Steps that only apply to some screens (when) and setup steps aren't required. A click that was
      // already done (e.g. Month view when the calendar is on Month) is passed by, and listed.
      const required = tutorial.steps.filter((step) => !step.prep && !step.when && !skipped.includes(step.id));
      const missed = required.filter((step) => !seen.includes(step.id) && !step.demoClick).map((step) => step.id);
      const passedBy = required.filter((step) => !seen.includes(step.id) && step.demoClick).map((step) => step.id);
      const conditional = tutorial.steps.filter((step) => step.when && seen.includes(step.id)).map((step) => step.id);
      const finish = await page.locator(".tg-complete").innerText();
      const demoCalls = requests.filter((entry) => !entry.startsWith("GET") && !/auth|current_staff_role|staff_app_me/.test(entry));

      const problems = [
        leaked.length && `writes reached the mock: ${leaked.join("; ")}`,
        missed.length && `missed ${missed.join(" ")}`,
        tutorial.parentId && !/Continue the full walkthrough/.test(finish) && "topic didn't finish at its own end",
        demoCalls.length && `made requests: ${demoCalls.join("; ")}`,
        requests.some((entry) => entry.startsWith("BLOCKED")) && "tried to leave localhost",
        errors.length && errors.join(" | ").slice(0, 300),
      ].filter(Boolean);

      placement.forEach((entry) => flags.push(`${label} ${entry}`));
      if (problems.length) failures += 1;
      const notes = [
        conditional.length && `when: ${conditional.join(" ")}`,
        skipped.length && `skipped: ${skipped.join(" ")}`,
        passedBy.length && `already done: ${passedBy.join(" ")}`,
      ].filter(Boolean);
      console.log(`${problems.length ? "FAIL" : "ok  "} ${label} (${seen.length} shown)${notes.length ? ` [${notes.join("; ")}]` : ""}${problems.length ? ` ${problems.join(" / ")}` : ""}`);
    } catch (error) {
      failures += 1;
      console.log(`FAIL ${label}: ${String(error.message).slice(0, 300)} | ${await dialog(page)}`);
    }

    await session.browser.close();
    await sleep(50);
  }
}

console.log(flags.length ? `\nPlacement flags:\n${flags.join("\n")}` : "\nNo placement flags.");
console.log(failures ? `\n${failures} FAILED` : "\nAll runs passed.");
process.exit(failures ? 1 : 0);
