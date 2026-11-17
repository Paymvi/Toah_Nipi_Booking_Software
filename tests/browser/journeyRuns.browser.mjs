/*
  Runs "From Guest Inquiry to Guest Portal" and each of its topics, generated
  from the registry. For every step it checks the role label and the
  gnome's outfit, that previews can't be used, and placement; afterwards,
  that nothing reached the mock and the booking form is blank again.
  See tests/browser/README.md.

  node tests/browser/journeyRuns.browser.mjs [--only=<tutorial id>] [--sizes=1440x900,390x800]
                                             [--theme=night] [--reduced] [--slow] [--touch]
*/
import { GUEST_JOURNEY_TOPICS, GUEST_JOURNEY_TUTORIAL } from "../../src/tutorial/inquiryJourneyTutorial.js";
import { STEP_ROLES } from "../../src/tutorial/tutorialCore.js";
import { ctl, dialog, launch, NEXT, open, sleep, start, stepId, writes } from "./harness.mjs";

const arg = (name) => process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split("=")[1];
const flag = (name) => process.argv.includes(`--${name}`);
const sizes = (arg("sizes") || "1440x900,1024x700,390x800").split(",").map((size) => size.split("x").map(Number));
const only = arg("only");

// Reads the dialogue once the step's reading time has started (the timer bar shows).
function readStep(page) {
  return page.evaluate(() => {
    const box = document.querySelector(".tg-dialog");
    if (!box || !document.querySelector(".tg-demo-timer")) return null;
    const rect = box.getBoundingClientRect();
    const spot = document.querySelector(".tg-spotlight")?.getBoundingClientRect();
    let covered = 0;
    // A target taller than half the screen can't fit beside a docked dialogue; it only needs its top in view.
    if (spot && spot.height < innerHeight / 2) {
      const width = Math.min(rect.right, spot.right) - Math.max(rect.left, spot.left);
      const height = Math.min(rect.bottom, spot.bottom) - Math.max(rect.top, spot.top);
      covered = width > 0 && height > 0 ? (width * height) / (spot.width * spot.height) : 0;
    }
    const controls = box.querySelector(".tg-controls")?.getBoundingClientRect();
    return {
      id: box.dataset.tutorialStep,
      role: box.querySelector(".tg-role strong")?.textContent ?? "",
      note: box.querySelector(".tg-role span")?.textContent ?? "",
      gnome: [...(box.querySelector(".tg-dialog-gnome")?.classList ?? [])].find((name) => name.startsWith("tg-gnome-role-")) ?? "",
      preview: Boolean(box.querySelector(".tg-preview, .tg-preview-roles, .tg-preview-journey")),
      previewControls: box.querySelectorAll(".tg-dialog-body :is(.tg-preview, .tg-preview-roles, .tg-preview-journey) :is(button, input, a, textarea, select)").length,
      offScreen: rect.top < 0 || rect.left < 0 || rect.bottom > innerHeight + 1 || rect.right > innerWidth + 1,
      controlsOffScreen: !controls || controls.bottom > innerHeight + 1,
      sideways: document.documentElement.scrollWidth > innerWidth + 1,
      spot: Boolean(spot),
      covered,
    };
  });
}

async function drive(page, tutorial) {
  const steps = Object.fromEntries(tutorial.steps.map((step) => [step.id, step]));
  const seen = [];
  const problems = [];
  const startedAt = Date.now();

  while (Date.now() - startedAt < 900000) {
    if (await page.locator(".tg-complete").isVisible()) return { seen, problems };

    const text = await dialog(page);
    if (/can't find|didn't work/.test(text)) throw new Error(`stuck at ${await stepId(page)}: ${text}`);

    const shown = await readStep(page);
    const step = shown && steps[shown.id];
    if (!step) {
      await sleep(120);
      continue;
    }

    if (seen.at(-1) !== shown.id) {
      seen.push(shown.id);
      // Let the target finish scrolling into view before measuring, as portalRuns does; re-measure a slow one.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await sleep(600);
        const settled = await readStep(page);
        if (!settled || settled.id !== shown.id) break;
        Object.assign(shown, settled);
        if (settled.covered <= 0.4 && (settled.spot || !step.target)) break;
      }
      if (process.env.TRACE) console.log("   ", shown.id, shown.role);
      const expected = STEP_ROLES[step.role];
      const where = shown.id;
      if (shown.role !== expected.label) problems.push(`${where}: label "${shown.role}"`);
      if (expected.note && !shown.note.includes(expected.note)) problems.push(`${where}: missing role note`);
      if (shown.gnome !== `tg-gnome-role-${step.role}`) problems.push(`${where}: gnome ${shown.gnome}`);
      if (Boolean(step.preview) !== shown.preview) problems.push(`${where}: preview ${shown.preview}`);
      if (shown.previewControls) problems.push(`${where}: preview has controls`);
      if (shown.offScreen) problems.push(`${where}: dialogue off screen`);
      if (shown.controlsOffScreen) problems.push(`${where}: controls off screen`);
      if (shown.sideways) problems.push(`${where}: page scrolls sideways`);
      if (step.target && !shown.spot) problems.push(`${where}: no spotlight`);
      if (!step.target && shown.spot) problems.push(`${where}: spotlight on a preview step`);
      if (shown.covered > 0.4) problems.push(`${where}: dialogue covers ${Math.round(shown.covered * 100)}% of the target`);
    }

    if ((await page.locator(NEXT).getAttribute("aria-disabled").catch(() => "true")) !== "true" && (await stepId(page)) === shown.id) {
      await page.locator(NEXT).click({ force: true }).catch(() => {});
    }
    await sleep(200);
  }

  throw new Error(`timed out after ${seen.at(-1)}`);
}

await ctl("reset=1");
if (flag("slow")) await ctl("delay=1500");
let failures = 0;

for (const [width, height] of sizes) {
  for (const tutorial of [GUEST_JOURNEY_TUTORIAL, ...GUEST_JOURNEY_TOPICS]) {
    if (only && tutorial.id !== only) continue;

    const session = await launch({ width, height, reducedMotion: flag("reduced") ? "reduce" : "no-preference", touch: flag("touch") });
    const { page, context, errors, requests } = session;
    const label = `${width}x${height}${arg("theme") ? ` ${arg("theme")}` : ""}${flag("slow") ? " slow" : ""} ${tutorial.id}`;

    try {
      if (arg("theme")) await context.addInitScript((theme) => localStorage.setItem("toahNipiTheme", theme), arg("theme"));
      if (flag("slow")) {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
      }
      await open(session, "/dashboard");
      await ctl("clearWrites=1");
      requests.length = 0; // only what happens during the tutorial counts
      await start(page, tutorial.title);
      const { seen, problems } = await drive(page, tutorial);

      const expected = tutorial.steps.filter((step) => !step.prep).length;
      const counted = seen.filter((id) => !tutorial.steps.find((step) => step.id === id).prep).length;
      if (counted !== expected) problems.push(`saw ${counted} of ${expected} steps (missed ${tutorial.steps.filter((step) => !step.prep && !seen.includes(step.id)).map((step) => step.id).join(" ")})`);

      // Finished: the fictional scene and the prefilled form are gone.
      await page.locator(".tg-complete .tg-button-primary").click();
      await sleep(600);
      await page.evaluate(() => {
        history.pushState({}, "", "/form");
        dispatchEvent(new PopStateEvent("popstate"));
      });
      await page.waitForSelector('[data-tutorial-target~="booking-form-details"]');
      await sleep(400);
      if (await page.locator('[data-tutorial-target~="booking-form-prefill"]').count()) problems.push("prefilled form left behind");
      if (await page.locator(".tg-runner").count()) problems.push("runner still mounted");
      if (arg("theme") && (await page.evaluate(() => document.documentElement.dataset.theme)) !== arg("theme")) problems.push("theme not applied");

      // staff_app_me is a read-only RPC the app calls as it loads (a POST, so the mock logs it).
      const leaked = (await writes()).filter((entry) => !entry.includes("/rpc/staff_app_me"));
      const demoCalls = requests.filter((entry) => !entry.startsWith("GET") && !/auth|current_staff_role|staff_app_me/.test(entry));
      if (leaked.length) problems.push(`writes reached the mock: ${leaked.join("; ")}`);
      if (demoCalls.length) problems.push(`requests: ${demoCalls.join("; ")}`);
      if (requests.some((entry) => entry.startsWith("BLOCKED"))) problems.push("tried to leave localhost");
      if (errors.length) problems.push(errors.join(" | ").slice(0, 300));

      if (problems.length) failures += 1;
      console.log(`${problems.length ? "FAIL" : "ok  "} ${label} (${counted} steps)${problems.length ? `\n     ${problems.join("\n     ")}` : ""}`);
    } catch (error) {
      failures += 1;
      console.log(`FAIL ${label}: ${String(error.message).slice(0, 300)} | ${await dialog(page)}`);
    }

    await session.browser.close();
    await sleep(50);
  }
}

if (flag("slow")) await ctl("delay=0");
console.log(failures ? `\n${failures} FAILED` : "\nAll runs passed.");
process.exit(failures ? 1 : 0);
