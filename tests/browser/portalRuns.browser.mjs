/*
  Runs the portal walkthrough and every topic at several
  screen sizes, generated from the registry so a new section is covered
  automatically. See tests/browser/README.md.

  node tests/browser/portalRuns.browser.mjs [--only=<topic id>] [--sizes=1440x900,390x800]
*/
import { PORTAL_TOPICS, PORTAL_WALKTHROUGH } from "../../src/tutorial/portalTutorial.js";
import { checkPlacement, ctl, dialog, launch, NEXT, open, sleep, start, stepId, writes } from "./harness.mjs";

const arg = (name) => process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split("=")[1];
const sizes = (arg("sizes") || "1440x900,1024x700,390x800").split(",").map((size) => size.split("x").map(Number));
const only = arg("only");

async function drive(page, tutorial) {
  const seen = [];
  const placement = [];
  const steps = Object.fromEntries(tutorial.steps.map((step) => [step.id, step]));
  const startedAt = Date.now();

  while (Date.now() - startedAt < 1200000) {
    if (await page.locator(".tg-complete").isVisible()) return { seen, placement };

    const id = await stepId(page);
    const step = steps[id];
    const text = await dialog(page);
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

    if (await page.locator(NEXT).getAttribute("aria-disabled").catch(() => "true") !== "true" && (await stepId(page)) === id) {
      await page.locator(NEXT).click({ force: true }).catch(() => {});
    }
    await sleep(200);
  }

  throw new Error(`timed out after ${seen.at(-1)}`);
}

await ctl("reset=1");
let failures = 0;
const flags = [];

for (const [width, height] of sizes) {
  for (const tutorial of [PORTAL_WALKTHROUGH, ...PORTAL_TOPICS]) {
    if (only && tutorial.id !== only) continue;

    {
      const session = await launch({ width, height });
      const { page, errors, requests } = session;
      const label = `${width}x${height} ${tutorial.id}`;

      try {
        await open(session, "/dashboard");
        // Sampled in the page: under load the driver can press Next just as a step changes, so it can't count steps itself.
        await page.evaluate(() => {
          window.__shown = new Set();
          setInterval(() => {
            const id = document.querySelector(".tg-dialog")?.dataset.tutorialStep;
            if (id && document.querySelector(".tg-pointer")) window.__shown.add(id);
          }, 40);
        });
        await start(page, tutorial.title);
        const { placement } = await drive(page, tutorial);
        const seen = await page.evaluate(() => [...window.__shown]);

        const leaked = await writes();
        const expected = tutorial.steps.filter((step) => !step.prep).length;
        const counted = seen.filter((id) => !tutorial.steps.find((step) => step.id === id).prep).length;
        if (process.env.TRACE && counted !== expected) console.log("    missed:", tutorial.steps.filter((step) => !step.prep && !seen.includes(step.id)).map((step) => step.id).join(" "));
        const demoCalls = requests.filter((entry) => !entry.startsWith("GET") && !/auth|current_staff_role/.test(entry));

        const problems = [
          leaked.length && `writes reached the mock: ${leaked.join("; ")}`,
          counted !== expected && `saw ${counted} of ${expected} steps`,
          demoCalls.length && `demo made requests: ${demoCalls.join("; ")}`,
          requests.some((entry) => entry.startsWith("BLOCKED")) && "tried to leave localhost",
          errors.length && errors.join(" | ").slice(0, 300),
        ].filter(Boolean);

        placement.forEach((entry) => flags.push(`${label} ${entry}`));
        if (problems.length) failures += 1;
        console.log(`${problems.length ? "FAIL" : "ok  "} ${label} (${counted} steps)${problems.length ? ` ${problems.join(" / ")}` : ""}`);
      } catch (error) {
        failures += 1;
        console.log(`FAIL ${label}: ${String(error.message).slice(0, 300)} | ${await dialog(page)}`);
      }

      await session.browser.close();
      await sleep(50);
    }
  }
}

console.log(flags.length ? `\nPlacement flags:\n${flags.join("\n")}` : "\nNo placement flags.");
console.log(failures ? `\n${failures} FAILED` : "\nAll runs passed.");
process.exit(failures ? 1 : 0);
